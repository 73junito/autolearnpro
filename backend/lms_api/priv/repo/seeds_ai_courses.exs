# Script for populating the database with AI-generated course content
# Run with: mix run priv/repo/seeds_ai_courses.exs

alias LmsApi.Repo
alias LmsApi.Catalog
alias LmsApi.AIContentGenerator

IO.puts("🤖 Starting AI-powered course generation...")

# Sample courses from the catalog
courses_to_generate = [
  %{
    code: "AUT-120",
    title: "Introduction to Brake Systems",
    description: """
    Comprehensive introduction to automotive brake systems including hydraulic theory,
    brake components, diagnosis, and repair procedures. Covers disc and drum brakes,
    ABS systems, and brake fluid maintenance.
    """,
    credits: 4.0,
    delivery_mode: "hybrid",
    level: "lower_division",
    duration_hours: 60,
    active: true
  },
  %{
    code: "AUT-140",
    title: "Engine Fundamentals",
    description: """
    Foundation course covering internal combustion engine theory, components, and operation.
    Includes four-stroke cycle, engine measurements, compression testing, and basic diagnostics.
    """,
    credits: 5.0,
    delivery_mode: "hybrid",
    level: "lower_division",
    duration_hours: 75,
    active: true
  },
  %{
    code: "DSL-160",
    title: "Diesel Engine Operation",
    description: """
    Introduction to diesel engine principles, fuel systems, combustion characteristics,
    and maintenance procedures. Covers direct and indirect injection, glow plugs, and
    diesel-specific diagnostic techniques.
    """,
    credits: 5.0,
    delivery_mode: "hybrid",
    level: "lower_division",
    duration_hours: 75,
    active: true
  }
]

# Generate courses with AI content
Enum.each(courses_to_generate, fn course_attrs ->
  IO.puts("\n📚 Generating course: #{course_attrs.code} - #{course_attrs.title}")

  # Check if course already exists
  case Repo.get_by(Catalog.Course, code: course_attrs.code) do
    nil ->
      case AIContentGenerator.generate_complete_course(course_attrs) do
        {:ok, course} ->
          IO.puts("   ✅ Successfully generated #{course.code}")
          IO.puts("      - Learning outcomes created")
          IO.puts("      - 4 modules generated")
          IO.puts("      - 12 lessons created (3 per module)")

        {:error, reason} ->
          IO.puts("   ❌ Failed to generate #{course_attrs.code}: #{inspect(reason)}")
      end

    existing ->
      IO.puts("   ⏭️  Skipping #{course_attrs.code} - already exists (id: #{existing.id})")
  end

  # Add a small delay to avoid overwhelming the AI service
  Process.sleep(2_000)
end)

IO.puts("\n✨ AI course generation complete!")
IO.puts("\nYou can now:")
IO.puts("  1. View courses in the database")
IO.puts("  2. Run stress tests against AI endpoints")
IO.puts("  3. Generate additional courses as needed")
