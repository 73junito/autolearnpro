defmodule LmsApi.Cache do
  @moduledoc """
  Redis-based caching system for performance optimization.
  """

  @cache_ttl_default 3600  # 1 hour default TTL

  @doc """
  Gets a value from cache.

  ## Examples

      iex> get("user:123")
      {:ok, %User{}}

      iex> get("nonexistent")
      {:ok, nil}

  """
  def get(key) do
    case Redix.command(:redis, ["GET", key]) do
      {:ok, nil} -> {:ok, nil}
      {:ok, value} ->
        case Jason.decode(value, keys: :atoms) do
          {:ok, decoded} -> {:ok, decoded}
          {:error, _} -> {:ok, value}
        end
      {:error, reason} ->
        Logger.error("Cache get error: #{inspect(reason)}")
        {:ok, nil}
    end
  end

  @doc """
  Sets a value in cache with optional TTL.

  ## Examples

      iex> set("user:123", user_data)
      :ok

      iex> set("user:123", user_data, ttl: 1800)
      :ok

  """
  def set(key, value, opts \\ []) do
    ttl = Keyword.get(opts, :ttl, @cache_ttl_default)
    encoded_value = Jason.encode!(value)

    commands = if ttl > 0 do
      ["SETEX", key, ttl, encoded_value]
    else
      ["SET", key, encoded_value]
    end

    case Redix.command(:redis, commands) do
      {:ok, "OK"} -> :ok
      {:error, reason} ->
        Logger.error("Cache set error: #{inspect(reason)}")
        :error
    end
  end

  @doc """
  Deletes a key from cache.

  ## Examples

      iex> delete("user:123")
      :ok

  """
  def delete(key) do
    case Redix.command(:redis, ["DEL", key]) do
      {:ok, _} -> :ok
      {:error, reason} ->
        Logger.error("Cache delete error: #{inspect(reason)}")
        :error
    end
  end

  @doc """
  Deletes multiple keys from cache.

  ## Examples

      iex> delete_many(["user:123", "course:456"])
      :ok

  """
  def delete_many(keys) when is_list(keys) do
    case Redix.command(:redis, ["DEL" | keys]) do
      {:ok, _} -> :ok
      {:error, reason} ->
        Logger.error("Cache delete_many error: #{inspect(reason)}")
        :error
    end
  end

  @doc """
  Checks if a key exists in cache.

  ## Examples

      iex> exists?("user:123")
      true

  """
  def exists?(key) do
    case Redix.command(:redis, ["EXISTS", key]) do
      {:ok, 1} -> true
      {:ok, 0} -> false
      {:error, reason} ->
        Logger.error("Cache exists error: #{inspect(reason)}")
        false
    end
  end

  @doc """
  Sets expiration time for a key.

  ## Examples

      iex> expire("user:123", 1800)
      :ok

  """
  def expire(key, ttl_seconds) do
    case Redix.command(:redis, ["EXPIRE", key, ttl_seconds]) do
      {:ok, 1} -> :ok
      {:ok, 0} -> :not_found
      {:error, reason} ->
        Logger.error("Cache expire error: #{inspect(reason)}")
        :error
    end
  end

  @doc """
  Increments a numeric value in cache.

  ## Examples

      iex> increment("counter:views")
      {:ok, 1}

  """
  def increment(key) do
    case Redix.command(:redis, ["INCR", key]) do
      {:ok, value} -> {:ok, value}
      {:error, reason} ->
        Logger.error("Cache increment error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Gets multiple values from cache.

  ## Examples

      iex> mget(["user:123", "user:456"])
      {:ok, [%{}, nil]}

  """
  def mget(keys) when is_list(keys) do
    case Redix.command(:redis, ["MGET" | keys]) do
      {:ok, values} ->
        decoded = Enum.map(values, fn
          nil -> nil
          value ->
            case Jason.decode(value, keys: :atoms) do
              {:ok, decoded} -> decoded
              {:error, _} -> value
            end
        end)
        {:ok, decoded}
      {:error, reason} ->
        Logger.error("Cache mget error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Sets multiple values in cache.

  ## Examples

      iex> mset(%{"user:123" => user1, "user:456" => user2})
      :ok

  """
  def mset(key_value_map, opts \\ []) do
    ttl = Keyword.get(opts, :ttl, @cache_ttl_default)

    commands = Enum.flat_map(key_value_map, fn {key, value} ->
      encoded_value = Jason.encode!(value)
      if ttl > 0 do
        ["SETEX", key, ttl, encoded_value]
      else
        ["SET", key, encoded_value]
      end
    end)

    # Execute as pipeline
    case Redix.pipeline(:redis, commands) do
      {:ok, _} -> :ok
      {:error, reason} ->
        Logger.error("Cache mset error: #{inspect(reason)}")
        :error
    end
  end

  @doc """
  Clears all cache keys matching a pattern.

  ## Examples

      iex> clear_pattern("user:*")
      :ok

  """
  def clear_pattern(pattern) do
    case Redix.command(:redis, ["KEYS", pattern]) do
      {:ok, keys} when keys != [] ->
        delete_many(keys)
      {:ok, []} -> :ok
      {:error, reason} ->
        Logger.error("Cache clear_pattern error: #{inspect(reason)}")
        :error
    end
  end

  @doc """
  Gets cache statistics.

  ## Examples

      iex> stats()
      %{keys: 150, memory_used: "2.5MB", hit_rate: 0.95}

  """
  def stats do
    case Redix.command(:redis, ["INFO", "stats"]) do
      {:ok, info} ->
        # Parse Redis INFO stats
        parse_redis_info(info)
      {:error, reason} ->
        Logger.error("Cache stats error: #{inspect(reason)}")
        %{}
    end
  end

  @doc """
  Warms up cache with frequently accessed data.

  ## Examples

      iex> warmup()
      :ok

  """
  def warmup do
    # Cache frequently accessed data
    try do
      # Cache active courses
      courses = LmsApi.Catalog.list_courses()
      Enum.each(courses, fn course ->
        set("course:#{course.id}", course, ttl: 3600)  # 1 hour
      end)

      # Cache user roles (for permission checks)
      users = LmsApi.Accounts.list_users()
      Enum.each(users, fn user ->
        roles = LmsApi.Permissions.get_user_roles(user.id)
        set("user_roles:#{user.id}", roles, ttl: 1800)  # 30 minutes
      end)

      :ok
    rescue
      error ->
        Logger.error("Cache warmup error: #{inspect(error)}")
        :error
    end
  end

  # Private helper functions
  defp parse_redis_info(info) do
    info
    |> String.split("\n")
    |> Enum.reduce(%{}, fn line, acc ->
      case String.split(line, ":", parts: 2) do
        [key, value] -> Map.put(acc, key, value)
        _ -> acc
      end
    end)
  end
end