defmodule LmsApiWeb.ErrorView do
  @moduledoc """
  Minimal ErrorView that renders JSON error responses.

  This implementation avoids depending on `LmsApiWeb` or `Phoenix.View`
  during compilation so it can be compiled early when dependencies
  may not yet be fully loaded.
  """

  def render("404.json", _assigns), do: %{errors: %{detail: "Not Found"}}

  def render("500.json", _assigns), do: %{errors: %{detail: "Internal Server Error"}}

  def template_not_found(_template, assigns), do: render("500.json", assigns)
end
