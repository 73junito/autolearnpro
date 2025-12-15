defmodule LmsApiWeb.EnrollmentJSON do
  alias LmsApi.Enrollments.Enrollment

  @doc """
  Renders a list of enrollments.
  """
  def index(%{enrollments: enrollments}) do
    %{data: for(enrollment <- enrollments, do: data(enrollment))}
  end

  @doc """
  Renders a single enrollment.
  """
  def show(%{enrollment: enrollment}) do
    %{data: data(enrollment)}
  end

  defp data(%Enrollment{} = enrollment) do
    %{
      id: enrollment.id
    }
  end
end
