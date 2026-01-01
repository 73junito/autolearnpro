defmodule LmsApiWeb.Plugs.RateLimiter do
  @moduledoc """
  Rate limiting plug using Hammer for request throttling.

  Prevents API abuse by limiting requests per IP address and user.

  Configuration in config.exs:
      config :lms_api, LmsApiWeb.Plugs.RateLimiter,
        auth_limit: 5,
        auth_window_ms: 60_000,
        api_limit: 100,
        api_window_ms: 60_000

  Usage in router:
      plug LmsApiWeb.Plugs.RateLimiter, bucket: :auth
      plug LmsApiWeb.Plugs.RateLimiter, bucket: :api
  """

  import Plug.Conn
  require Logger

  @behaviour Plug

  @impl true
  def init(opts) do
    bucket = Keyword.get(opts, :bucket, :api)

    config = Application.get_env(:lms_api, __MODULE__, [])

    limit = case bucket do
      :auth -> Keyword.get(config, :auth_limit, 5)
      :api -> Keyword.get(config, :api_limit, 100)
      _ -> 100
    end

    window_ms = case bucket do
      :auth -> Keyword.get(config, :auth_window_ms, 60_000)
      :api -> Keyword.get(config, :api_window_ms, 60_000)
      _ -> 60_000
    end

    %{
      bucket: bucket,
      limit: limit,
      window_ms: window_ms
    }
  end

  @impl true
  def call(conn, opts) do
    key = rate_limit_key(conn, opts.bucket)

    case check_rate_limit(key, opts.limit, opts.window_ms) do
      {:allow, count} ->
        conn
        |> put_resp_header("x-ratelimit-limit", to_string(opts.limit))
        |> put_resp_header("x-ratelimit-remaining", to_string(opts.limit - count))
        |> put_resp_header("x-ratelimit-reset", to_string(System.system_time(:second) + div(opts.window_ms, 1000)))

      {:deny, _retry_after} ->
        Logger.warning("Rate limit exceeded for key: #{key}, bucket: #{opts.bucket}")

        conn
        |> put_resp_header("x-ratelimit-limit", to_string(opts.limit))
        |> put_resp_header("x-ratelimit-remaining", "0")
        |> put_resp_header("retry-after", to_string(div(opts.window_ms, 1000)))
        |> send_resp(429, Jason.encode!(%{
          error: "Too many requests",
          message: "Rate limit exceeded. Please try again later.",
          retry_after_seconds: div(opts.window_ms, 1000)
        }))
        |> halt()
    end
  end

  defp rate_limit_key(conn, bucket) do
    # Use user ID if authenticated, otherwise use IP address
    user_id = case Guardian.Plug.current_resource(conn) do
      nil -> nil
      user -> user.id
    end

    ip_address = get_client_ip(conn)

    identifier = user_id || ip_address
    "rate_limit:#{bucket}:#{identifier}"
  end

  defp get_client_ip(conn) do
    # Try to get real IP from CloudflareRemoteIp plug first
    case get_req_header(conn, "cf-connecting-ip") do
      [ip | _] -> ip
      [] ->
        # Fall back to remote_ip
        case conn.remote_ip do
          {a, b, c, d} -> "#{a}.#{b}.#{c}.#{d}"
          ip -> to_string(ip)
        end
    end
  end

  defp check_rate_limit(key, limit, window_ms) do
    case Hammer.check_rate(key, window_ms, limit) do
      {:allow, count} -> {:allow, count}
      {:deny, retry_after} -> {:deny, retry_after}
      # If Hammer is not configured, allow all requests
      _ -> {:allow, 0}
    end
  end
end
