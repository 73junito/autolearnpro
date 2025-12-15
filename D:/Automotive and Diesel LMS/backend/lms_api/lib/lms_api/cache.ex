defmodule LmsApi.Cache do
    @moduledoc """
    Redis-backed cache wrapper. Falls back to safe no-op behavior
    when Redis/Redix are not available so that features depending
    on caching won't crash in development.
    """

    require Logger

    @cache_ttl_default 3600

    @doc "Get a key from cache. Returns `{:ok, value}` or `{:error, reason}`."
    def get(key) when is_binary(key) do
        if redix_available?() do
            case Redix.command(:redis, ["GET", key]) do
                {:ok, nil} -> {:ok, nil}
                {:ok, value} -> decode_value(value)
                {:error, reason} ->
                    Logger.debug("Cache GET error for #{key}: #{inspect(reason)}")
                    {:error, reason}
            end
        else
            {:ok, nil}
        end
    end

    @doc "Set a key in cache. Accepts `ttl` in seconds via opts."
    def set(key, value, opts \\ []) when is_binary(key) do
        ttl = Keyword.get(opts, :ttl, @cache_ttl_default)

        if redix_available?() do
            val = encode_value(value)

            cmd =
                if is_integer(ttl) and ttl > 0 do
                    ["SET", key, val, "EX", to_string(ttl)]
                else
                    ["SET", key, val]
                end

            case Redix.command(:redis, cmd) do
                {:ok, _} -> :ok
                {:error, reason} ->
                    Logger.debug("Cache SET error for #{key}: #{inspect(reason)}")
                    {:error, reason}
            end
        else
            :ok
        end
    end

    @doc "Delete a key from cache."
    def delete(key) when is_binary(key) do
        if redix_available?() do
            case Redix.command(:redis, ["DEL", key]) do
                {:ok, _} -> :ok
                {:error, reason} ->
                    Logger.debug("Cache DEL error for #{key}: #{inspect(reason)}")
                    {:error, reason}
            end
        else
            :ok
        end
    end

    @doc "Delete multiple keys."
    def delete_many(keys) when is_list(keys) do
        if redix_available?() and keys != [] do
            case Redix.command(:redis, ["DEL" | keys]) do
                {:ok, _} -> :ok
                {:error, reason} ->
                    Logger.debug("Cache DEL MANY error: #{inspect(reason)}")
                    {:error, reason}
            end
        else
            :ok
        end
    end

    @doc "Check if key exists (returns boolean)."
    def exists?(key) when is_binary(key) do
        if redix_available?() do
            case Redix.command(:redis, ["EXISTS", key]) do
                {:ok, 1} -> true
                {:ok, 0} -> false
                _ -> false
            end
        else
            false
        end
    end

    @doc "Set expiration for a key."
    def expire(key, ttl_seconds) when is_binary(key) and is_integer(ttl_seconds) do
        if redix_available?() do
            case Redix.command(:redis, ["EXPIRE", key, to_string(ttl_seconds)]) do
                {:ok, _} -> :ok
                {:error, reason} ->
                    Logger.debug("Cache EXPIRE error for #{key}: #{inspect(reason)}")
                    {:error, reason}
            end
        else
            :ok
        end
    end

    @doc "Increment a key (returns {:ok, new_value})."
    def increment(key) when is_binary(key) do
        if redix_available?() do
            case Redix.command(:redis, ["INCR", key]) do
                {:ok, n} -> {:ok, n}
                {:error, reason} ->
                    Logger.debug("Cache INCR error for #{key}: #{inspect(reason)}")
                    {:error, reason}
            end
        else
            {:ok, 1}
        end
    end

    @doc "Get multiple keys. Returns `{:ok, list}`."
    def mget(keys) when is_list(keys) do
        if redix_available?() and keys != [] do
            case Redix.command(:redis, ["MGET" | keys]) do
                {:ok, results} ->
                    parsed =
                        Enum.map(results, fn
                            nil -> nil
                            v ->
                                case decode_json(v) do
                                    {:ok, decoded} -> decoded
                                    _ -> v
                                end
                        end)

                    {:ok, parsed}

                {:error, reason} ->
                    Logger.debug("Cache MGET error: #{inspect(reason)}")
                    {:error, reason}
            end
        else
            {:ok, []}
        end
    end

    @doc "Set multiple key/value pairs. Accepts a map."
    def mset(kv_map, _opts \\ []) when is_map(kv_map) do
        if redix_available?() and map_size(kv_map) > 0 do
            args =
                kv_map
                |> Enum.flat_map(fn {k, v} -> [to_string(k), encode_value(v)] end)

            case Redix.command(:redis, ["MSET" | args]) do
                {:ok, _} -> :ok
                {:error, reason} ->
                    Logger.debug("Cache MSET error: #{inspect(reason)}")
                    {:error, reason}
            end
        else
            :ok
        end
    end

    @doc "Clear keys matching a pattern (uses SCAN)."
    def clear_pattern(pattern) when is_binary(pattern) do
        if redix_available?() do
            scan_and_delete(pattern)
        else
            :ok
        end
    end

    @doc "Return basic Redis stats map or empty map on fallback."
    def stats do
        if redix_available?() do
            case Redix.command(:redis, ["INFO"]) do
                {:ok, info} -> parse_redis_info(info)
                _ -> %{}
            end
        else
            %{}
        end
    end

    @doc "Warm up cache (no-op default)."
    def warmup, do: :ok

    # -- helpers
    defp redix_available? do
        Code.ensure_loaded?(Redix) and Process.whereis(:redis) != nil
    end

    defp encode_value(value) when is_binary(value), do: value
    defp encode_value(value), do: Jason.encode!(value)

    defp decode_value(value) when is_binary(value) do
        case decode_json(value) do
            {:ok, decoded} -> {:ok, decoded}
            _ -> {:ok, value}
        end
    end

    defp decode_json(value) do
        try do
            {:ok, Jason.decode!(value, keys: :atoms)}
        rescue
            _ -> :error
        end
    end

    defp parse_redis_info(info) when is_binary(info) do
        info
        |> String.split("\n")
        |> Enum.reduce(%{}, fn line, acc ->
            case String.split(line, ":", parts: 2) do
                [key, value] -> Map.put(acc, key, value)
                _ -> acc
            end
        end)
    end

    defp scan_and_delete(pattern, cursor \\ "0") do
        case Redix.command(:redis, ["SCAN", cursor, "MATCH", pattern, "COUNT", "100"]) do
            {:ok, [next_cursor, keys]} when is_list(keys) ->
                if keys != [] do
                    _ = Redix.command(:redis, ["DEL" | keys])
                end

                if next_cursor == "0" do
                    :ok
                else
                    scan_and_delete(pattern, next_cursor)
                end

            _ -> :ok
        end
    end
end
