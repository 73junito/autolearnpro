defmodule LmsApi.ContentGeneration.ContentPlan do
  @moduledoc """
  Content Plan module for the Content Generation Plugin.

  Content plans define the overall structure and objectives for educational content.
  They serve as the foundation for all content creation activities.
  """

  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  alias LmsApi.Repo
  alias LmsApi.ContentGeneration.{ContentDraft, ReviewWorkflow}
  alias LmsApi.Accounts.User

  schema "content_plans" do
    field :title, :string
    field :description, :string
    field :subject_area, :string
    field :target_audience, :string
    field :difficulty_level, :string, default: "intermediate"
    field :estimated_duration, :integer  # in minutes
    field :learning_objectives, {:array, :string}, default: []
    field :prerequisites, {:array, :string}, default: []
    field :keywords, {:array, :string}, default: []
    field :status, :string, default: "draft"  # draft, in_progress, review, approved, published
    field :metadata, :map, default: %{}
    field :settings, :map, default: %{}

    belongs_to :created_by, User
    belongs_to :updated_by, User

    has_many :content_drafts, ContentDraft
    has_many :review_workflows, ReviewWorkflow

    timestamps()
  end

  @doc """
  Changeset for creating/updating content plans.
  """
  def changeset(plan, attrs) do
    plan
    |> cast(attrs, [
      :title,
      :description,
      :subject_area,
      :target_audience,
      :difficulty_level,
      :estimated_duration,
      :learning_objectives,
      :prerequisites,
      :keywords,
      :status,
      :metadata,
      :settings,
      :created_by_id,
      :updated_by_id
    ])
    |> validate_required([:title, :subject_area, :created_by_id])
    |> validate_length(:title, min: 3, max: 200)
    |> validate_inclusion(:difficulty_level, ["beginner", "intermediate", "advanced"])
    |> validate_inclusion(:status, ["draft", "in_progress", "review", "approved", "published"])
    |> foreign_key_constraint(:created_by_id)
    |> foreign_key_constraint(:updated_by_id)
  end

  @doc """
  Creates a new content plan.
  """
  def create(attrs) do
    %__MODULE__{}
    |> changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates an existing content plan.
  """
  def update(plan_id, attrs) do
    case get_by_id(plan_id) do
      nil -> {:error, :not_found}
      plan ->
        plan
        |> changeset(attrs)
        |> Repo.update()
    end
  end

  @doc """
  Gets a content plan by ID.
  """
  def get_by_id(id) do
    Repo.get(__MODULE__, id)
  end

  @doc """
  Gets content plans with filtering and pagination.
  """
  def list_plans(filters \\ %{}, pagination \\ %{page: 1, page_size: 20}) do
    query = from p in __MODULE__,
      join: u in User, on: p.created_by_id == u.id,
      select: %{
        id: p.id,
        title: p.title,
        description: p.description,
        subject_area: p.subject_area,
        target_audience: p.target_audience,
        difficulty_level: p.difficulty_level,
        status: p.status,
        created_by: %{
          id: u.id,
          name: u.full_name,
          email: u.email
        },
        created_at: p.inserted_at,
        updated_at: p.updated_at
      }

    # Apply filters
    query = apply_filters(query, filters)

    # Apply pagination
    page = Map.get(pagination, :page, 1)
    page_size = Map.get(pagination, :page_size, 20)
    offset = (page - 1) * page_size

    total_count = Repo.aggregate(query, :count, :id)

    results = query
    |> limit(^page_size)
    |> offset(^offset)
    |> Repo.all()

    %{
      plans: results,
      pagination: %{
        page: page,
        page_size: page_size,
        total_count: total_count,
        total_pages: ceil(total_count / page_size)
      }
    }
  end

  @doc """
  Deletes a content plan.
  """
  def delete(plan_id) do
    case get_by_id(plan_id) do
      nil -> {:error, :not_found}
      plan -> Repo.delete(plan)
    end
  end

  @doc """
  Gets content plan statistics.
  """
  def get_statistics(plan_id) do
    plan = get_by_id(plan_id)
    if plan do
      drafts_count = Repo.aggregate(
        from(d in ContentDraft, where: d.content_plan_id == ^plan_id),
        :count, :id
      )

      published_count = Repo.aggregate(
        from(d in ContentDraft,
          where: d.content_plan_id == ^plan_id and d.status == "published"),
        :count, :id
      )

      %{
        plan_id: plan_id,
        status: plan.status,
        drafts_count: drafts_count,
        published_count: published_count,
        last_updated: plan.updated_at
      }
    else
      {:error, :not_found}
    end
  end

  @doc """
  Exports a content plan in various formats.
  """
  def export(plan_id, format \\ :json) do
    case get_by_id(plan_id) do
      nil -> {:error, :not_found}
      plan ->
        # Get associated drafts
        drafts = Repo.all(
          from d in ContentDraft,
          where: d.content_plan_id == ^plan_id,
          order_by: [desc: d.version]
        )

        export_data = %{
          plan: plan,
          drafts: drafts,
          exported_at: DateTime.utc_now(),
          version: "1.0"
        }

        case format do
          :json -> {:ok, Jason.encode!(export_data)}
          :xml -> {:ok, to_xml(export_data)}
          _ -> {:error, :unsupported_format}
        end
    end
  end

  @doc """
  Imports a content plan from external data.
  """
  def import(import_data, format \\ :json) do
    case format do
      :json ->
        case Jason.decode(import_data) do
          {:ok, data} -> import_from_data(data)
          {:error, _} -> {:error, :invalid_json}
        end
      _ -> {:error, :unsupported_format}
    end
  end

  @doc """
  Generates a content plan template based on subject area.
  """
  def generate_template(subject_area, difficulty_level \\ "intermediate") do
    templates = %{
      "automotive" => %{
        "beginner" => %{
          title: "Introduction to Automotive Systems",
          learning_objectives: [
            "Identify major vehicle systems",
            "Explain basic operation of each system",
            "Demonstrate safe shop procedures"
          ],
          estimated_duration: 480, # 8 hours
          prerequisites: []
        },
        "intermediate" => %{
          title: "Automotive Diagnostics and Repair",
          learning_objectives: [
            "Perform systematic diagnostic procedures",
            "Use diagnostic tools and equipment",
            "Execute common repair procedures"
          ],
          estimated_duration: 960, # 16 hours
          prerequisites: ["Basic automotive knowledge"]
        }
      },
      "diesel" => %{
        "beginner" => %{
          title: "Diesel Engine Fundamentals",
          learning_objectives: [
            "Understand diesel engine operation",
            "Identify diesel-specific components",
            "Explain emission control systems"
          ],
          estimated_duration: 600, # 10 hours
          prerequisites: []
        }
      }
    }

    get_in(templates, [subject_area, difficulty_level]) || %{}
  end

  # Private functions

  defp apply_filters(query, filters) do
    Enum.reduce(filters, query, fn {key, value}, q ->
      case key do
        :subject_area -> where(q, [p], p.subject_area == ^value)
        :status -> where(q, [p], p.status == ^value)
        :created_by_id -> where(q, [p], p.created_by_id == ^value)
        :search -> where(q, [p], ilike(p.title, ^"%#{value}%") or ilike(p.description, ^"%#{value}%"))
        _ -> q
      end
    end)
  end

  defp to_xml(data) do
    # Simple XML conversion - in production, use a proper XML library
    """
    <?xml version="1.0" encoding="UTF-8"?>
    <content_plan>
      <title>#{data.plan.title}</title>
      <description>#{data.plan.description}</description>
      <subject_area>#{data.plan.subject_area}</subject_area>
      <exported_at>#{data.exported_at}</exported_at>
    </content_plan>
    """
  end

  defp import_from_data(data) do
    # Create plan from imported data
    plan_attrs = %{
      title: data["plan"]["title"],
      description: data["plan"]["description"],
      subject_area: data["plan"]["subject_area"],
      target_audience: data["plan"]["target_audience"],
      difficulty_level: data["plan"]["difficulty_level"],
      estimated_duration: data["plan"]["estimated_duration"],
      learning_objectives: data["plan"]["learning_objectives"],
      prerequisites: data["plan"]["prerequisites"],
      keywords: data["plan"]["keywords"],
      created_by_id: data["plan"]["created_by_id"]
    }

    create(plan_attrs)
  end
end
