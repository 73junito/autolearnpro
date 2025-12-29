defmodule LmsApiWeb.CachePlug do
  @moduledoc """
  Plug for caching API responses.
  """

  @behaviour Plug

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, opts) do
    cache_ttl = Keyword.get(opts, :ttl, 300)  # 5 minutes default
    cache_key = generate_cache_key(conn)

    # Check if response is cached
    case LmsApi.Cache.get(cache_key) do
      {:ok, nil} ->
        # Cache miss - add cache header to response
        conn
        |> put_resp_header("x-cache-status", "miss")
        |> register_before_send(&cache_response(&1, cache_key, cache_ttl))

      {:ok, cached_response} ->
        # Cache hit - return cached response
        conn
        |> put_resp_header("x-cache-status", "hit")
        |> send_cached_response(cached_response)
        |> halt()
    end
  end

  defp generate_cache_key(conn) do
    # Generate cache key based on request
    user_id = case Guardian.Plug.current_resource(conn) do
      nil -> "anonymous"
      user -> user.id
    end

    query_string = case conn.query_string do
      "" -> ""
      qs -> "?#{qs}"
    end

    "api:#{user_id}:#{conn.method}:#{conn.request_path}#{query_string}"
  end

  defp cache_response(conn, cache_key, ttl) do
    # Only cache successful GET responses
    if conn.method == "GET" and conn.status >= 200 and conn.status < 300 do
      response_body = case conn.resp_body do
        body when is_binary(body) -> body
        _ -> ""
      end

      cached_data = %{
        status: conn.status,
        headers: conn.resp_headers,
        body: response_body,
        cached_at: DateTime.utc_now()
      }

      LmsApi.Cache.set(cache_key, cached_data, ttl: ttl)
    end

    conn
  end

  defp send_cached_response(conn, cached_data) do
    # Restore cached response
    conn
    |> put_status(cached_data.status)
    |> merge_resp_headers(cached_data.headers)
    |> put_resp_header("x-cached-at", DateTime.to_iso8601(cached_data.cached_at))
    |> send_resp(cached_data.status, cached_data.body)
  end
end