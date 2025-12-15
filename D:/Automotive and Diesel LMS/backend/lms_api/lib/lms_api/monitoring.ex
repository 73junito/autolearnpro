defmodule LmsApi.Monitoring do
  @moduledoc """
  System monitoring, alerting, and observability.
  """

  require Logger

  @doc """
  Records a system metric.

  ## Examples

      iex> record_metric("http_requests", 1, %{method: "GET", status: 200})
      :ok

  """
  def record_metric(name, value, tags \\ %{}) do
    LmsApi.Performance.record_metric(name, value, tags)
  end

  @doc """
  Records an application event.

  ## Examples

      iex> log_event("user_login", %{user_id: 123, ip: "192.168.1.1"})
      :ok

  """
  def log_event(event_type, metadata \\ %{}) do
    Logger.info("Event: #{event_type}", metadata)

    # Store in monitoring system
    record_metric("app_events", 1, Map.put(metadata, :event_type, event_type))
  end

  @doc """
  Monitors API endpoint performance.

  ## Examples

      iex> monitor_api_endpoint("GET /api/users", 150, 200)
      :ok

  """
  def monitor_api_endpoint(method_path, response_time, status_code) do
    # Record response time
    record_metric("api.response_time", response_time, %{
      endpoint: method_path,
      status_code: status_code
    })

    # Check for slow responses
    if response_time > 5000 do
      alert("Slow API Response", "Endpoint #{method_path} took #{response_time}ms", :warning)
    end

    # Check for error responses
    if status_code >= 500 do
      alert("API Error", "Endpoint #{method_path} returned #{status_code}", :error)
    end
  end

  @doc """
  Monitors database performance.

  ## Examples

      iex> monitor_database_query("SELECT * FROM users", 200)
      :ok

  """
  def monitor_database_query(query, execution_time) do
    record_metric("db.query_time", execution_time, %{query: String.slice(query, 0, 100)})

    if execution_time > 1000 do
      alert("Slow Database Query", "Query took #{execution_time}ms: #{String.slice(query, 0, 100)}", :warning)
    end
  end

  @doc """
  Monitors background job performance.

  ## Examples

      iex> monitor_background_job("send_email", 500, :success)
      :ok

  """
  def monitor_background_job(job_name, execution_time, status) do
    record_metric("job.execution_time", execution_time, %{
      job: job_name,
      status: Atom.to_string(status)
    })

    case status do
      :failure ->
        alert("Background Job Failed", "Job #{job_name} failed after #{execution_time}ms", :error)
      :timeout ->
        alert("Background Job Timeout", "Job #{job_name} timed out after #{execution_time}ms", :error)
      _ -> :ok
    end
  end

  @doc """
  Monitors system resources.

  ## Examples

      iex> monitor_system_resources()
      :ok

  """
  def monitor_system_resources do
    # CPU usage
    cpu_usage = LmsApi.Scaling.autoscaling_metrics().cpu_usage
    record_metric("system.cpu_usage", cpu_usage)

    cond do
      cpu_usage > 90 ->
        alert("High CPU Usage", "CPU usage is #{cpu_usage}%", :critical)
      cpu_usage > 75 ->
        alert("Elevated CPU Usage", "CPU usage is #{cpu_usage}%", :warning)
      true ->
        :ok
    end

    # Memory usage
    memory_usage = LmsApi.Scaling.autoscaling_metrics().memory_usage
    record_metric("system.memory_usage", memory_usage)

    cond do
      memory_usage > 90 ->
        alert("High Memory Usage", "Memory usage is #{memory_usage}%", :critical)
      memory_usage > 80 ->
        alert("Elevated Memory Usage", "Memory usage is #{memory_usage}%", :warning)
      true ->
        :ok
    end

    # Database connections
    db_connections = LmsApi.Scaling.health_check().metrics.db_connections
    record_metric("system.db_connections", db_connections)

    if db_connections > 15 do
      alert("High Database Connections", "Active connections: #{db_connections}", :warning)
    end
  end

  @doc """
  Monitors user activity.

  ## Examples

      iex> monitor_user_activity(user_id, "login")
      :ok

  """
  def monitor_user_activity(user_id, action, metadata \\ %{}) do
    record_metric("user.activity", 1, Map.merge(metadata, %{
      user_id: user_id,
      action: action
    }))

    # Track suspicious activity
    case action do
      "failed_login" ->
        check_failed_login_rate(user_id)
      "password_reset" ->
        log_event("password_reset_requested", %{user_id: user_id})
      _ -> :ok
    end
  end

  @doc """
  Monitors security events.

  ## Examples

      iex> monitor_security_event("brute_force_attempt", %{ip: "192.168.1.1", user_id: 123})
      :ok

  """
  def monitor_security_event(event_type, metadata) do
    record_metric("security.events", 1, Map.put(metadata, :event_type, event_type))

    case event_type do
      "brute_force_attempt" ->
        alert("Brute Force Attempt Detected", "IP: #{metadata.ip}, User: #{metadata.user_id}", :critical)
      "suspicious_login" ->
        alert("Suspicious Login Detected", "IP: #{metadata.ip}, User: #{metadata.user_id}", :warning)
      "unauthorized_access" ->
        alert("Unauthorized Access Attempt", "Resource: #{metadata.resource}, User: #{metadata.user_id}", :error)
      _ -> :ok
    end
  end

  @doc """
  Creates an alert.

  ## Examples

      iex> alert("System Error", "Database connection failed", :critical)
      :ok

  """
  def alert(title, message, severity \\ :info) do
    Logger.warn("ALERT [#{severity}]: #{title} - #{message}")

    # Store alert in monitoring system
    alert_data = %{
      title: title,
      message: message,
      severity: Atom.to_string(severity),
      timestamp: DateTime.utc_now()
    }

    # Store in Redis for dashboard access
    cache_key = "alerts:#{Date.utc_today()}"
    case Redix.command(:redis, ["RPUSH", cache_key, Jason.encode!(alert_data)]) do
      {:ok, _} ->
        # Keep alerts for 7 days
        Redix.command(:redis, ["EXPIRE", cache_key, 7 * 24 * 60 * 60])
        :ok
      {:error, _} -> :error
    end

    # Send notifications based on severity
    case severity do
      :critical -> send_critical_alert(title, message)
      :error -> send_error_alert(title, message)
      :warning -> send_warning_alert(title, message)
      _ -> :ok
    end
  end

  @doc """
  Gets recent alerts.

  ## Examples

      iex> get_recent_alerts()
      [%{title: "System Error", severity: "critical", timestamp: ~U[2024-01-01 12:00:00Z]}, ...]

  """
  def get_recent_alerts(limit \\ 50) do
    cache_key = "alerts:#{Date.utc_today()}"

    case Redix.command(:redis, ["LRANGE", cache_key, 0, limit - 1]) do
      {:ok, alerts} ->
        Enum.map(alerts, fn alert ->
          Jason.decode!(alert, keys: :atoms)
        end)
      {:error, _} -> []
    end
  end

  @doc """
  Gets system health status.

  ## Examples

      iex> get_system_health()
      %{status: :healthy, checks: %{database: :ok, redis: :ok, api: :ok}}

  """
  def get_system_health do
    health_check = LmsApi.Scaling.health_check()

    # Additional health checks
    checks = %{
      database: health_check.metrics.db_status,
      redis: health_check.metrics.redis_status,
      api: check_api_health(),
      background_jobs: check_job_queue_health(),
      cdn: check_cdn_health()
    }

    all_healthy = Enum.all?(checks, fn {_service, status} -> status == :ok end)

    %{
      status: if(all_healthy, do: :healthy, else: :unhealthy),
      checks: checks,
      timestamp: DateTime.utc_now()
    }
  end

  @doc """
  Generates system performance report.

  ## Examples

      iex> generate_performance_report(~D[2024-01-01], ~D[2024-01-31])
      %{avg_response_time: 150, error_rate: 0.5, throughput: 1000}

  """
  def generate_performance_report(start_date, end_date) do
    # Get API performance metrics
    api_stats = LmsApi.Performance.get_stats("api.response_time", start_date, end_date)

    # Get error metrics
    error_count = get_metric_sum("api.error", start_date, end_date)
    request_count = get_metric_sum("http_requests", start_date, end_date)
    error_rate = if request_count > 0, do: (error_count / request_count) * 100, else: 0

    # Get throughput
    throughput = get_metric_average("http_requests_per_minute", start_date, end_date)

    %{
      avg_response_time: api_stats.avg,
      p95_response_time: api_stats.p95,
      p99_response_time: api_stats.p99,
      error_rate: error_rate,
      throughput: throughput,
      uptime_percentage: calculate_uptime(start_date, end_date)
    }
  end

  @doc """
  Sets up monitoring dashboards.

  ## Examples

      iex> setup_monitoring_dashboard()
      :ok

  """
  def setup_monitoring_dashboard do
    # This would integrate with monitoring services like:
    # - Grafana for dashboards
    # - Prometheus for metrics collection
    # - DataDog or New Relic for application monitoring

    :ok
  end

  # Private helper functions
  defp check_failed_login_rate(user_id) do
    # Check if user has too many failed login attempts
    cache_key = "failed_logins:#{user_id}"

    case LmsApi.Cache.get(cache_key) do
      {:ok, count} when count >= 5 ->
        alert("Multiple Failed Login Attempts", "User #{user_id} has #{count} failed login attempts", :warning)
      _ -> :ok
    end
  end

  defp send_critical_alert(title, message) do
    # Send critical alerts via SMS, Slack, email, etc.
    Logger.error("CRITICAL ALERT: #{title} - #{message}")
    # Integration with alerting services would go here
  end

  defp send_error_alert(title, message) do
    # Send error alerts
    Logger.error("ERROR ALERT: #{title} - #{message}")
  end

  defp send_warning_alert(title, message) do
    # Send warning alerts
    Logger.warn("WARNING ALERT: #{title} - #{message}")
  end

  defp check_api_health do
    # Simple API health check
    try do
      # Make a test API call
      case LmsApi.Accounts.list_users() do
        _ -> :ok
      end
    rescue
      _ -> :error
    end
  end

  defp check_job_queue_health do
    # Check background job queue health
    # This would integrate with Oban job queue monitoring
    :ok
  end

  defp check_cdn_health do
    # Check CDN health
    # This would ping CDN endpoints
    :ok
  end

  defp get_metric_sum(metric_name, start_date, end_date) do
    metrics = LmsApi.Performance.get_metrics(metric_name, start_date, end_date)
    Enum.sum(Enum.map(metrics, & &1.value))
  end

  defp get_metric_average(metric_name, start_date, end_date) do
    metrics = LmsApi.Performance.get_metrics(metric_name, start_date, end_date)
    if Enum.empty?(metrics) do
      0
    else
      Enum.sum(Enum.map(metrics, & &1.value)) / length(metrics)
    end
  end

  defp calculate_uptime(start_date, end_date) do
    # Calculate system uptime percentage
    # This would track actual uptime vs expected uptime
    99.9  # Mock value
  end
end
