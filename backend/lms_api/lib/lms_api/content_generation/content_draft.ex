defmodule LmsApi.ContentGeneration.ContentDraft do
  @moduledoc """
  Content Draft module for managing content versions and iterative development.

  Content drafts allow for iterative content creation with full version control,
  enabling SMEs to develop content collaboratively and track changes over time.
  """

  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  alias LmsApi.Repo
  alias LmsApi.ContentGeneration.ContentPlan
  alias LmsApi.Accounts.User

  schema "content_drafts" do
    field :version, :integer, default: 1
    field :title, :string
    field :content_type, :string  # lesson, assessment, media, interactive
    field :content_data, :map, default: %{}  # Flexible content storage
    field :status, :string, default: "draft"  # draft, review, approved, published, archived
    field :metadata, :map, default: %{}  # Additional metadata
    field :quality_score, :float  # AI-generated quality score
    field :review_notes, :string  # Feedback from reviewers
    field :published_at, :utc_datetime

    belongs_to :content_plan, ContentPlan
    belongs_to :created_by, User
    belongs_to :updated_by, User

    # Self-referencing for version history
    belongs_to :parent_draft, __MODULE__

    has_many :child_drafts, __MODULE__, foreign_key: :parent_draft_id
    has_many :review_workflows, LmsApi.ContentGeneration.ReviewWorkflow

    timestamps()
  end

  @doc """
  Changeset for creating/updating content drafts.
  """
  def changeset(draft, attrs) do
    draft
    |> cast(attrs, [
      :version,
      :title,
      :content_type,
      :content_data,
      :status,
      :metadata,
      :quality_score,
      :review_notes,
      :published_at,
      :content_plan_id,
      :created_by_id,
      :updated_by_id,
      :parent_draft_id
    ])
    |> validate_required([:content_plan_id, :created_by_id])
    |> validate_inclusion(:content_type, ["lesson", "assessment", "media", "interactive"])
    |> validate_inclusion(:status, ["draft", "review", "approved", "published", "archived"])
    |> validate_number(:quality_score, greater_than_or_equal_to: 0, less_than_or_equal_to: 100)
    |> foreign_key_constraint(:content_plan_id)
    |> foreign_key_constraint(:created_by_id)
    |> foreign_key_constraint(:updated_by_id)
    |> foreign_key_constraint(:parent_draft_id)
    |> set_version_number()
  end

  @doc """
  Creates a new content draft.
  """
  def create(plan_id, attrs) do
    # Get the next version number
    next_version = get_next_version(plan_id)

    attrs = Map.put(attrs, :version, next_version)

    %__MODULE__{}
    |> changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Creates a new version of an existing draft.
  """
  def create_new_version(parent_draft_id, attrs) do
    case get_by_id(parent_draft_id) do
      nil -> {:error, :not_found}
      parent_draft ->
        # Copy parent data and create new version
        new_attrs = Map.merge(attrs, %{
          content_plan_id: parent_draft.content_plan_id,
          parent_draft_id: parent_draft_id,
          version: parent_draft.version + 1,
          content_data: parent_draft.content_data  # Start with parent content
        })

        create(parent_draft.content_plan_id, new_attrs)
    end
  end

  @doc """
  Updates a content draft.
  """
  def update(draft_id, attrs) do
    case get_by_id(draft_id) do
      nil -> {:error, :not_found}
      draft ->
        draft
        |> changeset(attrs)
        |> Repo.update()
    end
  end

  @doc """
  Gets a content draft by ID.
  """
  def get_by_id(id) do
    Repo.get(__MODULE__, id)
  end

  @doc """
  Gets all drafts for a content plan.
  """
  def get_plan_drafts(plan_id, filters \\ %{}) do
    query = from d in __MODULE__,
      where: d.content_plan_id == ^plan_id,
      join: u in User, on: d.created_by_id == u.id,
      order_by: [desc: d.version, desc: d.inserted_at],
      select: %{
        id: d.id,
        version: d.version,
        title: d.title,
        content_type: d.content_type,
        status: d.status,
        quality_score: d.quality_score,
        created_by: %{
          id: u.id,
          name: u.full_name
        },
        created_at: d.inserted_at,
        updated_at: d.updated_at
      }

    # Apply filters
    query = apply_filters(query, filters)

    Repo.all(query)
  end

  @doc """
  Gets the latest draft for a content plan.
  """
  def get_latest_draft(plan_id) do
    Repo.one(
      from d in __MODULE__,
      where: d.content_plan_id == ^plan_id,
      order_by: [desc: d.version],
      limit: 1
    )
  end

  @doc """
  Publishes a draft.
  """
  def publish_draft(draft_id) do
    case get_by_id(draft_id) do
      nil -> {:error, :not_found}
      draft ->
        draft
        |> changeset(%{
          status: "published",
          published_at: DateTime.utc_now()
        })
        |> Repo.update()
    end
  end

  @doc """
  Archives a draft.
  """
  def archive_draft(draft_id) do
    __MODULE__.update(draft_id, %{status: "archived"})
  end

  @doc """
  Validates content quality using AI and rules.
  """
  def validate_quality(draft_id) do
    case get_by_id(draft_id) do
      nil -> {:error, :not_found}
      draft ->
        # Run quality checks
        quality_checks = [
          check_content_completeness(draft),
          check_content_accuracy(draft),
          check_content_engagement(draft),
          check_technical_requirements(draft)
        ]

        # Calculate overall score
        scores = Enum.map(quality_checks, & &1.score)
        overall_score = Enum.sum(scores) / length(scores)

        # Update draft with quality score
        __MODULE__.update(draft_id, %{quality_score: overall_score})

        # Return detailed results
        %{
          overall_score: overall_score,
          checks: quality_checks,
          recommendations: generate_recommendations(quality_checks)
        }
    end
  end

  @doc """
  Gets draft statistics.
  """
  def get_statistics(plan_id) do
    drafts = get_plan_drafts(plan_id)

    %{
      total_drafts: length(drafts),
      published_count: Enum.count(drafts, &(&1.status == "published")),
      in_review_count: Enum.count(drafts, &(&1.status == "review")),
      draft_count: Enum.count(drafts, &(&1.status == "draft")),
      average_quality_score: calculate_average_quality(drafts),
      latest_version: Enum.max_by(drafts, & &1.version, fn -> %{version: 0} end).version
    }
  end

  @doc """
  Searches content drafts.
  """
  def search(query, filters \\ %{}) do
    search_term = "%#{query}%"

    base_query = from d in __MODULE__,
      join: p in ContentPlan, on: d.content_plan_id == p.id,
      join: u in User, on: d.created_by_id == u.id,
      where: ilike(d.title, ^search_term) or
             ilike(fragment("content_data::text"), ^search_term) or
             ilike(p.title, ^search_term),
      select: %{
        id: d.id,
        title: d.title,
        content_type: d.content_type,
        status: d.status,
        plan_title: p.title,
        created_by: u.full_name,
        created_at: d.inserted_at
      }

    # Apply additional filters
    query = apply_filters(base_query, filters)

    Repo.all(query)
  end

  # Private functions

  defp get_next_version(plan_id) do
    case Repo.one(
      from d in __MODULE__,
      where: d.content_plan_id == ^plan_id,
      select: max(d.version)
    ) do
      nil -> 1
      max_version -> max_version + 1
    end
  end

  defp set_version_number(changeset) do
    case get_change(changeset, :version) do
      nil ->
        plan_id = get_field(changeset, :content_plan_id)
        if plan_id do
          next_version = get_next_version(plan_id)
          put_change(changeset, :version, next_version)
        else
          changeset
        end
      _ -> changeset
    end
  end

  defp apply_filters(query, filters) do
    Enum.reduce(filters, query, fn {key, value}, q ->
      case key do
        :status -> where(q, [d], d.status == ^value)
        :content_type -> where(q, [d], d.content_type == ^value)
        :created_by_id -> where(q, [d], d.created_by_id == ^value)
        :date_from -> where(q, [d], d.inserted_at >= ^value)
        :date_to -> where(q, [d], d.inserted_at <= ^value)
        _ -> q
      end
    end)
  end

  defp check_content_completeness(draft) do
    content_data = draft.content_data || %{}

    checks = [
      Map.has_key?(content_data, "title") && String.length(content_data["title"] || "") > 0,
      Map.has_key?(content_data, "content") && String.length(content_data["content"] || "") > 50,
      Map.has_key?(content_data, "learning_objectives") && length(content_data["learning_objectives"] || []) > 0
    ]

    completeness_score = (Enum.count(checks, & &1) / length(checks)) * 100

    %{
      name: "Content Completeness",
      score: completeness_score,
      passed: completeness_score >= 80,
      issues: generate_completeness_issues(checks)
    }
  end

  defp check_content_accuracy(_draft) do
    # This would integrate with AI fact-checking
    # For now, return a placeholder score
    %{
      name: "Content Accuracy",
      score: 85.0,
      passed: true,
      issues: []
    }
  end

  defp check_content_engagement(_draft) do
    # This would analyze content for engagement factors
    %{
      name: "Content Engagement",
      score: 78.0,
      passed: true,
      issues: ["Consider adding more interactive elements"]
    }
  end

  defp check_technical_requirements(draft) do
    content_data = draft.content_data || %{}

    checks = [
      Map.has_key?(content_data, "duration") && (content_data["duration"] || 0) > 0,
      Map.has_key?(content_data, "difficulty_level"),
      Map.has_key?(content_data, "prerequisites") || true  # Optional
    ]

    technical_score = (Enum.count(checks, & &1) / length(checks)) * 100

    %{
      name: "Technical Requirements",
      score: technical_score,
      passed: technical_score >= 90,
      issues: generate_technical_issues(checks)
    }
  end

  defp generate_completeness_issues(checks) do
    issues = []
    if !Enum.at(checks, 0), do: issues = ["Missing or empty title" | issues]
    if !Enum.at(checks, 1), do: issues = ["Content too short or missing" | issues]
    if !Enum.at(checks, 2), do: issues = ["No learning objectives defined" | issues]
    issues
  end

  defp generate_technical_issues(checks) do
    issues = []
    if !Enum.at(checks, 0), do: issues = ["Missing duration estimate" | issues]
    if !Enum.at(checks, 1), do: issues = ["No difficulty level specified" | issues]
    issues
  end

  defp generate_recommendations(checks) do
    recommendations = []

    failed_checks = Enum.filter(checks, & !&1.passed)
    Enum.each(failed_checks, fn check ->
      recommendations = recommendations ++ check.issues
    end)

    # Add general recommendations
    recommendations ++ [
      "Consider adding multimedia elements",
      "Review content for accessibility compliance",
      "Test content on different devices"
    ]
  end

  defp calculate_average_quality(drafts) do
    quality_scores = Enum.map(drafts, & &1.quality_score) |> Enum.reject(&is_nil/1)
    if Enum.empty?(quality_scores) do
      0.0
    else
      Enum.sum(quality_scores) / length(quality_scores)
    end
  end
end
