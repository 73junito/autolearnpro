defmodule LmsApi.AISanitizeTest do
  use ExUnit.Case, async: true

  alias LmsApi.AI

  test "sanitize_prompt redacts emails" do
    prompt = "Please analyze this student: student@example.com and provide feedback"
    sanitized = AI.sanitize_prompt(prompt)
    assert String.contains?(sanitized, "[REDACTED]")
    refute String.contains?(sanitized, "student@example.com")
  end
end
