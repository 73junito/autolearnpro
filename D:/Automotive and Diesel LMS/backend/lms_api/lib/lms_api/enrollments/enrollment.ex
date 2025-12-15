defmodule LmsApi.Enrollments.Enrollment do
  use Ecto.Schema
  import Ecto.Changeset

  schema "enrollments" do
    field :status, :string, default: "enrolled"
    field :enrolled_at, :naive_datetime
    field :completed_at, :naive_datetime
    field :progress_percentage, :integer, default: 0

    belongs_to :user, LmsApi.Accounts.User
    belongs_to :course, LmsApi.Catalog.Course

    timestamps()
  end

  @doc false
  def changeset(enrollment, attrs) do
    enrollment
    |> cast(attrs, [:enrolled_at, :status, :completed_at, :progress_percentage, :user_id, :course_id])
    |> validate_required([:status, :user_id, :course_id])
    |> validate_inclusion(:status, ["enrolled", "completed", "dropped"])
    |> validate_number(:progress_percentage, greater_than_or_equal_to: 0, less_than_or_equal_to: 100)
    |> put_enrolled_at()
  end

  defp put_enrolled_at(changeset) do
    if get_field(changeset, :enrolled_at) == nil do
      put_change(changeset, :enrolled_at, NaiveDateTime.utc_now())
    else
      changeset
    end
  end
end
