# Script for generating robust multimodal content for all catalog courses
# Generates complete course structure with modules, lessons, and all 4 learning modalities

alias LmsApi.Repo
alias LmsApi.Catalog
alias LmsApi.MultimodalContentGenerator
alias LmsApi.Catalog.{Course, CourseModule}

require Logger

defmodule CourseContentBuilder do
  @moduledoc """
  Builds complete course content with AI-generated multimodal lessons.
  """

  def build_all_courses do
    IO.puts("\n🚀 Starting robust course content generation for entire catalog...")
    IO.puts("=" |> String.duplicate(70))

    courses = Repo.all(Course) |> Repo.preload([:modules, :syllabus])
    total_courses = length(courses)

    IO.puts("📚 Found #{total_courses} courses to build")
    IO.puts("")

    results = Enum.with_index(courses, 1)
    |> Enum.map(fn {course, idx} ->
      IO.puts("[#{idx}/#{total_courses}] Building: #{course.code} - #{course.title}")
      build_course_content(course)
    end)

    success_count = Enum.count(results, fn {status, _} -> status == :ok end)

    IO.puts("\n" <> ("=" |> String.duplicate(70)))
    IO.puts("✅ Course content generation complete!")
    IO.puts("   Successful: #{success_count}/#{total_courses}")
    IO.puts("   Failed: #{total_courses - success_count}")
  end

  defp build_course_content(course) do
    with {:ok, _syllabus} <- ensure_syllabus(course),
         {:ok, modules} <- generate_modules(course),
         {:ok, _lessons} <- generate_lessons_for_modules(modules) do

      IO.puts("   ✓ #{course.code}: Complete with syllabus, modules, and lessons")
      {:ok, course}
    else
      {:error, reason} ->
        IO.puts("   ✗ #{course.code}: Failed - #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp ensure_syllabus(course) do
    case course.syllabus do
      nil ->
        IO.puts("   → Generating syllabus...")
        create_syllabus(course)
      syllabus ->
        {:ok, syllabus}
    end
  end

  defp create_syllabus(course) do
    # Generate learning outcomes based on course level and type
    outcomes = generate_learning_outcomes(course)

    syllabus_attrs = %{
      course_id: course.id,
      learning_outcomes: outcomes,
      assessment_methods: [
        "Hands-on practical assessments",
        "Written quizzes and module exams",
        "Lab performance evaluations",
        "Virtual simulation exercises",
        "Project-based assessments"
      ],
      grading_breakdown: %{
        "labs" => 35,
        "quizzes" => 20,
        "midterm" => 15,
        "final_exam" => 20,
        "participation" => 10
      },
      prerequisites: determine_prerequisites(course),
      required_materials: "Safety glasses, course textbook, lab manual, diagnostic tools (provided)",
      course_policies: "Attendance required for lab sessions. Safety violations result in immediate dismissal from class."
    }

    Catalog.create_course_syllabus(syllabus_attrs)
  end

  defp generate_learning_outcomes(course) do
    base_outcomes = [
      "Demonstrate professional shop safety practices and proper tool usage",
      "Apply systematic diagnostic procedures to identify system issues"
    ]

    # Add course-specific outcomes based on course code
    specific_outcomes = cond do
      String.starts_with?(course.code, "AUT") ->
        ["Perform service and repair procedures on automotive systems",
         "Interpret technical service information and wiring diagrams",
         "Use diagnostic scan tools and test equipment effectively"]

      String.starts_with?(course.code, "DSL") ->
        ["Service and maintain diesel engine components and systems",
         "Diagnose diesel-specific issues using proper procedures",
         "Explain diesel combustion principles and emission controls"]

      String.starts_with?(course.code, "EV") ->
        ["Follow high-voltage safety protocols and lockout/tagout procedures",
         "Diagnose electric vehicle systems using specialized equipment",
         "Explain battery management and charging system operation"]

      String.starts_with?(course.code, "VLB") ->
        ["Navigate virtual diagnostic environments effectively",
         "Complete simulated repair procedures accurately",
         "Interpret virtual test results and diagnostic data"]

      true ->
        ["Apply theoretical knowledge to practical situations",
         "Work effectively in team-based scenarios"]
    end

    base_outcomes ++ specific_outcomes
  end

  defp determine_prerequisites(course) do
    cond do
      course.level == "lower_division" and String.contains?(course.code, "100") ->
        []

      course.level == "lower_division" and String.contains?(course.code, ["180", "170"]) ->
        ["Completion of entry-level course in same program"]

      course.level == "upper_division" ->
        ["Completion of lower division core courses", "Instructor approval"]

      String.contains?(course.code, "490") ->
        ["Completion of all program core courses", "Senior standing"]

      true ->
        []
    end
  end

  defp generate_modules(course) do
    existing_modules = course.modules || []

    if length(existing_modules) >= 4 do
      IO.puts("   → Using existing modules (#{length(existing_modules)})")
      {:ok, existing_modules}
    else
      IO.puts("   → Generating 4 course modules...")
      create_course_modules(course)
    end
  end

  defp create_course_modules(course) do
    # Define module structure based on course type
    module_templates = get_module_templates(course)

    results = Enum.with_index(module_templates, 1)
    |> Enum.map(fn {template, sequence} ->
      module_attrs = %{
        course_id: course.id,
        title: template.title,
        description: template.description,
        sequence_number: sequence,
        duration_weeks: 2,
        objectives: template.objectives,
        active: true
      }

      Catalog.create_course_module(module_attrs)
    end)

    # Check for errors
    case Enum.find(results, fn result -> match?({:error, _}, result) end) do
      nil -> {:ok, Enum.map(results, fn {:ok, mod} -> mod end)}
      error -> error
    end
  end

  defp get_module_templates(course) do
    cond do
      String.starts_with?(course.code, "AUT-120") ->
        [
          %{title: "Brake Safety & Hydraulic Fundamentals",
            description: "Introduction to brake system safety, tools, and hydraulic principles",
            objectives: ["Identify brake system components", "Explain Pascal's principle", "Perform brake safety inspection"]},
          %{title: "Disc Brake Service & Repair",
            description: "Complete coverage of disc brake operation, service, and troubleshooting",
            objectives: ["Service disc brake calipers", "Measure rotor thickness", "Diagnose brake noise issues"]},
          %{title: "Drum Brake Systems",
            description: "Drum brake components, adjustment, and service procedures",
            objectives: ["Identify drum brake components", "Adjust brake shoes", "Diagnose brake pull conditions"]},
          %{title: "ABS & Electronic Brake Systems",
            description: "Anti-lock braking systems, traction control, and stability systems",
            objectives: ["Explain ABS operation", "Use scan tool for ABS diagnosis", "Bleed ABS systems properly"]}
        ]

      String.starts_with?(course.code, "AUT-140") ->
        [
          %{title: "Engine Fundamentals & Theory",
            description: "Four-stroke cycle, engine terminology, and basic operation",
            objectives: ["Explain four-stroke cycle", "Identify engine components", "Measure engine specifications"]},
          %{title: "Ignition & Fuel Systems",
            description: "Ignition timing, fuel delivery, and combustion principles",
            objectives: ["Test ignition components", "Explain fuel injection operation", "Diagnose no-start conditions"]},
          %{title: "Engine Performance Diagnostics",
            description: "Systematic approach to diagnosing drivability issues",
            objectives: ["Use scan tool effectively", "Interpret diagnostic codes", "Perform cylinder power balance"]},
          %{title: "Emission Controls & Testing",
            description: "Emission systems, catalytic converters, and emission testing",
            objectives: ["Identify emission components", "Perform emission tests", "Diagnose catalyst efficiency"]}
        ]

      String.starts_with?(course.code, "DSL") ->
        [
          %{title: "Diesel Engine Principles",
            description: "Compression ignition, diesel combustion, and engine design",
            objectives: ["Explain diesel combustion", "Identify diesel components", "Describe injection timing"]},
          %{title: "Diesel Fuel Systems",
            description: "Mechanical and electronic fuel injection systems",
            objectives: ["Service fuel filters", "Test injection pumps", "Diagnose fuel delivery issues"]},
          %{title: "Air Induction & Turbocharging",
            description: "Turbochargers, intercoolers, and air intake systems",
            objectives: ["Test boost pressure", "Diagnose turbo failures", "Service air intake systems"]},
          %{title: "Diesel Maintenance & Troubleshooting",
            description: "Preventive maintenance and systematic diagnostics",
            objectives: ["Perform diesel PM service", "Diagnose hard start issues", "Test compression"]}
        ]

      String.starts_with?(course.code, "EV") ->
        [
          %{title: "High-Voltage Safety",
            description: "EV safety protocols, PPE, and lockout/tagout procedures",
            objectives: ["Follow HV safety procedures", "Use PPE correctly", "Perform lockout/tagout"]},
          %{title: "Electric Motor & Power Electronics",
            description: "Electric motor operation, inverters, and controllers",
            objectives: ["Explain motor operation", "Identify power electronics", "Test motor circuits safely"]},
          %{title: "Battery Systems & Management",
            description: "Battery technology, BMS, thermal management",
            objectives: ["Explain battery chemistry", "Interpret BMS data", "Test battery modules safely"]},
          %{title: "Charging Systems & Infrastructure",
            description: "Level 1/2/3 charging, DC fast charging, grid integration",
            objectives: ["Explain charging standards", "Diagnose charging issues", "Service charging ports"]}
        ]

      true ->
        # Generic module structure
        [
          %{title: "#{course.title} - Fundamentals",
            description: "Introduction to core concepts and safety",
            objectives: ["Understand basic principles", "Apply safety procedures", "Use proper tools"]},
          %{title: "#{course.title} - Systems & Components",
            description: "Detailed study of system components and operation",
            objectives: ["Identify major components", "Explain system operation", "Perform basic tests"]},
          %{title: "#{course.title} - Diagnostics & Service",
            description: "Diagnostic procedures and service techniques",
            objectives: ["Use diagnostic tools", "Follow service procedures", "Interpret test results"]},
          %{title: "#{course.title} - Advanced Applications",
            description: "Advanced topics and real-world scenarios",
            objectives: ["Solve complex problems", "Apply advanced techniques", "Complete practical assessment"]}
        ]
    end
  end

  defp generate_lessons_for_modules(modules) do
    IO.puts("   → Generating multimodal lessons for #{length(modules)} modules...")

    results = Enum.flat_map(modules, fn module ->
      IO.puts("      • Module #{module.sequence_number}: #{module.title}")

      # Generate 3 lessons per module (2 regular + 1 lab)
      lesson_types = [
        {1, "lesson", 45},
        {2, "lesson", 45},
        {3, "lab", 90}
      ]

      Enum.map(lesson_types, fn {seq, type, duration} ->
        generate_multimodal_lesson(module, seq, type, duration)
      end)
    end)

    # Check for errors
    errors = Enum.filter(results, fn result -> match?({:error, _}, result) end)

    if Enum.empty?(errors) do
      {:ok, Enum.map(results, fn {:ok, lesson} -> lesson end)}
    else
      {:error, "Some lessons failed to generate"}
    end
  end

  defp generate_multimodal_lesson(module, sequence, lesson_type, duration) do
    # Create lesson title based on module objectives
    lesson_title = create_lesson_title(module, sequence, lesson_type)

    # Determine difficulty
    difficulty = if module.sequence_number <= 2, do: "beginner", else: "intermediate"

    IO.puts("        - Lesson #{sequence}: #{lesson_title} (#{lesson_type})")

    # Generate multimodal content using AI
    case MultimodalContentGenerator.generate_multimodal_lesson(lesson_title, lesson_type, difficulty) do
      {:ok, content} ->
        lesson_attrs = %{
          module_id: module.id,
          title: lesson_title,
          sequence_number: sequence,
          lesson_type: lesson_type,
          duration_minutes: duration,
          content: content.written_steps,
          visual_diagrams: content.visual_diagrams,
          written_steps: content.written_steps,
          audio_script: content.audio_script,
          practice_activities: content.practice_activities,
          active: true
        }

        Catalog.create_module_lesson(lesson_attrs)

      {:error, reason} ->
        # Fallback: Create lesson without AI content
        IO.puts("        ⚠ AI generation failed, creating basic lesson")
        create_basic_lesson(module, sequence, lesson_title, lesson_type, duration)
    end
  end

  defp create_lesson_title(module, sequence, lesson_type) do
    objectives = module.objectives || []

    if length(objectives) >= sequence do
      objective = Enum.at(objectives, sequence - 1)
      if lesson_type == "lab" do
        "Hands-On Lab: #{objective}"
      else
        objective
      end
    else
      "#{module.title} - Part #{sequence}"
    end
  end

  defp create_basic_lesson(module, sequence, title, lesson_type, duration) do
    basic_content = """
    # #{title}

    ## Learning Objectives
    - Understand key concepts
    - Apply proper procedures
    - Complete practical exercises

    ## Safety Considerations
    - Wear appropriate PPE
    - Follow shop safety rules
    - Use tools properly

    ## Procedure
    1. Review safety requirements
    2. Gather required tools
    3. Follow step-by-step instructions
    4. Complete verification checks

    ## Assessment
    Complete the practice activities to demonstrate understanding.
    """

    lesson_attrs = %{
      module_id: module.id,
      title: title,
      sequence_number: sequence,
      lesson_type: lesson_type,
      duration_minutes: duration,
      content: basic_content,
      written_steps: basic_content,
      active: true
    }

    Catalog.create_module_lesson(lesson_attrs)
  end
end

# Execute the build process
IO.puts("\n" <> ("=" |> String.duplicate(70)))
IO.puts("  ROBUST COURSE CONTENT GENERATION")
IO.puts("  Automotive & Diesel LMS - Complete Catalog")
IO.puts("=" |> String.duplicate(70))
IO.puts("")
IO.puts("This script will:")
IO.puts("  1. Generate syllabi for all courses")
IO.puts("  2. Create 4 modules per course")
IO.puts("  3. Generate 3 multimodal lessons per module")
IO.puts("  4. Include all 4 learning modalities:")
IO.puts("     • Visual diagrams")
IO.puts("     • Written steps")
IO.puts("     • Audio scripts")
IO.puts("     • Interactive practice")
IO.puts("")
IO.puts("Total expected output:")
IO.puts("  • 25 courses with syllabi")
IO.puts("  • 100 modules (4 per course)")
IO.puts("  • 300 lessons (3 per module)")
IO.puts("")
IO.puts("⏱️  Estimated time: 15-20 minutes")
IO.puts("")

# Confirm before starting
IO.puts("Press ENTER to begin content generation...")
IO.gets("")

CourseContentBuilder.build_all_courses()

IO.puts("\n✨ Course content generation complete!")
IO.puts("\nNext steps:")
IO.puts("  • Review generated content in database")
IO.puts("  • Generate images for visual diagrams")
IO.puts("  • Create audio narration files")
IO.puts("  • Deploy to frontend for student access")
