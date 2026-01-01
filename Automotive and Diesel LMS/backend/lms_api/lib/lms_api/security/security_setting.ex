defmodule LmsApi.Security.SecuritySetting do
  use Ecto.Schema
  import Ecto.Changeset

  schema "security_settings" do
    field :password_min_length, :integer, default: 8
    field :password_require_uppercase, :boolean, default: true
    field :password_require_lowercase, :boolean, default: true
    field :password_require_numbers, :boolean, default: true
    field :password_require_special_chars, :boolean, default: false
    field :session_timeout_minutes, :integer, default: 480
    field :max_login_attempts, :integer, default: 5
    field :lockout_duration_minutes, :integer, default: 30
    field :require_mfa, :boolean, default: false
    field :allow_password_reset, :boolean, default: true
    field :audit_log_retention_days, :integer, default: 365
    field :enable_ip_whitelist, :boolean, default: false
    field :allowed_ips, {:array, :string}, default: []
    field :enable_two_factor, :boolean, default: false
    field :password_history_count, :integer, default: 5

    timestamps()
  end

  @doc false
  def changeset(security_setting, attrs) do
    security_setting
    |> cast(attrs, [:password_min_length, :password_require_uppercase, :password_require_lowercase,
                    :password_require_numbers, :password_require_special_chars, :session_timeout_minutes,
                    :max_login_attempts, :lockout_duration_minutes, :require_mfa, :allow_password_reset,
                    :audit_log_retention_days, :enable_ip_whitelist, :allowed_ips, :enable_two_factor,
                    :password_history_count])
    |> validate_number(:password_min_length, greater_than: 0)
    |> validate_number(:session_timeout_minutes, greater_than: 0)
    |> validate_number(:max_login_attempts, greater_than: 0)
    |> validate_number(:lockout_duration_minutes, greater_than: 0)
    |> validate_number(:audit_log_retention_days, greater_than: 0)
    |> validate_number(:password_history_count, greater_than_or_equal_to: 0)
  end
end