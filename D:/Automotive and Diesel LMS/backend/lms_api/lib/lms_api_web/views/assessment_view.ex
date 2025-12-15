defmodule LmsApiWeb.AssessmentView do
  use LmsApiWeb, :view

  def render("index.json", %{assessments: assessments}) do
    %{
      data: render_many(assessments, __MODULE__, "assessment.json", as: :assessment)
    }
  end

  def render("show.json", %{assessment: assessment}) do
    %{
      data: %{
        id: assessment.id,
        title: assessment.title,
        description: assessment.description,
        assessment_type: assessment.assessment_type,
        total_points: assessment.total_points,
        passing_score: assessment.passing_score,
        time_limit_minutes: assessment.time_limit_minutes,
        is_published: assessment.is_published,
        instructions: assessment.instructions,
        due_date: assessment.due_date,
        max_attempts: assessment.max_attempts,
        course_id: assessment.course_id,
        questions: render_many(assessment.questions, __MODULE__, "question.json", as: :question),
        inserted_at: assessment.inserted_at,
        updated_at: assessment.updated_at
      }
    }
  end

  def render("assessment.json", %{assessment: assessment}) do
    %{
      id: assessment.id,
      title: assessment.title,
      description: assessment.description,
      assessment_type: assessment.assessment_type,
      total_points: assessment.total_points,
      passing_score: assessment.passing_score,
      time_limit_minutes: assessment.time_limit_minutes,
      is_published: assessment.is_published,
      due_date: assessment.due_date,
      max_attempts: assessment.max_attempts,
      course_id: assessment.course_id
    }
  end

  def render("question.json", %{question: question}) do
    %{
      id: question.id,
      question_text: question.question_text,
      question_type: question.question_type,
      options: question.options,
      points: question.points,
      position: question.position,
      explanation: question.explanation,
      assessment_id: question.assessment_id
    }
  end

  def render("attempt.json", %{attempt: attempt}) do
    %{
      data: %{
        id: attempt.id,
        answers: attempt.answers,
        score: attempt.score,
        percentage: attempt.percentage,
        status: attempt.status,
        submitted_at: attempt.submitted_at,
        started_at: attempt.started_at,
        time_spent_minutes: attempt.time_spent_minutes,
        attempt_number: attempt.attempt_number,
        feedback: attempt.feedback,
        user_id: attempt.user_id,
        assessment_id: attempt.assessment_id
      }
    }
  end

  def render("attempts.json", %{attempts: attempts}) do
    %{
      data: render_many(attempts, __MODULE__, "attempt.json", as: :attempt)
    }
  end
end