defmodule LmsApiWeb.Plugs.RedactionPlug do
  @moduledoc "Plug to redact sensitive fields from request params before they are logged or exported." 

  import Plug.Conn
  alias LmsApi.Redactor

  def init(opts), do: opts

  def call(%Plug.Conn{params: params} = conn, _opts) do
    sanitized = Redactor.sanitize(params || %{})
    conn
    |> assign(:sanitized_params, sanitized)
    |> Map.put(:params, sanitized)
  end
end
