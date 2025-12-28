defmodule LmsApiWeb.PerformanceMiddleware do
  @moduledoc """
  Performance monitoring middleware for API endpoints.
  """

  @behaviour Plug

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, opts) do
    start_time = System.monotonic_time(:millisecond)

    try do
      # Call the next plug in the pipeline
      conn = call_next_plug(conn, opts)

      # Measure response time
      end_time = System.monotonic_time(:millisecond)
      response_time = end_time - start_time

      # Monitor API performance
      LmsApi.Monitoring.monitor_api_endpoint(
        "#{conn.method} #{conn.request_path}",
        response_time,
        conn.status
      )

      # Add performance headers
      conn
      |> put_resp_header("x-response-time", "#{response_time}ms")
      |> put_resp_header("x-server-timing", "total;dur=#{response_time}")

    rescue
      error ->
        # Handle errors
        end_time = System.monotonic_time(:millisecond)
        response_time = end_time - start_time

        LmsApi.Monitoring.monitor_api_endpoint(
          "#{conn.method} #{conn.request_path}",
          response_time,
          500
        )

        # Re-raise the error
        raise error
    end
  end

  defp call_next_plug(conn, []), do: conn
  defp call_next_plug(conn, [plug | rest]) do
    case plug do
      {module, opts} -> module.call(conn, opts)
      module when is_atom(module) -> module.call(conn, [])
    end
  end
end