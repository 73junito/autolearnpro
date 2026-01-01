defmodule LmsApi.Repo.Migrations.CreateModuleLessons do
  use Ecto.Migration

  def change do
    create table(:module_lessons) do
      add :module_id, references(:course_modules, on_delete: :delete_all), null: false
      add :title, :string, null: false
      add :description, :text
      add :content, :text
      add :sequence_number, :integer, null: false
      add :lesson_type, :string, default: "lecture"
      add :duration_minutes, :integer
      add :objectives, {:array, :text}
      add :media_url, :string
      add :active, :boolean, default: true, null: false

      timestamps()
    end

    create index(:module_lessons, [:module_id])
    create index(:module_lessons, [:module_id, :sequence_number])
  end
end
