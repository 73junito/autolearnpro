defmodule LmsApiWeb.Plugs.RedactionPlug do
  @moduledoc "Plug to redact sensitive fields from request params before they are logged or exported." 

  import Plug.Conn
  alias LmsApi.Redactor

  def init(opts), do: opts

  def call(%Plug.Conn{params: params} = conn, _opts) do
    params_to_sanitize =
      cond do
        is_struct(params) -> %{}
        params == nil -> %{}
        true -> params
      end

    sanitized = Redactor.sanitize(params_to_sanitize)

    conn
    |> assign(:sanitized_params, sanitized)
    |> Map.put(:params, sanitized)
  end
end
