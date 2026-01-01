defmodule LmsApi.Security.AuditLog do
  use Ecto.Schema
  import Ecto.Changeset

  schema "audit_logs" do
    field :action, :string
    field :description, :string
    field :metadata, :map, default: %{}
    field :ip_address, :string
    field :user_agent, :string

    belongs_to :user, LmsApi.Accounts.User

    timestamps()
  end

  @doc false
  def changeset(audit_log, attrs) do
    audit_log
    |> cast(attrs, [:user_id, :action, :description, :metadata, :ip_address, :user_agent])
    |> validate_required([:user_id, :action, :description])
    |> assoc_constraint(:user)
  end
end