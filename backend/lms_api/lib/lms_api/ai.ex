defmodule LmsApi.AI do
  @moduledoc """
  The AI context for intelligent features.
  """

  alias LmsApi.Repo
  alias LmsApi.AI.{Recommendation, ChatMessage}
  alias LmsApi.Accounts
  alias LmsApi.Catalog
  alias LmsApi.Assessments
  alias LmsApi.Progress

  @openai_api_key System.get_env("OPENAI_API_KEY")
  @openai_base_url "https://api.openai.com/v1"

  @doc """
  Generates quiz questions using AI.

  ## Examples

      iex> generate_quiz_questions("Introduction to Automotive Engines", 5, "multiple_choice")
      {:ok, [%{question: "...", options: [...], correct_answer: "..."}]}

  """
  def generate_quiz_questions(topic, count \\ 5, question_type \\ "multiple_choice") do
    prompt = """
    Generate #{count} #{question_type} questions about: #{topic}

    For each question, provide:
    - Question text
    - 4 multiple choice options (A, B, C, D)
    - Correct answer
    - Brief explanation

    Format as JSON array of objects with keys: question_text, options, correct_answer, explanation
    """

    case call_openai(prompt) do
      {:ok, response} ->
        parse_quiz_questions(response)
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Provides learning recommendations for a student.

  ## Examples

      iex> get_learning_recommendations(user_id, course_id)
      {:ok, [%{type: "lesson", content: "...", reason: "..."}]}

  """
  def get_learning_recommendations(user_id, course_id) do
    user = Accounts.get_user!(user_id)
    course = Catalog.get_course_with_structure!(course_id)

    # Get student's progress
    progress = Progress.get_course_progress(user_id, course_id)

    # Get assessment performance
    assessments = Assessments.list_course_assessments(course_id)
    assessment_performance = get_assessment_performance(user_id, assessments)

    # Analyze weak areas
    weak_topics = analyze_weak_areas(progress, assessment_performance)

    # Generate recommendations
    generate_recommendations(course, weak_topics, progress)
  end

  @doc """
  Generates study plan using AI.

  ## Examples

      iex> generate_study_plan(user_id, course_id, weeks)
      {:ok, %{weekly_plan: [...], goals: [...], tips: [...]}}

  """
  def generate_study_plan(user_id, course_id, weeks \\ 4) do
    user = Accounts.get_user!(user_id)
    course = Catalog.get_course_with_structure!(course_id)

    progress = Progress.get_course_progress(user_id, course_id)

    prompt = """
    Create a #{weeks}-week study plan for course: #{course.title}

    Student progress: #{progress.completion_percentage}% complete
    Time spent: #{progress.total_time_spent_minutes} minutes

    Generate a structured study plan with:
    - Weekly goals and objectives
    - Daily study schedule
    - Recommended resources
    - Study tips and strategies
    - Progress checkpoints

    Format as JSON with keys: weekly_plan, goals, tips, checkpoints
    """

    case call_openai(prompt) do
      {:ok, response} ->
        parse_study_plan(response)
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Provides intelligent grading feedback.

  ## Examples

      iex> generate_grading_feedback(attempt_id, student_answer, correct_answer)
      {:ok, %{feedback: "...", score: 8, suggestions: [...]}}

  """
  def generate_grading_feedback(attempt_id, student_answer, correct_answer) do
    prompt = """
    Analyze this student answer and provide grading feedback:

    Student Answer: #{student_answer}
    Correct Answer: #{correct_answer}

    Provide:
    - Detailed feedback on correctness
    - Score out of 10
    - Specific suggestions for improvement
    - Learning points to focus on

    Format as JSON with keys: feedback, score, suggestions, learning_points
    """

    case call_openai(prompt) do
      {:ok, response} ->
        parse_grading_feedback(response)
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Answers student questions using course content.

  ## Examples

      iex> answer_student_question(course_id, question)
      {:ok, %{answer: "...", confidence: 0.85, sources: [...]}}

  """
  def answer_student_question(course_id, question) do
    course = Catalog.get_course_with_structure!(course_id)

    # Extract course content for context
    course_content = extract_course_content(course)

    prompt = """
    Answer this student question using the course content provided:

    Course: #{course.title}
    Course Content: #{course_content}

    Student Question: #{question}

    Provide:
    - Clear, helpful answer
    - Confidence score (0-1)
    - References to specific course content
    - Suggestions for further reading

    Format as JSON with keys: answer, confidence, references, suggestions
    """

    case call_openai(prompt) do
      {:ok, response} ->
        parse_student_answer(response)
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Analyzes course engagement and provides insights.

  ## Examples

      iex> analyze_course_engagement(course_id)
      {:ok, %{engagement_score: 7.5, insights: [...], recommendations: [...]}}

  """
  def analyze_course_engagement(course_id) do
    # This would analyze various metrics like:
    # - Student login frequency
    # - Time spent on lessons
    # - Assessment completion rates
    # - Discussion participation
    # - Progress patterns

    # For now, return mock data
    {:ok, %{
      engagement_score: 7.2,
      insights: [
        "Students spend most time on practical lessons",
        "Assessment completion rate is 85%",
        "Peak engagement is during weekday evenings"
      ],
      recommendations: [
        "Add more interactive elements to theoretical lessons",
        "Schedule live sessions during peak hours",
        "Create study groups for complex topics"
      ]
    }}
  end

  # Private functions

  defp call_openai(prompt) do
    if !@openai_api_key do
      {:error, "OpenAI API key not configured"}
    else
      headers = [
        {"Authorization", "Bearer #{@openai_api_key}"},
        {"Content-Type", "application/json"}
      ]

      # Sanitize prompt to avoid leaking PII to external services
      sanitized_prompt = sanitize_prompt(prompt)

      body = Jason.encode!(%{
        model: "gpt-3.5-turbo",
        messages: [%{role: "user", content: sanitized_prompt}],
        max_tokens: 1000,
        temperature: 0.7
      })

      case HTTPoison.post(@openai_base_url <> "/chat/completions", body, headers) do
        {:ok, %HTTPoison.Response{status_code: 200, body: response_body}} ->
          case Jason.decode(response_body) do
            {:ok, %{"choices" => [%{"message" => %{"content" => content}} | _]}} ->
              {:ok, content}
            {:error, _} ->
              {:error, "Failed to parse OpenAI response"}
          end
        {:ok, %HTTPoison.Response{status_code: status, body: error_body}} ->
          {:error, "OpenAI API error: #{status} - #{error_body}"}
        {:error, %HTTPoison.Error{reason: reason}} ->
          {:error, "HTTP request failed: #{reason}"}
      end
    end
  end

  @doc "Sanitize a prompt string by redacting PII (emails etc.) before sending to external models."
  def sanitize_prompt(prompt) when is_binary(prompt) do
    LmsApi.Redactor.redact_string(prompt)
  end
  def sanitize_prompt(other), do: other

  defp parse_quiz_questions(response) do
    case Jason.decode(response) do
      {:ok, questions} when is_list(questions) ->
        {:ok, questions}
      _ ->
        {:error, "Failed to parse quiz questions"}
    end
  end

  defp parse_study_plan(response) do
    case Jason.decode(response) do
      {:ok, plan} ->
        {:ok, plan}
      _ ->
        {:error, "Failed to parse study plan"}
    end
  end

  defp parse_grading_feedback(response) do
    case Jason.decode(response) do
      {:ok, feedback} ->
        {:ok, feedback}
      _ ->
        {:error, "Failed to parse grading feedback"}
    end
  end

  defp parse_student_answer(response) do
    case Jason.decode(response) do
      {:ok, answer} ->
        {:ok, answer}
      _ ->
        {:error, "Failed to parse student answer"}
    end
  end

  defp get_assessment_performance(user_id, assessments) do
    Enum.map(assessments, fn assessment ->
      attempts = Assessments.list_user_assessment_attempts(user_id, assessment.id)
      latest_attempt = List.first(attempts)

      if latest_attempt do
        %{
          assessment_id: assessment.id,
          score: latest_attempt.percentage,
          status: latest_attempt.status
        }
      else
        %{
          assessment_id: assessment.id,
          score: 0,
          status: "not_attempted"
        }
      end
    end)
  end

  defp analyze_weak_areas(progress, assessment_performance) do
    # Analyze progress and assessment data to identify weak areas
    weak_assessments = assessment_performance
    |> Enum.filter(&(&1.score < 70))
    |> Enum.map(& &1.assessment_id)

    # Return topics that need improvement
    weak_assessments
  end

  defp generate_recommendations(course, weak_topics, progress) do
    recommendations = []

    # Recommend lessons based on weak areas
    course.modules
    |> Enum.each(fn module ->
      module.lessons
      |> Enum.each(fn lesson ->
        if progress.completion_percentage < 100 do
          recommendations = [%{
            type: "lesson",
            content: lesson.title,
            reason: "Continue with remaining course content",
            priority: "high"
          } | recommendations]
        end
      end)
    end)

    # Recommend practice assessments
    if length(weak_topics) > 0 do
      recommendations = [%{
        type: "assessment",
        content: "Practice Assessment",
        reason: "Review weak areas identified in assessments",
        priority: "high"
      } | recommendations]
    end

    {:ok, recommendations}
  end

  defp extract_course_content(course) do
    content_parts = []

    course.modules
    |> Enum.each(fn module ->
      content_parts = ["Module: #{module.title}" | content_parts]

      module.lessons
      |> Enum.each(fn lesson ->
        content_parts = ["Lesson: #{lesson.title} - #{lesson.content}" | content_parts]
      end)
    end)

    Enum.join(content_parts, "\n\n")
  end
end