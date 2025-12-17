defmodule LmsApi.AIContentGenerator do
  @moduledoc """
  Generates course content using Ollama AI models.

  Uses qwen3-vl:8b for text-based content (lessons, assessments, explanations)
  and Flux_AI for visual diagrams and course thumbnails.
  """

  alias LmsApi.AIClient
  alias LmsApi.Catalog

  @content_model Application.compile_env(:lms_api, [:ai_models, :content_generation], "qwen3-vl:8b")

  @doc """
  Generates learning outcomes for a course based on its description.

  ## Examples

      iex> generate_learning_outcomes("AUT-120", "Introduction to Brake Systems")
      {:ok, ["Identify brake system components", "Diagnose common brake issues", ...]}
  """
  def generate_learning_outcomes(course_code, course_title) do
    prompt = """
    You are an expert automotive/diesel instructor creating learning outcomes for a technical course.

    Course: #{course_code} - #{course_title}

    Generate 5-7 specific, measurable learning outcomes for this course.
    Format each outcome starting with an action verb (e.g., "Diagnose", "Identify", "Explain", "Demonstrate").
    Focus on practical, hands-on skills relevant to automotive and diesel technology.

    Return ONLY a JSON array of strings, no additional text:
    ["outcome 1", "outcome 2", ...]
    """

    case AIClient.ask(prompt, model: @content_model) do
      {:ok, response} ->
        parse_json_array(response)
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Generates course modules with descriptions and objectives.

  ## Examples

      iex> generate_course_modules("AUT-120", 4)
      {:ok, [%{title: "Module 1: ...", description: "...", objectives: [...]}]}
  """
  def generate_course_modules(course_code, course_title, module_count \\ 4) do
    prompt = """
    You are an expert automotive/diesel instructor designing course modules.

    Course: #{course_code} - #{course_title}

    Create #{module_count} modules for this course. Each module should:
    - Have a clear, descriptive title
    - Include a 2-3 sentence description
    - List 3-5 specific learning objectives
    - Progress logically from foundational to advanced concepts

    Return ONLY a JSON array of objects with this structure:
    [
      {
        "title": "Module title",
        "description": "Module description",
        "objectives": ["objective 1", "objective 2", ...]
      }
    ]

    No additional text or markdown formatting.
    """

    case AIClient.ask(prompt, model: @content_model) do
      {:ok, response} ->
        parse_json_objects(response)
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Generates lesson content for a module.

  ## Examples

      iex> generate_lesson_content("Hydraulic brake operation", "lesson")
      {:ok, %{content: "...", duration_minutes: 45}}
  """
  def generate_lesson_content(lesson_title, lesson_type \\ "lesson") do
    duration = case lesson_type do
      "lab" -> 120
      "assessment" -> 60
      _ -> 45
    end

    prompt = """
    You are an expert automotive/diesel instructor creating lesson content.

    Lesson: #{lesson_title}
    Type: #{lesson_type}
    Duration: #{duration} minutes

    Create comprehensive lesson content including:
    1. Introduction (2-3 sentences)
    2. Key concepts and terminology (4-6 bullet points)
    3. Detailed explanation of the topic
    4. Practical applications and examples
    5. Common mistakes or misconceptions
    6. Summary and key takeaways

    Format the content in Markdown with clear headings (##, ###).
    Make it engaging, practical, and suitable for automotive/diesel technicians.

    Return ONLY the markdown content, no JSON wrapper.
    """

    case AIClient.ask(prompt, model: @content_model) do
      {:ok, content} ->
        {:ok, %{content: content, duration_minutes: duration}}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Generates assessment questions for a topic.

  ## Examples

      iex> generate_assessment_questions("Brake system components", 5)
      {:ok, [%{question_text: "...", options: [...], correct_answer: "...", explanation: "..."}]}
  """
  def generate_assessment_questions(topic, count \\ 5, question_type \\ "multiple_choice") do
    prompt = """
    You are an expert automotive/diesel instructor creating assessment questions.

    Topic: #{topic}
    Question Type: #{question_type}
    Number of Questions: #{count}

    Generate #{count} high-quality assessment questions about #{topic}.

    For each question:
    - Write a clear, specific question testing practical knowledge
    - Provide 4 multiple choice options (A, B, C, D)
    - Indicate the correct answer
    - Include a brief explanation of why the answer is correct

    Return ONLY a JSON array of objects with this structure:
    [
      {
        "question_text": "Question here?",
        "options": {"A": "option 1", "B": "option 2", "C": "option 3", "D": "option 4"},
        "correct_answer": "B",
        "explanation": "Explanation here"
      }
    ]

    No additional text or markdown formatting.
    """

    case AIClient.ask(prompt, model: @content_model) do
      {:ok, response} ->
        parse_json_objects(response)
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Creates a complete course with modules, lessons, and assessments.

  This is a high-level function that orchestrates the generation of all course components.
  """
  def generate_complete_course(course_attrs) do
    with {:ok, course} <- Catalog.create_course(course_attrs),
         {:ok, outcomes} <- generate_learning_outcomes(course.code, course.title),
         {:ok, syllabus} <- create_course_syllabus(course.id, outcomes),
         {:ok, modules} <- generate_and_create_modules(course.id, course.code, course.title),
         {:ok, _lessons} <- generate_and_create_lessons(modules) do
      {:ok, course}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  # Private helper functions

  defp create_course_syllabus(course_id, learning_outcomes) do
    syllabus_attrs = %{
      course_id: course_id,
      learning_outcomes: learning_outcomes,
      assessment_methods: [
        "Hands-on practical assessments",
        "Written quizzes and exams",
        "Lab performance evaluations",
        "Project-based assessments"
      ],
      grading_breakdown: %{
        "quizzes" => 20,
        "labs" => 30,
        "midterm" => 20,
        "final_exam" => 20,
        "participation" => 10
      },
      prerequisites: []
    }

    Catalog.create_course_syllabus(syllabus_attrs)
  end

  defp generate_and_create_modules(course_id, course_code, course_title) do
    case generate_course_modules(course_code, course_title, 4) do
      {:ok, modules_data} ->
        modules = Enum.with_index(modules_data, 1)
        |> Enum.map(fn {module_data, index} ->
          module_attrs = %{
            course_id: course_id,
            title: module_data["title"],
            description: module_data["description"],
            sequence_number: index,
            duration_weeks: 2,
            objectives: module_data["objectives"]
          }

          case Catalog.create_course_module(module_attrs) do
            {:ok, module} -> {:ok, module}
            {:error, reason} -> {:error, reason}
          end
        end)

        # Check if all succeeded
        errors = Enum.filter(modules, fn
          {:error, _} -> true
          _ -> false
        end)

        if Enum.empty?(errors) do
          {:ok, Enum.map(modules, fn {:ok, mod} -> mod end)}
        else
          {:error, "Failed to create some modules"}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp generate_and_create_lessons(modules) do
    lessons = Enum.flat_map(modules, fn module ->
      # Generate 3 lessons per module: 2 regular + 1 lab
      lesson_types = [
        {1, "lesson"},
        {2, "lesson"},
        {3, "lab"}
      ]

      Enum.map(lesson_types, fn {seq, type} ->
        lesson_title = "#{module.title} - Part #{seq}"

        case generate_lesson_content(lesson_title, type) do
          {:ok, %{content: content, duration_minutes: duration}} ->
            lesson_attrs = %{
              module_id: module.id,
              title: lesson_title,
              sequence_number: seq,
              lesson_type: type,
              duration_minutes: duration,
              content: content,
              media_url: nil
            }

            Catalog.create_module_lesson(lesson_attrs)

          {:error, reason} ->
            {:error, reason}
        end
      end)
    end)

    # Check if all succeeded
    errors = Enum.filter(lessons, fn
      {:error, _} -> true
      _ -> false
    end)

    if Enum.empty?(errors) do
      {:ok, Enum.map(lessons, fn {:ok, lesson} -> lesson end)}
    else
      {:error, "Failed to create some lessons"}
    end
  end

  # JSON parsing helpers

  defp parse_json_array(response) do
    cleaned = String.trim(response)
    |> String.replace(~r/^```json\s*/, "")
    |> String.replace(~r/\s*```$/, "")
    |> String.trim()

    case Jason.decode(cleaned) do
      {:ok, list} when is_list(list) ->
        {:ok, list}
      {:ok, _} ->
        {:error, "Expected JSON array"}
      {:error, _} ->
        {:error, "Invalid JSON response"}
    end
  end

  defp parse_json_objects(response) do
    cleaned = String.trim(response)
    |> String.replace(~r/^```json\s*/, "")
    |> String.replace(~r/\s*```$/, "")
    |> String.trim()

    case Jason.decode(cleaned) do
      {:ok, objects} when is_list(objects) ->
        {:ok, objects}
      {:ok, _} ->
        {:error, "Expected JSON array of objects"}
      {:error, _} ->
        {:error, "Invalid JSON response"}
    end
  end
end
