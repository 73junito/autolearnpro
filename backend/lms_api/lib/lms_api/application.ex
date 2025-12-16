defmodule LmsApi.Application do
  @moduledoc false
  use Application

  def start(_type, _args) do
    children = [
      LmsApi.Repo,
      {Phoenix.PubSub, name: LmsApi.PubSub},
      LmsApiWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: LmsApi.Supervisor]
    Supervisor.start_link(children, opts)
  end

  def config_change(changed, _new, removed) do
    LmsApiWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
