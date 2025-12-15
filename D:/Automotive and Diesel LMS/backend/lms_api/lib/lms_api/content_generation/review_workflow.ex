defmodule LmsApi.ContentGeneration.ReviewWorkflow do
  @moduledoc """
  Review Workflow module for collaborative content review and approval processes.

  This module manages the review cycle for content drafts, allowing multiple reviewers
  to provide feedback, track changes, and approve content before publication.
  """

  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  alias LmsApi.Repo
  alias LmsApi.ContentGeneration.ContentDraft
  alias LmsApi.Accounts.User

  schema "review_workflows" do
    field :status, :string, default: "pending"  # pending, in_review, approved, rejected, revisions_requested
    field :review_type, :string, default: "peer_review"  # peer_review, expert_review, sme_review
    field :priority, :string, default: "normal"  # low, normal, high, urgent
    field :due_date, :utc_datetime
    field :review_notes, :string
    field :approval_criteria, :map, default: %{}  # Custom approval rules
    field :metadata, :map, default: %{}

    belongs_to :content_draft, ContentDraft
    belongs_to :requested_by, User
    belongs_to :approved_by, User

    has_many :review_assignments, LmsApi.ContentGeneration.ReviewAssignment
    has_many :review_comments, LmsApi.ContentGeneration.ReviewComment

    timestamps()
  end

  @doc """
  Changeset for creating/updating review workflows.
  """
  def changeset(workflow, attrs) do
    workflow
    |> cast(attrs, [
      :status,
      :review_type,
      :priority,
      :due_date,
      :review_notes,
      :approval_criteria,
      :metadata,
      :content_draft_id,
      :requested_by_id,
      :approved_by_id
    ])
    |> validate_required([:content_draft_id, :requested_by_id])
    |> validate_inclusion(:status, ["pending", "in_review", "approved", "rejected", "revisions_requested"])
    |> validate_inclusion(:review_type, ["peer_review", "expert_review", "sme_review", "automated_review"])
    |> validate_inclusion(:priority, ["low", "normal", "high", "urgent"])
    |> foreign_key_constraint(:content_draft_id)
    |> foreign_key_constraint(:requested_by_id)
    |> foreign_key_constraint(:approved_by_id)
  end

  @doc """
  Creates a new review workflow.
  """
  def create(attrs) do
    %__MODULE__{}
    |> changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a workflow by id.
  """
  def update(workflow_id, attrs) do
    case Repo.get(__MODULE__, workflow_id) do
      nil -> {:error, :not_found}
      workflow ->
        workflow
        |> changeset(attrs)
        |> Repo.update()
    end
  end

  @doc """
  Submits a content draft for review.
  """
  def submit_for_review(draft_id, reviewer_ids, options \\ %{}) do
    # Create workflow
    workflow_attrs = Map.merge(options, %{
      content_draft_id: draft_id,
      requested_by_id: options[:requested_by_id] || get_draft_creator(draft_id),
      status: "pending"
    })

    case create(workflow_attrs) do
      {:ok, workflow} ->
        # Create review assignments
        assignments = Enum.map(reviewer_ids, fn reviewer_id ->
          %{
            review_workflow_id: workflow.id,
            reviewer_id: reviewer_id,
            status: "pending",
            assigned_at: DateTime.utc_now()
          }
        end)

        # Bulk insert assignments
        Repo.insert_all(LmsApi.ContentGeneration.ReviewAssignment, assignments)

        # Update workflow status
        __MODULE__.update(workflow.id, %{status: "in_review"})

        {:ok, workflow}

      error -> error
    end
  end

  @doc """
  Gets review workflow by ID with full details.
  """
  def get_by_id(id) do
    Repo.one(
      from w in __MODULE__,
      where: w.id == ^id,
      preload: [
        :content_draft,
        :requested_by,
        :approved_by,
        review_assignments: [:reviewer],
        review_comments: [:author]
      ]
    )
  end

  @doc """
  Updates workflow status.
  """
  def update_status(workflow_id, new_status, attrs \\ %{}) do
    update_attrs = Map.put(attrs, :status, new_status)

    case new_status do
      "approved" -> Map.put(update_attrs, :approved_by_id, attrs[:approved_by_id])
      "rejected" -> update_attrs
      _ -> update_attrs
    end

    __MODULE__.update(workflow_id, update_attrs)
  end

  @doc """
  Adds a reviewer to the workflow.
  """
  def add_reviewer(workflow_id, reviewer_id) do
    assignment_attrs = %{
      review_workflow_id: workflow_id,
      reviewer_id: reviewer_id,
      status: "pending",
      assigned_at: DateTime.utc_now()
    }

    Repo.insert(LmsApi.ContentGeneration.ReviewAssignment, assignment_attrs)
  end

  @doc """
  Gets pending reviews for a user.
  """
  def get_pending_reviews(user_id) do
    Repo.all(
      from w in __MODULE__,
      join: a in LmsApi.ContentGeneration.ReviewAssignment,
      on: w.id == a.review_workflow_id,
      join: d in ContentDraft,
      on: w.content_draft_id == d.id,
      join: p in LmsApi.ContentGeneration.ContentPlan,
      on: d.content_plan_id == p.id,
      where: a.reviewer_id == ^user_id and a.status == "pending",
      select: %{
        workflow_id: w.id,
        draft_id: d.id,
        plan_title: p.title,
        draft_title: d.title,
        priority: w.priority,
        due_date: w.due_date,
        assigned_at: a.assigned_at
      }
    )
  end

  @doc """
  Submits a review for a workflow.
  """
  def submit_review(workflow_id, reviewer_id, review_data) do
    # Update assignment status
    assignment = Repo.get_by(LmsApi.ContentGeneration.ReviewAssignment, %{
      review_workflow_id: workflow_id,
      reviewer_id: reviewer_id
    })

    if assignment do
      # Update assignment
      Repo.update(Ecto.Changeset.change(assignment, %{
        status: "completed",
        completed_at: DateTime.utc_now()
      }))

      # Add review comment
      comment_attrs = %{
        review_workflow_id: workflow_id,
        author_id: reviewer_id,
        comment_type: "review",
        content: review_data["comments"] || "",
        rating: review_data["rating"],
        metadata: review_data
      }

      Repo.insert(LmsApi.ContentGeneration.ReviewComment, comment_attrs)

      # Check if all reviews are complete
      check_workflow_completion(workflow_id)

      {:ok, :review_submitted}
    else
      {:error, :assignment_not_found}
    end
  end

  @doc """
  Requests revisions for a draft.
  """
  def request_revisions(workflow_id, revision_notes, requested_by_id) do
    update_status(workflow_id, "revisions_requested", %{
      review_notes: revision_notes,
      approved_by_id: requested_by_id
    })
  end

  @doc """
  Approves a workflow.
  """
  def approve_workflow(workflow_id, approved_by_id, approval_notes \\ "") do
    update_status(workflow_id, "approved", %{
      approved_by_id: approved_by_id,
      review_notes: approval_notes
    })
  end

  @doc """
  Rejects a workflow.
  """
  def reject_workflow(workflow_id, rejected_by_id, rejection_reason) do
    update_status(workflow_id, "rejected", %{
      approved_by_id: rejected_by_id,
      review_notes: rejection_reason
    })
  end

  @doc """
  Gets workflow statistics.
  """
  def get_statistics(user_id \\ nil) do
    base_query = from w in __MODULE__

    query = if user_id do
      from w in base_query,
      join: a in LmsApi.ContentGeneration.ReviewAssignment,
      on: w.id == a.review_workflow_id,
      where: a.reviewer_id == ^user_id
    else
      base_query
    end

    stats = Repo.one(
      from w in subquery(query),
      select: %{
        total_workflows: count(w.id),
        pending_reviews: count(fragment("CASE WHEN ? = 'pending' THEN 1 END", w.status)),
        in_review: count(fragment("CASE WHEN ? = 'in_review' THEN 1 END", w.status)),
        approved: count(fragment("CASE WHEN ? = 'approved' THEN 1 END", w.status)),
        rejected: count(fragment("CASE WHEN ? = 'rejected' THEN 1 END", w.status)),
        revisions_requested: count(fragment("CASE WHEN ? = 'revisions_requested' THEN 1 END", w.status))
      }
    )

    # Calculate average review time
    avg_review_time = Repo.one(
      from a in LmsApi.ContentGeneration.ReviewAssignment,
      where: not is_nil(a.completed_at),
      select: avg(fragment("EXTRACT(EPOCH FROM (? - ?))", a.completed_at, a.assigned_at))
    ) || 0

    Map.put(stats, :avg_review_time_hours, avg_review_time / 3600)
  end

  @doc """
  Gets overdue reviews.
  """
  def get_overdue_reviews() do
    Repo.all(
      from w in __MODULE__,
      join: a in LmsApi.ContentGeneration.ReviewAssignment,
      on: w.id == a.review_workflow_id,
      where: w.status == "in_review" and
             not is_nil(w.due_date) and
             w.due_date < ^DateTime.utc_now() and
             a.status == "pending",
      select: %{
        workflow_id: w.id,
        draft_title: fragment("SELECT title FROM content_drafts WHERE id = ?", w.content_draft_id),
        reviewer_id: a.reviewer_id,
        days_overdue: fragment("EXTRACT(day FROM ? - ?)", ^DateTime.utc_now(), w.due_date)
      }
    )
  end

  # Private functions

  defp get_draft_creator(draft_id) do
    case Repo.get(ContentDraft, draft_id) do
      nil -> nil
      draft -> draft.created_by_id
    end
  end

  defp check_workflow_completion(workflow_id) do
    # Check if all assignments are complete
    pending_count =
      from(a in LmsApi.ContentGeneration.ReviewAssignment,
        where: a.review_workflow_id == ^workflow_id and a.status == "pending"
      )
      |> Repo.aggregate(:count, :id)

    if pending_count == 0 do
      # All reviews complete - could auto-approve or notify coordinator
      # For now, just mark as ready for decision
      workflow = Repo.get(__MODULE__, workflow_id)
      if workflow && workflow.status == "in_review" do
        # Notify workflow coordinator that reviews are complete
        LmsApi.Notifications.notify_workflow_complete(workflow_id)
      end
    end
  end
end
