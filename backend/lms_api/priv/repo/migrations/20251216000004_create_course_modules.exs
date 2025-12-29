defmodule LmsApi.Repo.Migrations.CreateCourseModules do
  use Ecto.Migration

  def change do
    create table(:course_modules) do
      add :course_id, references(:courses, on_delete: :delete_all), null: false
      add :title, :string, null: false
      add :description, :text
      add :sequence_number, :integer, null: false
      add :duration_weeks, :integer
      add :objectives, {:array, :text}
      add :active, :boolean, default: true, null: false

      timestamps()
    end

    create index(:course_modules, [:course_id])
    create index(:course_modules, [:course_id, :sequence_number])
  end
end
