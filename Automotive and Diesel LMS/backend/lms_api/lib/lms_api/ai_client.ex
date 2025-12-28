defmodule LmsApi.AIClient do
  @moduledoc """
  Lightweight adapter for calling a local Ollama instance.

  Usage:
    LmsApi.AIClient.ask("Explain how a diesel injector works")

  The base URL is read from application config `:lms_api, :ollama_url` or
  defaults to `http://host.docker.internal:11434` which works from Docker containers
  back to the Windows host.
  """

  @default_url "http://host.docker.internal:11434"
  @ollama_url Application.compile_env(:lms_api, :ollama_url, @default_url)

  @doc "Call Ollama `/api/generate` with a model and prompt. Returns `{:ok, map}` or `{:error, reason}`."
  def generate(model \\ "llama3", prompt) when is_binary(prompt) do
    url = Path.join(@ollama_url, "/api/generate")
    payload = %{model: model, prompt: prompt}

    headers = [{"content-type", "application/json"}]

    case HTTPoison.post(url, Jason.encode!(payload), headers, recv_timeout: 30_000) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, parsed} -> {:ok, parsed}
          _ -> {:error, {:invalid_json, body}}
        end

      {:ok, %HTTPoison.Response{status_code: code, body: body}} ->
        {:error, {:http, code, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc "Higher-level helper for quick prompts using default model. Returns text or error tuple."
  def ask(prompt, opts \\ []) when is_binary(prompt) do
    model = Keyword.get(opts, :model, "llama3")

    case generate(model, prompt) do
      {:ok, %{"result" => result}} -> {:ok, result}
      {:ok, other} -> {:ok, other}
      {:error, reason} -> {:error, reason}
    end
  end
end
