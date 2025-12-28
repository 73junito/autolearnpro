defmodule LmsApi.Security do
  @moduledoc """
  The Security context for advanced security features.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo
  alias LmsApi.Security.{AuditLog, SecuritySetting, LoginAttempt}

  @doc """
  Logs an audit event.

  ## Examples

      iex> log_audit_event(user_id, "login", "User logged in", %{ip: "192.168.1.1"})
      {:ok, %AuditLog{}}

  """
  def log_audit_event(user_id, action, description, metadata \\ %{}) do
    %AuditLog{}
    |> AuditLog.changeset(%{
      user_id: user_id,
      action: action,
      description: description,
      metadata: metadata,
      ip_address: metadata["ip_address"],
      user_agent: metadata["user_agent"]
    })
    |> Repo.insert()
  end

  @doc """
  Gets audit logs for a user.

  ## Examples

      iex> get_user_audit_logs(user_id)
      [%AuditLog{}, ...]

  """
  def get_user_audit_logs(user_id, limit \\ 100) do
    AuditLog
    |> where([al], al.user_id == ^user_id)
    |> order_by([al], desc: al.inserted_at)
    |> limit(^limit)
    |> Repo.all()
  end

  @doc """
  Gets audit logs with filters.

  ## Examples

      iex> get_audit_logs(%{action: "login", limit: 50})
      [%AuditLog{}, ...]

  """
  def get_audit_logs(filters \\ %{}) do
    AuditLog
    |> apply_filters(filters)
    |> order_by([al], desc: al.inserted_at)
    |> limit(^Map.get(filters, :limit, 100))
    |> Repo.all()
  end

  @doc """
  Records a login attempt.

  ## Examples

      iex> record_login_attempt(email, success, ip_address)
      {:ok, %LoginAttempt{}}

  """
  def record_login_attempt(email, success, ip_address, user_agent \\ nil) do
    %LoginAttempt{}
    |> LoginAttempt.changeset(%{
      email: email,
      success: success,
      ip_address: ip_address,
      user_agent: user_agent
    })
    |> Repo.insert()
  end

  @doc """
  Checks if account is locked due to failed login attempts.

  ## Examples

      iex> account_locked?(email)
      false

  """
  def account_locked?(email) do
    recent_attempts = get_recent_login_attempts(email, 15)  # Last 15 minutes
    failed_attempts = Enum.count(recent_attempts, fn attempt -> not attempt.success end)

    failed_attempts >= 5  # Lock after 5 failed attempts
  end

  @doc """
  Gets recent login attempts for an email.

  ## Examples

      iex> get_recent_login_attempts(email, 15)
      [%LoginAttempt{}, ...]

  """
  def get_recent_login_attempts(email, minutes_ago) do
    cutoff_time = DateTime.add(DateTime.utc_now(), -minutes_ago * 60, :second)

    LoginAttempt
    |> where([la], la.email == ^email and la.inserted_at >= ^cutoff_time)
    |> order_by([la], desc: la.inserted_at)
    |> Repo.all()
  end

  @doc """
  Gets security settings.

  ## Examples

      iex> get_security_settings()
      %SecuritySetting{}

  """
  def get_security_settings do
    case Repo.one(SecuritySetting) do
      nil ->
        # Create default settings
        {:ok, settings} = create_security_settings(%{
          password_min_length: 8,
          password_require_uppercase: true,
          password_require_lowercase: true,
          password_require_numbers: true,
          password_require_special_chars: false,
          session_timeout_minutes: 480,  # 8 hours
          max_login_attempts: 5,
          lockout_duration_minutes: 30,
          require_mfa: false,
          allow_password_reset: true,
          audit_log_retention_days: 365
        })
        settings
      settings -> settings
    end
  end

  @doc """
  Updates security settings.

  ## Examples

      iex> update_security_settings(%{password_min_length: 12})
      {:ok, %SecuritySetting{}}

  """
  def update_security_settings(attrs) do
    settings = get_security_settings()
    update_security_setting(settings, attrs)
  end

  @doc """
  Updates a security setting.

  ## Examples

      iex> update_security_setting(setting, %{password_min_length: 12})
      {:ok, %SecuritySetting{}}

  """
  def update_security_setting(%SecuritySetting{} = setting, attrs) do
    setting
    |> SecuritySetting.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Creates security settings.

  ## Examples

      iex> create_security_settings(%{field: value})
      {:ok, %SecuritySetting{}}

  """
  def create_security_settings(attrs \\ %{}) do
    %SecuritySetting{}
    |> SecuritySetting.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Validates password against security settings.

  ## Examples

      iex> validate_password("password123")
      {:ok, "Password is valid"}

      iex> validate_password("weak")
      {:error, "Password does not meet requirements"}

  """
  def validate_password(password) do
    settings = get_security_settings()

    errors = []

    if String.length(password) < settings.password_min_length do
      errors = ["Password must be at least #{settings.password_min_length} characters long" | errors]
    end

    if settings.password_require_uppercase and not Regex.match?(~r/[A-Z]/, password) do
      errors = ["Password must contain at least one uppercase letter" | errors]
    end

    if settings.password_require_lowercase and not Regex.match?(~r/[a-z]/, password) do
      errors = ["Password must contain at least one lowercase letter" | errors]
    end

    if settings.password_require_numbers and not Regex.match?(~r/[0-9]/, password) do
      errors = ["Password must contain at least one number" | errors]
    end

    if settings.password_require_special_chars and not Regex.match?(~r/[^A-Za-z0-9]/, password) do
      errors = ["Password must contain at least one special character" | errors]
    end

    if errors == [] do
      {:ok, "Password is valid"}
    else
      {:error, Enum.join(errors, "; ")}
    end
  end

  @doc """
  Cleans up old audit logs based on retention policy.

  ## Examples

      iex> cleanup_audit_logs()
      {5, nil}

  """
  def cleanup_audit_logs do
    settings = get_security_settings()
    cutoff_date = DateTime.add(DateTime.utc_now(), -settings.audit_log_retention_days * 24 * 60 * 60, :second)

    AuditLog
    |> where([al], al.inserted_at < ^cutoff_date)
    |> Repo.delete_all()
  end

  @doc """
  Generates a secure random token.

  ## Examples

      iex> generate_secure_token()
      "a1b2c3d4e5f6..."

  """
  def generate_secure_token(length \\ 32) do
    :crypto.strong_rand_bytes(length)
    |> Base.encode64()
    |> String.replace(["/", "+"], ["_", "-"])
  end

  @doc """
  Hashes a password using Argon2.

  ## Examples

      iex> hash_password("password123")
      "$argon2id$v=19$m=65536,t=3,p=4$..."

  """
  def hash_password(password) do
    Argon2.hash_pwd_salt(password)
  end

  @doc """
  Verifies a password against its hash.

  ## Examples

      iex> verify_password("password123", hash)
      true

  """
  def verify_password(password, hash) do
    Argon2.verify_pass(password, hash)
  end

  # Private helper functions
  defp apply_filters(query, filters) do
    query
    |> apply_user_filter(filters)
    |> apply_action_filter(filters)
    |> apply_date_filter(filters)
  end

  defp apply_user_filter(query, %{user_id: user_id}) when not is_nil(user_id) do
    where(query, [al], al.user_id == ^user_id)
  end
  defp apply_user_filter(query, _), do: query

  defp apply_action_filter(query, %{action: action}) when not is_nil(action) do
    where(query, [al], al.action == ^action)
  end
  defp apply_action_filter(query, _), do: query

  defp apply_date_filter(query, %{from_date: from_date}) when not is_nil(from_date) do
    where(query, [al], al.inserted_at >= ^from_date)
  end
  defp apply_date_filter(query, _), do: query
end