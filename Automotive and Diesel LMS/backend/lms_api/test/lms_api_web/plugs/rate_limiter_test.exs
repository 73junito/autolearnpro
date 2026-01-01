defmodule LmsApiWeb.Plugs.RateLimiterTest do
  use ExUnit.Case, async: false
  use Plug.Test

  alias LmsApiWeb.Plugs.RateLimiter

  setup do
    # Configure test rate limits
    Application.put_env(:lms_api, RateLimiter,
      auth_limit: 3,
      auth_window_ms: 10_000,
      api_limit: 5,
      api_window_ms: 10_000
    )

    # Start Hammer if not running
    case Process.whereis(Hammer.Supervisor) do
      nil ->
        {:ok, _} = Hammer.start_link(
          backend: {Hammer.Backend.ETS, [
            expiry_ms: 60_000,
            cleanup_interval_ms: 60_000
          ]}
        )
      _ -> :ok
    end

    :ok
  end

  describe "rate limiting" do
    test "allows requests under limit" do
      opts = RateLimiter.init(bucket: :api)

      conn = conn(:get, "/api/test")
      conn = RateLimiter.call(conn, opts)

      refute conn.halted
      assert get_resp_header(conn, "x-ratelimit-remaining") != []
    end

    test "blocks requests over limit" do
      opts = RateLimiter.init(bucket: :api)
      limit = opts.limit

      # Make requests up to limit
      Enum.each(1..limit, fn _ ->
        conn = conn(:get, "/api/test")
        RateLimiter.call(conn, opts)
      end)

      # Next request should be blocked
      conn = conn(:get, "/api/test")
      conn = RateLimiter.call(conn, opts)

      assert conn.halted
      assert conn.status == 429
      assert get_resp_header(conn, "retry-after") != []
    end

    test "sets rate limit headers" do
      opts = RateLimiter.init(bucket: :api)

      conn = conn(:get, "/api/test")
      conn = RateLimiter.call(conn, opts)

      assert get_resp_header(conn, "x-ratelimit-limit") == [to_string(opts.limit)]
      assert get_resp_header(conn, "x-ratelimit-remaining") != []
      assert get_resp_header(conn, "x-ratelimit-reset") != []
    end

    test "uses different limits for different buckets" do
      auth_opts = RateLimiter.init(bucket: :auth)
      api_opts = RateLimiter.init(bucket: :api)

      assert auth_opts.limit == 3
      assert api_opts.limit == 5
    end

    test "tracks rate limits per IP address" do
      opts = RateLimiter.init(bucket: :api)

      # Requests from IP 1
      conn1 = conn(:get, "/api/test")
        |> Map.put(:remote_ip, {192, 168, 1, 1})

      conn1 = RateLimiter.call(conn1, opts)
      refute conn1.halted

      # Requests from IP 2 should have separate limit
      conn2 = conn(:get, "/api/test")
        |> Map.put(:remote_ip, {192, 168, 1, 2})

      conn2 = RateLimiter.call(conn2, opts)
      refute conn2.halted
    end
  end
end
