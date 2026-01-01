defmodule LmsApi.Repo.Migrations.CreateCourseSyllabus do
  use Ecto.Migration

  def change do
    create table(:course_syllabus) do
      add :course_id, references(:courses, on_delete: :delete_all), null: false
      add :learning_outcomes, {:array, :text}
      add :assessment_methods, {:array, :text}
      add :grading_breakdown, :map
      add :prerequisites, {:array, :string}
      add :required_materials, :text
      add :course_policies, :text

      timestamps()
    end

    create unique_index(:course_syllabus, [:course_id])
  end
end
