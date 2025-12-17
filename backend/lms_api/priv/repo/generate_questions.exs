# Script to generate bulk questions
# Usage: mix run priv/repo/generate_questions.exs

alias LmsApi.QuestionBankManager
alias LmsApi.Repo

IO.puts("===========================================")
IO.puts("Question Bank Expansion Script")
IO.puts("===========================================")

# Test configuration
categories = [
  {"ev", "medium", 10, ["L3.A.1", "L3.A.2", "L3.B.1"]},
  {"diesel", "easy", 10, ["T2.A.1", "T2.B.1"]},
  {"brakes", "medium", 10, ["A5.A.1", "A5.B.1"]}
]

total_generated = 0

for {category, difficulty, count, ase_standards} <- categories do
  IO.puts("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  IO.puts("Category: #{category} (#{difficulty}) - #{count} questions")
  IO.puts("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  case QuestionBankManager.generate_bulk_questions(category, difficulty, count, ase_standards: ase_standards) do
    {:ok, questions} ->
      IO.puts("✓ Generated: #{length(questions)} questions")

      # Check for duplicates
      {unique, duplicates} = QuestionBankManager.check_for_duplicates(questions)
      IO.puts("  Unique: #{length(unique)}, Duplicates: #{length(duplicates)}")

      # Insert into database
      case QuestionBankManager.insert_questions(unique, category, difficulty) do
        {:ok, inserted_count} ->
          IO.puts("✓ Inserted: #{inserted_count} questions")
          total_generated = total_generated + inserted_count

        {:error, reason} ->
          IO.puts("✗ Insert failed: #{inspect(reason)}")
      end

    {:error, reason} ->
      IO.puts("✗ Generation failed: #{inspect(reason)}")
  end

  # Small delay between categories
  :timer.sleep(2000)
end

IO.puts("\n===========================================")
IO.puts("Total generated: #{total_generated} questions")
IO.puts("===========================================")

# Show statistics
IO.puts("\nQuestion Bank Statistics:")
stats = QuestionBankManager.get_question_stats()

Enum.each(stats, fn s ->
  IO.puts("  #{s.category} (#{s.difficulty}): #{s.count} questions")
end)

total = Enum.reduce(stats, 0, fn s, acc -> acc + s.count end)
IO.puts("\nTotal questions in bank: #{total}")

IO.puts("\n✓ Script completed!")
