defmodule LmsApi.QuestionBankManager do
  @moduledoc """
  Manages question bank expansion, generation, and organization.
  Supports ASE-certified questions across automotive and diesel topics.
  """

  import Ecto.Query
  alias LmsApi.Repo
  alias LmsApi.AIClient

  @doc """
  Generates bulk questions for a specific category and difficulty.

  ## Parameters
    - category: "diesel", "ev", "brakes", "electrical", "engine_performance"
    - difficulty: "easy", "medium", "hard"
    - count: number of questions to generate
    - ase_standards: optional list of ASE task references
  """
  def generate_bulk_questions(category, difficulty, count, opts \\ []) do
    ase_standards = Keyword.get(opts, :ase_standards, [])
    question_types = Keyword.get(opts, :question_types, ["multiple_choice", "true_false"])

    IO.puts("Generating #{count} #{difficulty} questions for #{category}...")

    # Generate questions in batches of 10 for better quality
    batch_size = 10
    batches = div(count, batch_size)
    remainder = rem(count, batch_size)

    results = for batch <- 1..batches do
      generate_question_batch(category, difficulty, batch_size, question_types, ase_standards)
    end

    # Generate remainder if any
    results = if remainder > 0 do
      results ++ [generate_question_batch(category, difficulty, remainder, question_types, ase_standards)]
    else
      results
    end

    # Flatten and process results
    questions = results
                |> Enum.filter(fn {:ok, q} -> true; _ -> false end)
                |> Enum.flat_map(fn {:ok, questions} -> questions end)

    {:ok, questions}
  end

  defp generate_question_batch(category, difficulty, count, question_types, ase_standards) do
    types_str = Enum.join(question_types, ", ")
    ase_context = if Enum.empty?(ase_standards) do
      ""
    else
      "\nASE Standards to reference: #{Enum.join(ase_standards, ", ")}"
    end

    prompt = """
    You are an ASE-certified Master Technician creating assessment questions.

    Category: #{category}
    Difficulty: #{difficulty}
    Question Types: #{types_str}
    Number of Questions: #{count}#{ase_context}

    Create #{count} unique, high-quality technical questions for #{category}.

    Requirements:
    1. Questions must be technically accurate and industry-relevant
    2. Align with ASE certification standards when possible
    3. Include realistic scenarios technicians face
    4. Vary question types (#{types_str})
    5. For multiple choice: provide 4 options with only one correct answer
    6. Include detailed explanations for the correct answer
    7. Add references to relevant ASE tasks or technical documentation

    Difficulty Guidelines:
    - Easy: Basic recall, definitions, simple concepts
    - Medium: Application of knowledge, diagnosis, procedures
    - Hard: Complex scenarios, advanced troubleshooting, calculations

    Return ONLY a JSON array with this structure:
    [
      {
        "question_type": "multiple_choice",
        "question_text": "What is the primary purpose of...",
        "question_data": {
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correct": 0
        },
        "difficulty": "#{difficulty}",
        "topic": "Specific topic name",
        "learning_objective": "What this question assesses",
        "ase_standard": "A5.A.1 or null",
        "points": 1,
        "explanation": "Detailed explanation of why the answer is correct",
        "reference_material": "ASE Study Guide A5, Chapter 3 or relevant source",
        "correct_feedback": "Correct! Detailed positive feedback",
        "incorrect_feedback": "Review the concept of... Try again."
      }
    ]

    No markdown formatting or additional text outside the JSON.
    """

    case AIClient.ask(prompt, model: "gpt-4o") do
      {:ok, response} ->
        parse_and_validate_questions(response, category)
      {:error, reason} ->
        IO.puts("Error generating batch: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp parse_and_validate_questions(response, category) do
    # Remove markdown code blocks if present
    json_str = response
               |> String.replace(~r/```json\n?/, "")
               |> String.replace(~r/```\n?/, "")
               |> String.trim()

    case Jason.decode(json_str) do
      {:ok, questions} when is_list(questions) ->
        validated = Enum.map(questions, &validate_question(&1, category))
        {:ok, validated}
      {:ok, _} ->
        {:error, "Expected array of questions"}
      {:error, reason} ->
        IO.puts("JSON parse error: #{inspect(reason)}")
        IO.puts("Response preview: #{String.slice(response, 0..500)}")
        {:error, "Failed to parse JSON"}
    end
  end

  defp validate_question(q, category) do
    # Ensure all required fields are present
    Map.merge(%{
      "question_type" => "multiple_choice",
      "difficulty" => "medium",
      "topic" => category,
      "learning_objective" => "Assess understanding of #{category}",
      "ase_standard" => nil,
      "points" => 1,
      "explanation" => "",
      "reference_material" => "",
      "correct_feedback" => "Correct!",
      "incorrect_feedback" => "Review this concept and try again."
    }, q)
  end

  @doc """
  Inserts questions into the database.
  Creates question bank if it doesn't exist.
  """
  def insert_questions(questions, category, difficulty) do
    # Get or create question bank
    {:ok, bank} = get_or_create_question_bank(category, difficulty)

    IO.puts("Inserting #{length(questions)} questions into bank: #{bank.name}")

    inserted = Enum.map(questions, fn q ->
      insert_question(q, bank.id)
    end)

    success_count = Enum.count(inserted, fn {:ok, _} -> true; _ -> false end)
    IO.puts("Successfully inserted #{success_count}/#{length(questions)} questions")

    {:ok, success_count}
  end

  defp get_or_create_question_bank(category, difficulty) do
    name = "#{String.capitalize(category)} - #{String.capitalize(difficulty)}"

    query = from qb in "question_banks",
            where: qb.name == ^name,
            select: %{id: qb.id, name: qb.name, category: qb.category}

    case Repo.one(query) do
      nil ->
        # Create new bank
        result = Repo.query(
          "INSERT INTO question_banks (name, description, category, difficulty, inserted_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, name, category",
          [name, "Questions for #{category} at #{difficulty} level", category, difficulty]
        )

        case result do
          {:ok, %{rows: [[id, name, cat]]}} ->
            {:ok, %{id: id, name: name, category: cat}}
          error ->
            {:error, "Failed to create question bank: #{inspect(error)}"}
        end

      bank ->
        {:ok, bank}
    end
  end

  defp insert_question(q, bank_id) do
    result = Repo.query(
      """
      INSERT INTO questions (
        question_bank_id, question_type, question_text, difficulty,
        topic, learning_objective, ase_standard, points,
        question_data, explanation, reference_material,
        correct_feedback, incorrect_feedback,
        inserted_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING id
      """,
      [
        bank_id,
        q["question_type"],
        q["question_text"],
        q["difficulty"],
        q["topic"],
        q["learning_objective"],
        q["ase_standard"],
        q["points"],
        Jason.encode!(q["question_data"]),
        q["explanation"],
        q["reference_material"],
        q["correct_feedback"],
        q["incorrect_feedback"]
      ]
    )

    case result do
      {:ok, %{rows: [[id]]}} ->
        {:ok, id}
      error ->
        IO.puts("Error inserting question: #{inspect(error)}")
        {:error, error}
    end
  end

  @doc """
  Validates questions for duplicates using similarity check.
  """
  def check_for_duplicates(new_questions, threshold \\ 0.85) do
    # Get existing questions
    existing = Repo.query!(
      "SELECT id, question_text FROM questions WHERE active = true",
      []
    )

    duplicates = Enum.filter(new_questions, fn new_q ->
      Enum.any?(existing.rows, fn [_id, existing_text] ->
        similarity = string_similarity(new_q["question_text"], existing_text)
        similarity > threshold
      end)
    end)

    {Enum.reject(new_questions, fn q -> Enum.member?(duplicates, q) end), duplicates}
  end

  defp string_similarity(str1, str2) do
    # Simple Jaccard similarity on words
    words1 = String.split(String.downcase(str1), ~r/\W+/, trim: true) |> MapSet.new()
    words2 = String.split(String.downcase(str2), ~r/\W+/, trim: true) |> MapSet.new()

    intersection = MapSet.intersection(words1, words2) |> MapSet.size()
    union = MapSet.union(words1, words2) |> MapSet.size()

    if union == 0, do: 0.0, else: intersection / union
  end

  @doc """
  Get statistics about question bank coverage.
  """
  def get_question_stats() do
    result = Repo.query!("""
      SELECT
        q.difficulty,
        qb.category,
        COUNT(*) as count,
        AVG(q.times_used)::INTEGER as avg_uses,
        AVG(CASE WHEN q.times_used > 0 THEN (q.times_correct::FLOAT / q.times_used * 100) ELSE 0 END)::INTEGER as avg_correct_pct
      FROM questions q
      LEFT JOIN question_banks qb ON q.question_bank_id = qb.id
      WHERE q.active = true
      GROUP BY q.difficulty, qb.category
      ORDER BY qb.category, q.difficulty
    """, [])

    result.rows
    |> Enum.map(fn [difficulty, category, count, avg_uses, avg_correct] ->
      %{
        difficulty: difficulty,
        category: category || "uncategorized",
        count: count,
        avg_uses: avg_uses || 0,
        avg_correct_percentage: avg_correct || 0
      }
    end)
  end
end
