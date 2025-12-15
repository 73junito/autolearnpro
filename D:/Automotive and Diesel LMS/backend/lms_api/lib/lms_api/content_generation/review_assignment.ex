defmodule LmsApi.ContentGeneration.ReviewAssignment do
  @moduledoc """
  Review Assignment schema for tracking individual reviewer assignments.
  """

  use Ecto.Schema
  import Ecto.Changeset

  alias LmsApi.Repo
  alias LmsApi.ContentGeneration.ReviewWorkflow
  alias LmsApi.Accounts.User

  schema "review_assignments" do
    field :status, :string, default: "pending"  # pending, in_progress, completed, declined
    field :assigned_at, :utc_datetime
    field :started_at, :utc_datetime
    field :completed_at, :utc_datetime
    field :due_date, :utc_datetime
    field :priority, :string, default: "normal"
    field :notes, :string
    field :metadata, :map, default: %{}

    belongs_to :review_workflow, ReviewWorkflow
    belongs_to :reviewer, User

    timestamps()
  end

  def changeset(assignment, attrs) do
    assignment
    |> cast(attrs, [
      :status,
      :assigned_at,
      :started_at,
      :completed_at,
      :due_date,
      :priority,
      :notes,
      :metadata,
      :review_workflow_id,
      :reviewer_id
    ])
    |> validate_required([:review_workflow_id, :reviewer_id])
    |> validate_inclusion(:status, ["pending", "in_progress", "completed", "declined"])
    |> validate_inclusion(:priority, ["low", "normal", "high", "urgent"])
    |> foreign_key_constraint(:review_workflow_id)
    |> foreign_key_constraint(:reviewer_id)
  end
end
