defmodule LmsApiWeb.RateLimitPlug do
  @moduledoc """
  Plug for API rate limiting.
  """

  @behaviour Plug

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  def init(opts), do: opts

  def call(conn, opts) do
    limit = Keyword.get(opts, :limit, 100)
    window_seconds = Keyword.get(opts, :window, 3600)  # 1 hour default

    # Generate identifier (IP address or user ID)
    identifier = get_identifier(conn)

    case LmsApi.Scaling.check_rate_limit(identifier, "api_requests", limit, window_seconds) do
      {:ok, requests_used} ->
        # Add rate limit headers
        remaining = max(0, limit - requests_used)

        conn
        |> put_resp_header("x-ratelimit-limit", to_string(limit))
        |> put_resp_header("x-ratelimit-remaining", to_string(remaining))
        |> put_resp_header("x-ratelimit-reset", to_string(get_reset_time(window_seconds)))

      {:error, :rate_limited} ->
        # Rate limit exceeded
        conn
        |> put_status(429)
        |> put_resp_header("x-ratelimit-limit", to_string(limit))
        |> put_resp_header("x-ratelimit-remaining", "0")
        |> put_resp_header("x-ratelimit-reset", to_string(get_reset_time(window_seconds)))
        |> put_resp_header("retry-after", to_string(window_seconds))
        |> json(%{error: "Rate limit exceeded. Try again later."})
        |> halt()
    end
  end

  defp get_identifier(conn) do
    # Use user ID if authenticated, otherwise IP address
    case Guardian.Plug.current_resource(conn) do
      nil -> get_client_ip(conn)
      user -> "user:#{user.id}"
    end
  end

  defp get_client_ip(conn) do
    # Get client IP from various headers (considering proxies)
    conn.remote_ip
    |> Tuple.to_list()
    |> Enum.join(".")
  end

  defp get_reset_time(window_seconds) do
    # Calculate when the rate limit resets
    DateTime.utc_now()
    |> DateTime.add(window_seconds, :second)
    |> DateTime.to_unix()
  end
end