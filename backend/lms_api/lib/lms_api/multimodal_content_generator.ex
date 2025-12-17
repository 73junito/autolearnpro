defmodule LmsApi.MultimodalContentGenerator do
  @moduledoc """
  Generates comprehensive multimodal lesson content using AI.

  Creates four learning modalities:
  1. Visual Diagrams - AI-generated technical diagrams
  2. Clear Written Steps - Step-by-step instructions
  3. Audio Explanation - Script for narration
  4. Interactive Practice - Hands-on activities
  """

  alias LmsApi.AIClient
  alias LmsApi.Catalog

  @content_model Application.compile_env(:lms_api, [:ai_models, :content_generation], "qwen3-vl:8b")
  @image_model Application.compile_env(:lms_api, [:ai_models, :image_generation], "Flux_AI/Flux_AI:latest")

  @doc """
  Generates complete multimodal lesson content for a given topic.

  Returns a map with all four content types:
  - visual_diagrams: Array of diagram specifications
  - written_steps: Markdown formatted step-by-step guide
  - audio_script: Natural language script for audio narration
  - interactive_elements: Practice activities and assessments

  ## Examples

      iex> generate_multimodal_lesson("Brake System Hydraulics", "lesson")
      {:ok, %{
        visual_diagrams: [...],
        written_steps: "## Step 1...",
        audio_script: "Welcome to this lesson...",
        interactive_elements: [...]
      }}
  """
  def generate_multimodal_lesson(topic, lesson_type \\ "lesson", difficulty \\ "intermediate") do
    with {:ok, visual_specs} <- generate_visual_diagram_specs(topic, lesson_type),
         {:ok, written_steps} <- generate_written_steps(topic, lesson_type, difficulty),
         {:ok, audio_script} <- generate_audio_script(topic, lesson_type),
         {:ok, practice_activities} <- generate_practice_activities(topic, difficulty) do

      {:ok, %{
        visual_diagrams: visual_specs,
        written_steps: written_steps,
        audio_script: audio_script,
        practice_activities: practice_activities
      }}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Generates specifications for visual diagrams.
  AI creates descriptions that can be used to generate actual images.
  """
  def generate_visual_diagram_specs(topic, lesson_type) do
    prompt = """
    You are an expert technical illustrator for automotive training.

    Topic: #{topic}
    Lesson Type: #{lesson_type}

    Generate specifications for 2-3 technical diagrams that would help students understand this topic.

    For each diagram, provide:
    - Type (system_overview, component_detail, flowchart, circuit_diagram, cutaway_view)
    - Title (clear, descriptive)
    - Description (what the diagram shows)
    - Key elements to include (list specific components/parts)
    - Annotations needed (labels and callouts)

    Return ONLY a JSON array:
    [
      {
        "type": "system_overview",
        "title": "Complete Brake System Layout",
        "description": "Shows the complete hydraulic brake system from pedal to wheels",
        "elements": ["master cylinder", "brake lines", "calipers", "rotors", "brake pads"],
        "annotations": [
          {"label": "Master Cylinder", "description": "Converts pedal force to hydraulic pressure", "position": "top-left"}
        ],
        "image_prompt": "Technical diagram of automotive brake system showing master cylinder, brake lines, calipers, and rotors with clear labels"
      }
    ]

    No additional text or markdown formatting.
    """

    case AIClient.ask(prompt, model: @content_model) do
      {:ok, response} ->
        parse_json_array(response)
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Generates clear, step-by-step written instructions.
  """
  def generate_written_steps(topic, lesson_type, difficulty) do
    prompt = """
    You are an expert automotive instructor writing clear, step-by-step procedures.

    Topic: #{topic}
    Lesson Type: #{lesson_type}
    Difficulty: #{difficulty}

    Create comprehensive written steps for this lesson. Include:

    1. **Safety Precautions** (2-3 key safety items)
    2. **Required Tools & Materials** (list)
    3. **Step-by-Step Procedure** (numbered steps with clear actions)
       - Each step should be one clear action
       - Include WHY for critical steps
       - Add tips and notes where helpful
    4. **Common Mistakes to Avoid** (2-3 items)
    5. **Verification & Testing** (how to confirm success)

    Format in Markdown with clear headings (##, ###).
    Use bullet points and numbered lists.
    Write in active voice, second person (you will...).
    Be specific with measurements, torque specs, and procedures.

    Return ONLY the markdown content, no JSON wrapper.
    """

    case AIClient.ask(prompt, model: @content_model) do
      {:ok, content} ->
        {:ok, String.trim(content)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Generates natural language script for audio narration.
  """
  def generate_audio_script(topic, lesson_type) do
    prompt = """
    You are an expert automotive instructor recording audio narration for an online course.

    Topic: #{topic}
    Lesson Type: #{lesson_type}

    Write a conversational audio script (2-3 minutes when spoken) that:

    1. **Introduction** (15-20 seconds)
       - Greet the student
       - State the topic and learning objectives
       - Explain why this is important

    2. **Main Content** (90-120 seconds)
       - Explain key concepts clearly
       - Use analogies and real-world examples
       - Guide student through the visual diagrams
       - Emphasize critical safety points
       - Explain common issues and solutions

    3. **Summary & Next Steps** (15-20 seconds)
       - Recap main points
       - Preview practice activity
       - Encourage questions

    Write in a friendly, professional tone.
    Use natural spoken language (contractions are fine).
    Include [PAUSE] markers for emphasis.
    Add [REFERENCE DIAGRAM 1] markers where visuals should be shown.

    Return ONLY the script text, no JSON or markdown formatting.
    """

    case AIClient.ask(prompt, model: @content_model) do
      {:ok, script} ->
        {:ok, String.trim(script)}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Generates interactive practice activities.
  """
  def generate_practice_activities(topic, difficulty) do
    prompt = """
    You are an expert automotive instructor designing hands-on practice activities.

    Topic: #{topic}
    Difficulty: #{difficulty}

    Create 2-3 interactive practice activities that reinforce learning:

    Activity Types:
    - Component Identification (identify parts in diagram)
    - Troubleshooting Scenario (diagnose a problem)
    - Calculation Exercise (measurements, specs)
    - Procedure Sequencing (put steps in correct order)
    - Decision Tree (choose correct actions)

    For each activity, provide:
    - Type
    - Title
    - Instructions (clear and specific)
    - Estimated time (minutes)
    - Success criteria (how student knows they succeeded)
    - Feedback for common errors

    Return ONLY a JSON array:
    [
      {
        "type": "troubleshooting_scenario",
        "title": "Diagnose Low Brake Pedal",
        "difficulty": "intermediate",
        "estimated_time": 10,
        "instructions": "A customer reports a low, spongy brake pedal. Using the diagnostic flowchart, identify the most likely cause.",
        "scenario": "2018 Honda Accord, brake pedal goes nearly to floor, no warning lights, fluid level normal",
        "correct_answer": "air_in_system",
        "options": [
          {"id": "air_in_system", "label": "Air in hydraulic system", "feedback": "Correct! Air in the lines causes spongy pedal feel."},
          {"id": "worn_pads", "label": "Worn brake pads", "feedback": "While this could lower pedal height, it wouldn't cause sponginess."},
          {"id": "master_cylinder", "label": "Failed master cylinder", "feedback": "Possible, but air is more likely with normal fluid level."}
        ],
        "success_criteria": "Correctly identifies air in system and explains reasoning"
      }
    ]

    No additional text or markdown formatting.
    """

    case AIClient.ask(prompt, model: @content_model) do
      {:ok, response} ->
        parse_json_array(response)
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Generates image using AI model from diagram specifications.
  """
  def generate_diagram_image(diagram_spec) do
    image_prompt = Map.get(diagram_spec, "image_prompt", "")

    # Enhanced prompt for technical accuracy
    enhanced_prompt = """
    Technical educational diagram: #{image_prompt}

    Style: Clean, professional technical illustration
    Quality: High detail, clear labels, educational
    Format: Technical drawing with annotations
    """

    case AIClient.generate(@image_model, enhanced_prompt) do
      {:ok, %{"result" => image_data}} ->
        # In production, would save to storage and return URL
        {:ok, %{
          image_data: image_data,
          diagram_spec: diagram_spec
        }}
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Creates a complete lesson with all multimodal content and saves to database.
  """
  def create_complete_lesson(module_id, lesson_attrs) do
    topic = Map.get(lesson_attrs, :title)
    lesson_type = Map.get(lesson_attrs, :lesson_type, "lesson")
    difficulty = Map.get(lesson_attrs, :difficulty, "intermediate")

    with {:ok, multimodal_content} <- generate_multimodal_lesson(topic, lesson_type, difficulty) do
      # Merge multimodal content with lesson attributes
      enhanced_attrs = Map.merge(lesson_attrs, %{
        module_id: module_id,
        content: multimodal_content.written_steps,
        visual_diagrams: multimodal_content.visual_diagrams,
        written_steps: multimodal_content.written_steps,
        audio_script: multimodal_content.audio_script,
        practice_activities: multimodal_content.practice_activities,
        interactive_elements: []  # Populated later with actual interactive components
      })

      Catalog.create_module_lesson(enhanced_attrs)
    else
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Batch generates content for multiple lessons in a module.
  """
  def generate_module_lessons(module, lesson_count \\ 3) do
    module_title = module.title

    # Generate lesson topics based on module objectives
    lesson_topics = case module.objectives do
      nil -> generate_default_topics(module_title, lesson_count)
      objectives when is_list(objectives) ->
        Enum.take(objectives, lesson_count)
        |> Enum.with_index(1)
        |> Enum.map(fn {objective, idx} -> "#{module_title} - Part #{idx}: #{objective}" end)
      _ -> generate_default_topics(module_title, lesson_count)
    end

    # Generate each lesson with multimodal content
    results = lesson_topics
    |> Enum.with_index(1)
    |> Enum.map(fn {topic, sequence} ->
      lesson_type = if sequence == lesson_count, do: "lab", else: "lesson"

      lesson_attrs = %{
        title: topic,
        sequence_number: sequence,
        lesson_type: lesson_type,
        duration_minutes: if(lesson_type == "lab", do: 120, else: 45),
        active: true
      }

      create_complete_lesson(module.id, lesson_attrs)
    end)

    # Check for errors
    errors = Enum.filter(results, fn
      {:error, _} -> true
      _ -> false
    end)

    if Enum.empty?(errors) do
      {:ok, Enum.map(results, fn {:ok, lesson} -> lesson end)}
    else
      {:error, "Some lessons failed to generate"}
    end
  end

  # Private helper functions

  defp generate_default_topics(module_title, count) do
    Enum.map(1..count, fn idx ->
      "#{module_title} - Part #{idx}"
    end)
  end

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
end
