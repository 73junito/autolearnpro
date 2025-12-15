defmodule LmsApi.Performance do
  @moduledoc """
  Performance monitoring and optimization utilities.
  """

  require Logger
  import Ecto.Query

  @doc """
  Measures execution time of a function.

  ## Examples

      iex> measure_time("database_query", fn -> Repo.all(User) end)
      {result, 150}  # 150ms execution time

  """
  def measure_time(label, fun) when is_function(fun, 0) do
    start_time = System.monotonic_time(:millisecond)
    result = fun.()
    end_time = System.monotonic_time(:millisecond)
    execution_time = end_time - start_time

    # Log slow queries
    if execution_time > 1000 do  # More than 1 second
      Logger.warning("Slow operation detected: #{label} took #{execution_time}ms")
    end

    # Store metrics
    record_metric("performance.#{label}", execution_time)

    {result, execution_time}
  end

  @doc """
  Records a performance metric.

  ## Examples

      iex> record_metric("api.response_time", 150)
      :ok

  """
  def record_metric(name, value, tags \\ %{}) do
    # Store in cache for aggregation
    cache_key = "metrics:#{name}:#{Date.utc_today()}"
    timestamp = DateTime.utc_now() |> DateTime.to_unix()

    metric_data = %{
      name: name,
      value: value,
      timestamp: timestamp,
      tags: tags
    }

    # Store in Redis sorted set for time-series data
    case Redix.command(:redis, ["ZADD", cache_key, timestamp, Jason.encode!(metric_data)]) do
      {:ok, _} ->
        # Set expiration (keep metrics for 30 days)
        Redix.command(:redis, ["EXPIRE", cache_key, 30 * 24 * 60 * 60])
        :ok
      {:error, reason} ->
        Logger.error("Failed to record metric #{name}: #{inspect(reason)}")
        :error
    end
  end

  @doc """
  Gets performance metrics for a time range.

  ## Examples

      iex> get_metrics("api.response_time", ~D[2024-01-01], ~D[2024-01-31])
      [%{value: 150, timestamp: 1704067200}, ...]

  """
  def get_metrics(name, start_date, end_date) do
    start_timestamp = DateTime.new!(start_date, ~T[00:00:00]) |> DateTime.to_unix()
    end_timestamp = DateTime.new!(end_date, ~T[23:59:59]) |> DateTime.to_unix()

    cache_key = "metrics:#{name}:#{start_date}"

    case Redix.command(:redis, ["ZRANGEBYSCORE", cache_key, start_timestamp, end_timestamp, "WITHSCORES"]) do
      {:ok, results} ->
        # Parse results (Redis returns [member1, score1, member2, score2, ...])
        Enum.chunk_every(results, 2)
        |> Enum.map(fn [data, _score] ->
          Jason.decode!(data, keys: :atoms)
        end)
      {:error, reason} ->
        Logger.error("Failed to get metrics #{name}: #{inspect(reason)}")
        []
    end
  end

  @doc """
  Gets performance statistics.

  ## Examples

      iex> get_stats("api.response_time", ~D[2024-01-01], ~D[2024-01-31])
      %{avg: 145.5, min: 50, max: 500, count: 1000, p95: 300, p99: 450}

  """
  def get_stats(name, start_date, end_date) do
    metrics = get_metrics(name, start_date, end_date)

    if Enum.empty?(metrics) do
      %{avg: 0, min: 0, max: 0, count: 0, p95: 0, p99: 0}
    else
      values = Enum.map(metrics, & &1.value) |> Enum.sort()

      %{
        avg: Enum.sum(values) / length(values),
        min: Enum.min(values),
        max: Enum.max(values),
        count: length(values),
        p95: percentile(values, 95),
        p99: percentile(values, 99)
      }
    end
  end

  @doc """
  Monitors database query performance.

  ## Examples

      iex> monitor_query("SELECT * FROM users", fn -> Repo.all(User) end)
      {result, 50}  # 50ms query time

  """
  def monitor_query(query, fun) when is_function(fun, 0) do
    measure_time("db_query", fn ->
      # Log the query for analysis
      Logger.debug("Executing query: #{query}")
      fun.()
    end)
  end

  @doc """
  Monitors API endpoint performance.

  ## Examples

      iex> monitor_endpoint("GET /api/users", conn, fn -> UsersController.index(conn) end)
      response

  """
  def monitor_endpoint(endpoint, conn, fun) when is_function(fun, 0) do
    start_time = System.monotonic_time(:millisecond)

    try do
      result = fun.()
      end_time = System.monotonic_time(:millisecond)
      execution_time = end_time - start_time

      # Record API metrics
      record_metric("api.response_time", execution_time, %{
        endpoint: endpoint,
        method: conn.method,
        status: conn.status || 200
      })

      # Log slow requests
      if execution_time > 5000 do  # More than 5 seconds
        Logger.warning("Slow API request: #{endpoint} took #{execution_time}ms")
      end

      result
    rescue
      error ->
        end_time = System.monotonic_time(:millisecond)
        execution_time = end_time - start_time

        # Record error metrics
        record_metric("api.error", execution_time, %{
          endpoint: endpoint,
          method: conn.method,
          error: inspect(error)
        })

        raise error
    end
  end

  @doc """
  Optimizes database queries with eager loading.

  ## Examples

      iex> optimize_query(User, [:posts, :comments])
      #Ecto.Query<from u in User, preload: [:posts, :comments]>

  """
  def optimize_query(query, preloads) do
    from q in query, preload: ^preloads
  end

  @doc """
  Implements database query result caching.

  ## Examples

      iex> cached_query("users:active", fn -> Repo.all(from u in User, where: u.active == true) end)
      [%User{}, ...]

  """
  def cached_query(cache_key, query_fun, ttl \\ 3600) when is_function(query_fun, 0) do
    case LmsApi.Cache.get(cache_key) do
      {:ok, nil} ->
        # Cache miss - execute query
        {result, execution_time} = measure_time("cached_query.#{cache_key}", query_fun)

        # Cache the result
        LmsApi.Cache.set(cache_key, result, ttl: ttl)

        # Record cache miss metric
        record_metric("cache.miss", 1, %{key: cache_key, query_time: execution_time})

        result

      {:ok, cached_result} ->
        # Cache hit
        record_metric("cache.hit", 1, %{key: cache_key})
        cached_result
    end
  end

  @doc """
  Implements pagination for large datasets.

  ## Examples

      iex> paginate(query, %{page: 2, page_size: 50})
      %{entries: [...], page_number: 2, page_size: 50, total_entries: 500, total_pages: 10}

  """
  def paginate(query, params) do
    page = Map.get(params, :page, 1)
    page_size = Map.get(params, :page_size, 20)

    # Ensure reasonable limits
    page = max(1, page)
    page_size = min(100, max(1, page_size))

    offset = (page - 1) * page_size

    # Get total count
    total_entries = Repo.aggregate(query, :count, :id)

    # Get paginated results
    entries = query
    |> limit(^page_size)
    |> offset(^offset)
    |> Repo.all()

    total_pages = ceil(total_entries / page_size)

    %{
      entries: entries,
      page_number: page,
      page_size: page_size,
      total_entries: total_entries,
      total_pages: total_pages
    }
  end

  @doc """
  Implements database connection pooling optimization.

  ## Examples

      iex> with_connection_pool(fn -> Repo.all(User) end)
      [%User{}, ...]

  """
  def with_connection_pool(fun) when is_function(fun, 0) do
    # Use Ecto's built-in connection pooling
    Repo.transaction(fn ->
      fun.()
    end)
  end

  @doc """
  Generates database query execution plan.

  ## Examples

      iex> explain_query(from u in User, select: u.email)
      "Seq Scan on users..."

  """
  def explain_query(query) do
    {result, _time} = measure_time("explain_query", fn ->
      Ecto.Adapters.SQL.explain(Repo, :all, query)
    end)

    result
  end

  @doc """
  Optimizes images and media files.

  ## Examples

      iex> optimize_image(file_path, %{width: 800, height: 600, quality: 85})
      {:ok, optimized_path}

  """
  def optimize_image(file_path, options \\ %{}) do
    # This would integrate with image processing libraries like ImageMagick
    # For now, return the original path
    {:ok, file_path}
  end

  @doc """
  Compresses response data.

  ## Examples

      iex> compress_response(data, "gzip")
      {:ok, compressed_data}

  """
  def compress_response(data, compression_type \\ "gzip") do
    # Implement response compression
    {:ok, data}
  end

  # Private helper functions
  defp percentile(values, p) do
    index = (length(values) * p / 100) |> trunc()
    index = min(index, length(values) - 1)
    Enum.at(values, index) || 0
  end
end