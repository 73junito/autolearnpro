defmodule LmsApi.Repo.Migrations.CreateEnrollments do
  use Ecto.Migration

  def change do
    create table(:enrollments) do
      add :status, :string, null: false, default: "enrolled"
      add :enrolled_at, :naive_datetime, null: false
      add :completed_at, :naive_datetime
      add :progress_percentage, :integer, null: false, default: 0
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :course_id, :integer, null: false

      timestamps()
    end

    create index(:enrollments, [:user_id])
    create index(:enrollments, [:course_id])
    create unique_index(:enrollments, [:user_id, :course_id])
  end
end
