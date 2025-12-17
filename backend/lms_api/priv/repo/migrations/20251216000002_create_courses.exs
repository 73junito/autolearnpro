defmodule LmsApi.Repo.Migrations.CreateCourses do
  use Ecto.Migration

  def change do
    create table(:courses) do
      add :code, :string, null: false
      add :title, :string, null: false
      add :description, :text
      add :credits, :integer, null: false
      add :delivery_mode, :string, null: false, default: "online"
      add :level, :string
      add :duration_hours, :integer
      add :active, :boolean, default: true, null: false

      timestamps()
    end

    create unique_index(:courses, [:code])
    create index(:courses, [:active])
    create index(:courses, [:level])
  end
end
