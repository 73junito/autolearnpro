defmodule LmsApi.Assessments.AssessmentAttempt do
  use Ecto.Schema
  import Ecto.Changeset

  schema "assessment_attempts" do
    field :answers, :map  # JSON object with question_id => answer
    field :score, :integer
    field :percentage, :float
    field :status, :string, default: "in_progress"  # in_progress, submitted, passed, failed, graded
    field :submitted_at, :naive_datetime
    field :started_at, :naive_datetime
    field :time_spent_minutes, :integer
    field :attempt_number, :integer, default: 1
    field :feedback, :string  # instructor feedback for manual grading

    belongs_to :user, LmsApi.Accounts.User
    belongs_to :assessment, LmsApi.Assessments.Assessment

    timestamps()
  end

  @doc false
  def changeset(attempt, attrs) do
    attempt
    |> cast(attrs, [:answers, :score, :percentage, :status, :submitted_at,
                    :started_at, :time_spent_minutes, :attempt_number,
                    :feedback, :user_id, :assessment_id])
    |> validate_required([:user_id, :assessment_id])
    |> validate_inclusion(:status, ["in_progress", "submitted", "passed", "failed", "graded"])
    |> validate_number(:attempt_number, greater_than: 0)
    |> assoc_constraint(:user)
    |> assoc_constraint(:assessment)
    |> put_started_at()
  end

  defp put_started_at(changeset) do
    if get_field(changeset, :started_at) == nil do
      put_change(changeset, :started_at, NaiveDateTime.utc_now())
    else
      changeset
    end
  end
end