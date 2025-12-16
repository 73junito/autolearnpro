defmodule LmsApiWeb.Plugs.CloudflareRemoteIp do
  @moduledoc """
  Plug that sets `conn.remote_ip` from Cloudflare headers (CF-Connecting-IP or X-Forwarded-For).
  This is safe to use when the app is behind Cloudflare or a known reverse proxy.

  It prefers `cf-connecting-ip` then `x-forwarded-for` and falls back to the existing remote_ip.
  The plug will attempt to parse the IP string into the Erlang tuple form used by Plug.Conn.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(%Plug.Conn{} = conn, _opts) do
    headers = conn.req_headers |> Enum.into(%{})

    ip_str =
      case Map.get(headers, "cf-connecting-ip") do
        nil ->
          case Map.get(headers, "x-forwarded-for") do
            nil -> nil
            v -> String.split(v, ",") |> List.first() |> String.trim()
          end
        v -> String.trim(v)
      end

    cond do
      is_binary(ip_str) and ip_tuple(ip_str) ->
        {:ok, tuple} = ip_tuple(ip_str)
        %{conn | remote_ip: tuple}

      true -> conn
    end
  end

  defp ip_tuple(ip) when is_binary(ip) do
    # Try IPv4 then IPv6
    case :inet.parse_address(String.to_charlist(ip)) do
      {:ok, tuple} -> {:ok, tuple}
      _ -> :error
    end
  end

  defp ip_tuple(_), do: :error
end
