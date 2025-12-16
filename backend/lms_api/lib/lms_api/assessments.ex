defmodule LmsApi.Assessments do
  @moduledoc """
  The Assessments context.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo
  alias LmsApi.Assessments.{Assessment, Question, AssessmentAttempt}

  @doc """
  Returns the list of assessments.

  ## Examples

      iex> list_assessments()
      [%Assessment{}, ...]

  """
  def list_assessments do
    Repo.all(Assessment)
  end

  @doc """
  Gets a single assessment.

  Raises `Ecto.NoResultsError` if the Assessment does not exist.

  ## Examples

      iex> get_assessment!(123)
      %Assessment{}

      iex> get_assessment!(456)
      ** (Ecto.NoResultsError)

  """
  def get_assessment!(id), do: Repo.get!(Assessment, id)

  @doc """
  Creates a assessment.

  ## Examples

      iex> create_assessment(%{field: value})
      {:ok, %Assessment{}}

      iex> create_assessment(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_assessment(attrs \\ %{}) do
    %Assessment{}
    |> Assessment.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a assessment.

  ## Examples

      iex> update_assessment(assessment, %{field: new_value})
      {:ok, %Assessment{}}

      iex> update_assessment(assessment, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_assessment(%Assessment{} = assessment, attrs) do
    assessment
    |> Assessment.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a assessment.

  ## Examples

      iex> delete_assessment(assessment)
      {:ok, %Assessment{}}

      iex> delete_assessment(assessment)
      {:error, %Ecto.Changeset{}}

  """
  def delete_assessment(%Assessment{} = assessment) do
    Repo.delete(assessment)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking assessment changes.

  ## Examples

      iex> change_assessment(assessment)
      %Ecto.Changeset{data: %Assessment{}}

  """
  def change_assessment(%Assessment{} = assessment, attrs \\ %{}) do
    Assessment.changeset(assessment, attrs)
  end

  @doc """
  Lists assessments for a course.

  ## Examples

      iex> list_course_assessments(123)
      [%Assessment{}, ...]

  """
  def list_course_assessments(course_id) do
    Assessment
    |> where([a], a.course_id == ^course_id)
    |> order_by([a], a.inserted_at)
    |> Repo.all()
  end

  @doc """
  Gets assessment with questions.

  ## Examples

      iex> get_assessment_with_questions!(123)
      %Assessment{}

  """
  def get_assessment_with_questions!(id) do
    Assessment
    |> Repo.get!(id)
    |> Repo.preload(questions: from(q in Question, order_by: q.position))
  end

  @doc """
  Creates a question for an assessment.

  ## Examples

      iex> create_question(%{field: value})
      {:ok, %Question{}}

  """
  def create_question(attrs \\ %{}) do
    %Question{}
    |> Question.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a question.

  ## Examples

      iex> update_question(question, %{field: new_value})
      {:ok, %Question{}}

  """
  def update_question(%Question{} = question, attrs) do
    question
    |> Question.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a question.

  ## Examples

      iex> delete_question(question)
      {:ok, %Question{}}

  """
  def delete_question(%Question{} = question) do
    Repo.delete(question)
  end

  @doc """
  Creates an assessment attempt.

  ## Examples

      iex> create_attempt(%{field: value})
      {:ok, %AssessmentAttempt{}}

  """
  def create_attempt(attrs \\ %{}) do
    %AssessmentAttempt{}
    |> AssessmentAttempt.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Gets assessment attempt with answers.

  ## Examples

      iex> get_attempt_with_answers!(123)
      %AssessmentAttempt{}

  """
  def get_attempt_with_answers!(id) do
    AssessmentAttempt
    |> Repo.get!(id)
    |> Repo.preload(:assessment)
  end

  @doc """
  Submits assessment answers and calculates score.

  ## Examples

      iex> submit_assessment_answers(123, %{"q1" => "A", "q2" => "B"})
      {:ok, %AssessmentAttempt{}}

  """
  def submit_assessment_answers(attempt_id, answers) do
    attempt = get_attempt_with_answers!(attempt_id)
    assessment = get_assessment_with_questions!(attempt.assessment_id)

    # Calculate score
    score = calculate_assessment_score(assessment.questions, answers)
    percentage = calculate_percentage(score, assessment.total_points)

    # Determine status
    status = if percentage >= assessment.passing_score, do: "passed", else: "failed"

    update_attempt(attempt, %{
      answers: answers,
      score: score,
      percentage: percentage,
      status: status,
      submitted_at: NaiveDateTime.utc_now()
    })
  end

  @doc """
  Updates an assessment attempt.

  ## Examples

      iex> update_attempt(attempt, %{field: new_value})
      {:ok, %AssessmentAttempt{}}

  """
  def update_attempt(%AssessmentAttempt{} = attempt, attrs) do
    attempt
    |> AssessmentAttempt.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Lists attempts for a user and assessment.

  ## Examples

      iex> list_user_assessment_attempts(123, 456)
      [%AssessmentAttempt{}, ...]

  """
  def list_user_assessment_attempts(user_id, assessment_id) do
    AssessmentAttempt
    |> where([a], a.user_id == ^user_id and a.assessment_id == ^assessment_id)
    |> order_by([a], desc: a.inserted_at)
    |> Repo.all()
  end

  @doc """
  Gets assessment analytics.

  ## Examples

      iex> get_assessment_analytics(123)
      %{average_score: 85.5, pass_rate: 78.2, total_attempts: 25}

  """
  def get_assessment_analytics(assessment_id) do
    attempts = AssessmentAttempt
    |> where([a], a.assessment_id == ^assessment_id and not is_nil(a.submitted_at))
    |> Repo.all()

    if Enum.empty?(attempts) do
      %{average_score: 0.0, pass_rate: 0.0, total_attempts: 0}
    else
      total_attempts = length(attempts)
      average_score = Enum.reduce(attempts, 0, &(&1.percentage + &2)) / total_attempts
      passed_attempts = Enum.count(attempts, &(&1.status == "passed"))
      pass_rate = (passed_attempts / total_attempts) * 100

      %{
        average_score: Float.round(average_score, 1),
        pass_rate: Float.round(pass_rate, 1),
        total_attempts: total_attempts
      }
    end
  end

  # Helper functions

  defp calculate_assessment_score(questions, answers) do
    Enum.reduce(questions, 0, fn question, total_score ->
      user_answer = Map.get(answers, "q#{question.id}")
      if user_answer == question.correct_answer do
        total_score + question.points
      else
        total_score
      end
    end)
  end

  defp calculate_percentage(score, total_points) do
    if total_points > 0 do
      (score / total_points) * 100
    else
      0.0
    end
  end
end