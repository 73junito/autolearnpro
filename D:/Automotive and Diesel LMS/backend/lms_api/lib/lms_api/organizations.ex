defmodule LmsApi.Organizations do
  @moduledoc """
  The Organizations context for multi-tenant support.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo
  alias LmsApi.Organizations.{Organization, OrganizationMember}

  @doc """
  Returns the list of organizations.

  ## Examples

      iex> list_organizations()
      [%Organization{}, ...]

  """
  def list_organizations do
    Repo.all(Organization)
  end

  @doc """
  Gets a single organization.

  Raises `Ecto.NoResultsError` if the Organization does not exist.

  ## Examples

      iex> get_organization!(123)
      %Organization{}

      iex> get_organization!(456)
      ** (Ecto.NoResultsError)

  """
  def get_organization!(id), do: Repo.get!(Organization, id)

  @doc """
  Creates an organization.

  ## Examples

      iex> create_organization(%{field: value})
      {:ok, %Organization{}}

      iex> create_organization(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_organization(attrs \\ %{}) do
    %Organization{}
    |> Organization.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates an organization.

  ## Examples

      iex> update_organization(organization, %{field: new_value})
      {:ok, %Organization{}}

      iex> update_organization(organization, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_organization(%Organization{} = organization, attrs) do
    organization
    |> Organization.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes an organization.

  ## Examples

      iex> delete_organization(organization)
      {:ok, %Organization{}}

      iex> delete_organization(organization)
      {:error, %Ecto.Changeset{}}

  """
  def delete_organization(%Organization{} = organization) do
    Repo.delete(organization)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking organization changes.

  ## Examples

      iex> change_organization(organization)
      %Ecto.Changeset{data: %Organization{}}

  """
  def change_organization(%Organization{} = organization, attrs \\ %{}) do
    Organization.changeset(organization, attrs)
  end

  @doc """
  Adds a user to an organization.

  ## Examples

      iex> add_user_to_organization(user_id, organization_id, role)
      {:ok, %OrganizationMember{}}

  """
  def add_user_to_organization(user_id, organization_id, role \\ "member") do
    # Check if user is already a member
    existing = Repo.get_by(OrganizationMember, user_id: user_id, organization_id: organization_id)

    if existing do
      {:ok, existing}
    else
      %OrganizationMember{}
      |> OrganizationMember.changeset(%{user_id: user_id, organization_id: organization_id, role: role})
      |> Repo.insert()
    end
  end

  @doc """
  Removes a user from an organization.

  ## Examples

      iex> remove_user_from_organization(user_id, organization_id)
      {:ok, %OrganizationMember{}}

  """
  def remove_user_from_organization(user_id, organization_id) do
    member = Repo.get_by!(OrganizationMember, user_id: user_id, organization_id: organization_id)
    Repo.delete(member)
  end

  @doc """
  Gets organization members.

  ## Examples

      iex> get_organization_members(organization_id)
      [%OrganizationMember{}, ...]

  """
  def get_organization_members(organization_id) do
    OrganizationMember
    |> where([om], om.organization_id == ^organization_id)
    |> join(:inner, [om], u in LmsApi.Accounts.User, on: om.user_id == u.id)
    |> select([om, u], %{member: om, user: u})
    |> Repo.all()
  end

  @doc """
  Gets user's organizations.

  ## Examples

      iex> get_user_organizations(user_id)
      [%Organization{}, ...]

  """
  def get_user_organizations(user_id) do
    OrganizationMember
    |> where([om], om.user_id == ^user_id)
    |> join(:inner, [om], o in Organization, on: om.organization_id == o.id)
    |> select([om, o], o)
    |> Repo.all()
  end

  @doc """
  Checks if user is a member of organization.

  ## Examples

      iex> user_in_organization?(user_id, organization_id)
      true

  """
  def user_in_organization?(user_id, organization_id) do
    Repo.exists?(
      from om in OrganizationMember,
      where: om.user_id == ^user_id and om.organization_id == ^organization_id
    )
  end

  @doc """
  Gets user's role in organization.

  ## Examples

      iex> get_user_organization_role(user_id, organization_id)
      "admin"

  """
  def get_user_organization_role(user_id, organization_id) do
    case Repo.get_by(OrganizationMember, user_id: user_id, organization_id: organization_id) do
      nil -> nil
      member -> member.role
    end
  end

  @doc """
  Updates user's role in organization.

  ## Examples

      iex> update_user_organization_role(user_id, organization_id, "admin")
      {:ok, %OrganizationMember{}}

  """
  def update_user_organization_role(user_id, organization_id, role) do
    member = Repo.get_by!(OrganizationMember, user_id: user_id, organization_id: organization_id)
    update_organization_member(member, %{role: role})
  end

  @doc """
  Updates an organization member.

  ## Examples

      iex> update_organization_member(member, %{role: "admin"})
      {:ok, %OrganizationMember{}}

  """
  def update_organization_member(%OrganizationMember{} = member, attrs) do
    member
    |> OrganizationMember.changeset(attrs)
    |> Repo.update()
  end
end