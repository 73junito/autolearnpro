defmodule LmsApi.Assessments.Question do
  use Ecto.Schema
  import Ecto.Changeset

  schema "assessment_questions" do
    field :question_text, :string
    field :question_type, :string, default: "multiple_choice"  # multiple_choice, true_false, short_answer, essay
    field :options, {:array, :string}  # for multiple choice questions
    field :correct_answer, :string
    field :points, :integer, default: 1
    field :position, :integer
    field :explanation, :string  # explanation of the correct answer

    belongs_to :assessment, LmsApi.Assessments.Assessment

    timestamps()
  end

  @doc false
  def changeset(question, attrs) do
    question
    |> cast(attrs, [:question_text, :question_type, :options, :correct_answer,
                    :points, :position, :explanation, :assessment_id])
    |> validate_required([:question_text, :question_type, :correct_answer, :assessment_id])
    |> validate_inclusion(:question_type, ["multiple_choice", "true_false", "short_answer", "essay"])
    |> validate_number(:points, greater_than: 0)
    |> validate_number(:position, greater_than: 0)
    |> assoc_constraint(:assessment)
  end
end