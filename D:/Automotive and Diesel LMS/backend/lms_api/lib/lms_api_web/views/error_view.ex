defmodule LmsApiWeb.ErrorView do
  @moduledoc """
  Minimal ErrorView that renders JSON error responses.

  This implementation avoids depending on `LmsApiWeb` or `Phoenix.View`
  during compilation so it can be compiled early when dependencies
  may not yet be fully loaded.
  """

  def render("404.json", _assigns), do: %{errors: %{detail: "Not Found"}}

  def render("500.json", _assigns), do: %{errors: %{detail: "Internal Server Error"}}

  # Handle common 400 cases: changeset errors or a reason atom
  def render("400.json", %{reason: %Ecto.Changeset{} = changeset}) do
    %{errors: %{detail: "Validation Failed", fields: traverse_changeset_errors(changeset)}}
  end

  def render("400.json", %{reason: reason}) when is_atom(reason) do
    %{errors: %{detail: to_string(reason)}}
  end

  def render("400.json", _assigns), do: %{errors: %{detail: "Bad Request"}}

  def template_not_found(_template, assigns), do: render("500.json", assigns)

  defp traverse_changeset_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, _opts} -> msg end)
  end
end
