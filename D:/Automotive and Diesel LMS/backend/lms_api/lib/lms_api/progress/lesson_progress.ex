defmodule LmsApi.Progress.LessonProgress do
  use Ecto.Schema
  import Ecto.Changeset

  schema "lesson_progresses" do
    field :completed_at, :naive_datetime
    field :score, :integer
    field :quiz_answers, :map  # Store quiz responses as JSON
    field :time_spent, :integer  # Time spent on lesson in seconds
    field :attempts, :integer, default: 1
    field :status, :string, default: "in_progress"  # in_progress, completed, passed, failed

    belongs_to :user, LmsApi.Accounts.User
    belongs_to :lesson, LmsApi.Catalog.ModuleLesson

    timestamps()
  end

  @doc false
  def changeset(lesson_progress, attrs) do
    lesson_progress
    |> cast(attrs, [:completed_at, :score, :quiz_answers, :time_spent, :attempts, :status, :user_id, :lesson_id])
    |> validate_required([:user_id, :lesson_id])
    |> validate_inclusion(:status, ["in_progress", "completed", "passed", "failed"])
    |> validate_number(:score, greater_than_or_equal_to: 0, less_than_or_equal_to: 100, allow_nil: true)
    |> validate_number(:time_spent, greater_than_or_equal_to: 0, allow_nil: true)
    |> validate_number(:attempts, greater_than: 0)
    |> put_completed_at()
  end

  defp put_completed_at(changeset) do
    case get_field(changeset, :status) do
      "completed" ->
        if get_field(changeset, :completed_at) == nil do
          put_change(changeset, :completed_at, NaiveDateTime.utc_now())
        else
          changeset
        end
      "passed" ->
        if get_field(changeset, :completed_at) == nil do
          put_change(changeset, :completed_at, NaiveDateTime.utc_now())
        else
          changeset
        end
      "failed" ->
        if get_field(changeset, :completed_at) == nil do
          put_change(changeset, :completed_at, NaiveDateTime.utc_now())
        else
          changeset
        end
      _ ->
        changeset
    end
  end
end
