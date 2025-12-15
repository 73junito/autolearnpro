defmodule LmsApi.Application do
  @moduledoc false
  use Application

  def start(_type, _args) do
    # Core children
    base_children = [
      LmsApi.Repo,
      {Phoenix.PubSub, name: LmsApi.PubSub},
      LmsApiWeb.Endpoint
    ]

    # Start Redix if configured
    redis_url = Application.get_env(:lms_api, :redis_url) || System.get_env("REDIS_URL")

    children = if redis_url && redis_url != "" do
      # Use tuple child spec form compatible with different Redix versions
      redix_child = {Redix, {redis_url, [name: :redis]}}
      [redix_child | base_children]
    else
      base_children
    end

    opts = [strategy: :one_for_one, name: LmsApi.Supervisor]
    Supervisor.start_link(children, opts)
  end

  def config_change(changed, _new, removed) do
    LmsApiWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
