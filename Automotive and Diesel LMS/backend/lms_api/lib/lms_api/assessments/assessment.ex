defmodule LmsApi.Assessments.Assessment do
  use Ecto.Schema
  import Ecto.Changeset

  schema "assessments" do
    field :title, :string
    field :description, :string
    field :assessment_type, :string, default: "quiz"  # quiz, exam, assignment
    field :total_points, :integer, default: 100
    field :passing_score, :integer, default: 70  # percentage
    field :time_limit_minutes, :integer
    field :is_published, :boolean, default: false
    field :instructions, :string
    field :due_date, :naive_datetime
    field :max_attempts, :integer, default: 1

    belongs_to :course, LmsApi.Catalog.Course
    has_many :questions, LmsApi.Assessments.Question
    has_many :attempts, LmsApi.Assessments.AssessmentAttempt

    timestamps()
  end

  @doc false
  def changeset(assessment, attrs) do
    assessment
    |> cast(attrs, [:title, :description, :assessment_type, :total_points,
                    :passing_score, :time_limit_minutes, :is_published,
                    :instructions, :due_date, :max_attempts, :course_id])
    |> validate_required([:title, :course_id])
    |> validate_inclusion(:assessment_type, ["quiz", "exam", "assignment"])
    |> validate_number(:total_points, greater_than: 0)
    |> validate_number(:passing_score, greater_than_or_equal_to: 0, less_than_or_equal_to: 100)
    |> validate_number(:max_attempts, greater_than: 0)
    |> assoc_constraint(:course)
  end
end