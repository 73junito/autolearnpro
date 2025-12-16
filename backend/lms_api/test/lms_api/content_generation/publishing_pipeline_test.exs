defmodule LmsApi.ContentGeneration.PublishingPipelineTest do
  use ExUnit.Case, async: true

  alias LmsApi.ContentGeneration.PublishingPipeline

  test "sanitize_draft_data removes emails and sensitive fields from content_data" do
    draft = %{
      id: 1,
      title: "Test Draft",
      content_data: %{
        "module_title" => "Intro",
        "content" => "Contact student at student@example.com",
        "author" => %{"name" => "Jane Doe", "email" => "jane@example.com"},
        "questions" => [
          %{"text" => "What is X?", "answer" => "secret answer"}
        ]
      }
    }

    sanitized = PublishingPipeline.sanitize_draft_data(draft)
    cd = sanitized.content_data

    refute cd["content"] =~ "@"
    assert cd["content"] =~ "[REDACTED]"
    assert cd["author"]["name"] == "[REDACTED]"
    assert cd["author"]["email"] == "[REDACTED]"
    assert cd["questions"] |> hd() |> Map.get("answer") == "[REDACTED]"
  end
end
