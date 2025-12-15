defmodule LmsApiWeb.ErrorHelpers do
	@moduledoc """
	Conveniences for translating and building error messages in views.
	"""

	use Phoenix.HTML

	@doc """
	Translates an error message using gettext.

	By default it uses the `LmsApiWeb.Gettext` backend and falls back to
	interpolating the message when Gettext lookup fails.
	"""
	def translate_error({msg, opts}) do
		try do
			if count = opts[:count] do
				Gettext.dngettext(LmsApiWeb.Gettext, "errors", msg, msg, count, opts)
			else
				Gettext.dgettext(LmsApiWeb.Gettext, "errors", msg, opts)
			end
		rescue
			_ ->
				Enum.reduce(opts, msg, fn {key, value}, acc ->
					String.replace(acc, "%{#{key}}", fn _ -> to_string(value) end)
				end)
		end
	end

	@doc """
	Wraps translated error message in a span with class `error`.
	"""
	def error_tag(error) do
		content_tag(:span, translate_error(error), class: "error")
	end
end
