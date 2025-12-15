defmodule LmsApi.ContentGeneration.Analytics do
  @moduledoc """
  Analytics module for content generation performance tracking.

  This module provides insights into content creation workflows,
  review processes, and publishing effectiveness.
  """

  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  alias LmsApi.Repo
  alias LmsApi.ContentGeneration.{ContentPlan, ContentDraft, ReviewWorkflow}

  schema "content_generation_analytics" do
    field :metric_type, :string  # plan_creation, draft_editing, review_process, publishing
    field :metric_name, :string
    field :metric_value, :float
    field :metadata, :map, default: %{}
    field :date_recorded, :date

    belongs_to :content_plan, ContentPlan
    belongs_to :content_draft, ContentDraft
    belongs_to :review_workflow, ReviewWorkflow

    timestamps()
  end

  @doc """
  Records a content generation metric.
  """
  def record_metric(attrs) do
    %__MODULE__{}
    |> changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Gets analytics for a content plan.
  """
  def get_plan_analytics(plan_id, date_range \\ nil) do
    base_query = from a in __MODULE__,
      where: a.content_plan_id == ^plan_id

    query = if date_range do
      from a in base_query,
      where: a.date_recorded >= ^date_range.start and a.date_recorded <= ^date_range.end
    else
      base_query
    end

    metrics = Repo.all(query)

    %{
      plan_id: plan_id,
      total_metrics: length(metrics),
      metrics_by_type: group_metrics_by_type(metrics),
      trends: calculate_trends(metrics),
      summary: generate_summary(metrics)
    }
  end

  @doc """
  Gets overall content generation analytics.
  """
  def get_global_analytics(date_range \\ nil) do
    base_query = from a in __MODULE__

    query = if date_range do
      from a in base_query,
      where: a.date_recorded >= ^date_range.start and a.date_recorded <= ^date_range.end
    else
      base_query
    end

    metrics = Repo.all(query)

    %{
      total_plans: Repo.aggregate(ContentPlan, :count, :id),
      total_drafts: Repo.aggregate(ContentDraft, :count, :id),
      total_reviews: Repo.aggregate(ReviewWorkflow, :count, :id),
      metrics_summary: summarize_global_metrics(metrics),
      top_performers: get_top_performers(),
      bottlenecks: identify_bottlenecks()
    }
  end

  @doc """
  Tracks content creation time.
  """
  def track_creation_time(plan_id, start_time, end_time) do
    duration_hours = DateTime.diff(end_time, start_time) / 3600

    record_metric(%{
      content_plan_id: plan_id,
      metric_type: "creation_time",
      metric_name: "content_creation_duration",
      metric_value: duration_hours,
      date_recorded: Date.utc_today()
    })
  end

  @doc """
  Tracks review process metrics.
  """
  def track_review_metrics(workflow_id, review_data) do
    workflow = Repo.get(ReviewWorkflow, workflow_id)

    # Review completion time
    if workflow.due_date && workflow.updated_at do
      completion_time = DateTime.diff(workflow.updated_at, workflow.inserted_at) / 3600

      record_metric(%{
        review_workflow_id: workflow_id,
        metric_type: "review_process",
        metric_name: "review_completion_time",
        metric_value: completion_time,
        date_recorded: Date.utc_today()
      })
    end

    # Review quality scores
    if review_data["rating"] do
      record_metric(%{
        review_workflow_id: workflow_id,
        metric_type: "review_quality",
        metric_name: "reviewer_rating",
        metric_value: review_data["rating"],
        date_recorded: Date.utc_today()
      })
    end
  end

  @doc """
  Tracks publishing success rates.
  """
  def track_publishing_metrics(pipeline_id, success, target_count) do
    success_rate = if success, do: 100.0, else: 0.0

    record_metric(%{
      metric_type: "publishing",
      metric_name: "publication_success_rate",
      metric_value: success_rate,
      metadata: %{
        pipeline_id: pipeline_id,
        targets_attempted: target_count
      },
      date_recorded: Date.utc_today()
    })
  end

  @doc """
  Generates productivity reports.
  """
  def generate_productivity_report(user_id, date_range) do
    # Plans created
    plans_created = Repo.aggregate(
      from(p in ContentPlan,
        where: p.created_by_id == ^user_id and
               p.inserted_at >= ^date_range.start and
               p.inserted_at <= ^date_range.end
      ),
      :count,
      :id
    )

    # Drafts created
    drafts_created = Repo.aggregate(
      from(d in ContentDraft,
        where: d.created_by_id == ^user_id and
               d.inserted_at >= ^date_range.start and
               d.inserted_at <= ^date_range.end
      ),
      :count,
      :id
    )

    # Reviews completed
    reviews_completed = Repo.aggregate(
      from(a in LmsApi.ContentGeneration.ReviewAssignment,
        join: w in ReviewWorkflow, on: a.review_workflow_id == w.id,
        where: a.reviewer_id == ^user_id and
               a.status == "completed" and
               a.completed_at >= ^date_range.start and
               a.completed_at <= ^date_range.end
      ),
      :count,
      :id
    )

    %{
      user_id: user_id,
      period: date_range,
      plans_created: plans_created,
      drafts_created: drafts_created,
      reviews_completed: reviews_completed,
      productivity_score: calculate_productivity_score(plans_created, drafts_created, reviews_completed)
    }
  end

  # Private functions

  defp changeset(analytics, attrs) do
    analytics
    |> cast(attrs, [
      :metric_type,
      :metric_name,
      :metric_value,
      :metadata,
      :date_recorded,
      :content_plan_id,
      :content_draft_id,
      :review_workflow_id
    ])
    |> validate_required([:metric_type, :metric_name, :date_recorded])
    |> validate_inclusion(:metric_type, [
      "plan_creation",
      "draft_editing",
      "review_process",
      "publishing",
      "quality_assessment",
      "user_engagement"
    ])
  end

  defp group_metrics_by_type(metrics) do
    Enum.group_by(metrics, & &1.metric_type)
    |> Enum.map(fn {type, type_metrics} ->
      latest = Enum.max_by(type_metrics, & &1.inserted_at, fn -> nil end)
      {type, %{
        count: length(type_metrics),
        average_value: Enum.sum(Enum.map(type_metrics, & &1.metric_value)) / length(type_metrics),
        latest_value: if(latest, do: latest.metric_value, else: nil)
      }}
    end)
    |> Enum.into(%{})
  end

  defp calculate_trends(metrics) do
    # Group by date and calculate trends
    metrics_by_date = Enum.group_by(metrics, & &1.date_recorded)

    trends = Enum.map(metrics_by_date, fn {date, date_metrics} ->
      avg_value = Enum.sum(Enum.map(date_metrics, & &1.metric_value)) / length(date_metrics)

      {date, %{
        metric_count: length(date_metrics),
        average_value: avg_value,
        top_metric: (fn ->
          top = Enum.max_by(date_metrics, & &1.metric_value, fn -> nil end)
          if(top, do: top.metric_name, else: nil)
        end).()
      }}
    end)
    |> Enum.sort_by(fn {date, _} -> date end)

    %{daily_trends: trends}
  end

  defp generate_summary(metrics) do
    total_metrics = length(metrics)

    if total_metrics == 0 do
      %{message: "No metrics available"}
    else
      avg_quality = metrics
        |> Enum.filter(&(&1.metric_type == "quality_assessment"))
        |> Enum.map(& &1.metric_value)
        |> then(fn
          [] -> 0.0
          values -> Enum.sum(values) / length(values)
        end)

      review_completion_rate = metrics
        |> Enum.filter(&(&1.metric_type == "review_process"))
        |> length()
        |> then(&(&1 / total_metrics * 100))

      %{
        total_metrics: total_metrics,
        average_quality_score: avg_quality,
        review_completion_rate: review_completion_rate,
        most_active_metric_type: metrics
          |> Enum.group_by(& &1.metric_type)
          |> Enum.max_by(fn {_, group} -> length(group) end, fn -> {"none", []} end)
          |> elem(0)
      }
    end
  end

  defp summarize_global_metrics(metrics) do
    %{
      total_metrics_recorded: length(metrics),
      metrics_by_type: group_metrics_by_type(metrics),
      average_metric_value: if(length(metrics) > 0,
        do: Enum.sum(Enum.map(metrics, & &1.metric_value)) / length(metrics),
        else: 0.0
      ),
      date_range: (fn ->
        earliest_entry = Enum.min_by(metrics, & &1.date_recorded, fn -> nil end)
        latest_entry = Enum.max_by(metrics, & &1.date_recorded, fn -> nil end)

        %{
          earliest: if(earliest_entry, do: earliest_entry.date_recorded, else: nil),
          latest: if(latest_entry, do: latest_entry.date_recorded, else: nil)
        }
      end).()
    }
  end

  defp get_top_performers do
    # Get users with most content creation activity
    Repo.all(
      from p in ContentPlan,
      join: u in LmsApi.Accounts.User, on: p.created_by_id == u.id,
      group_by: [p.created_by_id, u.full_name],
      select: %{
        user_id: p.created_by_id,
        name: u.full_name,
        plans_created: count(p.id)
      },
      order_by: [desc: count(p.id)],
      limit: 10
    )
  end

  defp identify_bottlenecks do
    # Identify slow review processes
    Repo.all(
      from w in ReviewWorkflow,
      where: w.status == "in_review" and
             not is_nil(w.due_date) and
             w.due_date < ^DateTime.utc_now(),
      select: %{
        workflow_id: w.id,
        days_overdue: fragment("EXTRACT(day FROM ? - ?)", ^DateTime.utc_now(), w.due_date),
        reviewer_count: fragment("SELECT COUNT(*) FROM review_assignments WHERE review_workflow_id = ?", w.id)
      },
      order_by: [desc: fragment("EXTRACT(day FROM ? - ?)", ^DateTime.utc_now(), w.due_date)],
      limit: 5
    )
  end

  defp calculate_productivity_score(plans, drafts, reviews) do
    # Simple productivity score calculation
    (plans * 3) + (drafts * 2) + (reviews * 1)
  end
end
