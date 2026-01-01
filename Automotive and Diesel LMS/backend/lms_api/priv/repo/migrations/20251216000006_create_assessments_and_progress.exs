defmodule LmsApi.Repo.Migrations.CreateAssessmentsAndProgress do
  use Ecto.Migration

  def change do
    # Assessments table
    create table(:assessments) do
      add :course_id, references(:courses, on_delete: :delete_all), null: false
      add :module_id, references(:course_modules, on_delete: :nilify_all)
      add :title, :string, null: false
      add :description, :text
      add :assessment_type, :string, null: false
      add :total_points, :integer, default: 100
      add :passing_score, :integer, default: 70
      add :time_limit_minutes, :integer
      add :attempts_allowed, :integer, default: 3
      add :active, :boolean, default: true, null: false

      timestamps()
    end

    create index(:assessments, [:course_id])
    create index(:assessments, [:module_id])

    # Assessment questions table
    create table(:assessment_questions) do
      add :assessment_id, references(:assessments, on_delete: :delete_all), null: false
      add :question_text, :text, null: false
      add :question_type, :string, null: false
      add :points, :integer, default: 1
      add :sequence_number, :integer
      add :options, :map
      add :correct_answer, :text
      add :explanation, :text

      timestamps()
    end

    create index(:assessment_questions, [:assessment_id])

    # Student progress table
    create table(:student_progress) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :lesson_id, references(:module_lessons, on_delete: :delete_all), null: false
      add :status, :string, default: "not_started"
      add :completion_percentage, :integer, default: 0
      add :time_spent_minutes, :integer, default: 0
      add :last_accessed_at, :naive_datetime
      add :completed_at, :naive_datetime

      timestamps()
    end

    create index(:student_progress, [:user_id])
    create index(:student_progress, [:lesson_id])
    create unique_index(:student_progress, [:user_id, :lesson_id])

    # Assessment attempts table
    create table(:assessment_attempts) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :assessment_id, references(:assessments, on_delete: :delete_all), null: false
      add :attempt_number, :integer, null: false
      add :score, :decimal, precision: 5, scale: 2
      add :status, :string, default: "in_progress"
      add :started_at, :naive_datetime
      add :submitted_at, :naive_datetime
      add :answers, :map

      timestamps()
    end

    create index(:assessment_attempts, [:user_id])
    create index(:assessment_attempts, [:assessment_id])
    create index(:assessment_attempts, [:user_id, :assessment_id])
  end
end
