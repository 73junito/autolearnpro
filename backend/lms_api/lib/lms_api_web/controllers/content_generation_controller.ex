defmodule LmsApiWeb.ContentGenerationController do
  @moduledoc """
  Controller for Content Generation Plugin API endpoints.
  """

  use LmsApiWeb, :controller
  use PhoenixSwagger

  alias LmsApi.ContentGeneration
  alias LmsApi.ContentGeneration.{ContentPlan, ContentDraft, ReviewWorkflow, PublishingPipeline, Analytics}

  action_fallback LmsApiWeb.FallbackController

  swagger_path :index do
    get "/api/content-generation"
    summary "Get content generation overview"
    description "Returns an overview of the content generation plugin status and capabilities"
    response 200, "Success", Schema.ref(:ContentGenerationOverview)
  end

  def index(conn, _params) do
    overview = ContentGeneration.get_plugin_info()
    render(conn, "overview.json", overview: overview)
  end

  swagger_path :create_plan do
    post "/api/content-generation/plans"
    summary "Create a new content plan"
    description "Creates a new content plan for educational content development"
    parameter :plan, :body, Schema.ref(:ContentPlan), "Content plan details"
    response 201, "Created", Schema.ref(:ContentPlan)
    response 422, "Unprocessable Entity", Schema.ref(:Error)
  end

  def create_plan(conn, %{"plan" => plan_params}) do
    user = conn.assigns.current_user

    plan_params = Map.put(plan_params, "created_by_id", user.id)

    case ContentPlan.create(plan_params) do
      {:ok, plan} ->
        # Record analytics
        Analytics.record_metric(%{
          content_plan_id: plan.id,
          metric_type: "plan_creation",
          metric_name: "plan_created",
          metric_value: 1.0,
          date_recorded: Date.current()
        })

        conn
        |> put_status(:created)
        |> put_resp_header("location", Routes.content_generation_path(conn, :show_plan, plan.id))
        |> render("plan.json", plan: plan)

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render("error.json", changeset: changeset)
    end
  end

  swagger_path :show_plan do
    get "/api/content-generation/plans/{id}"
    summary "Get a content plan"
    description "Retrieves a specific content plan with full details"
    parameter :id, :path, :integer, "Content plan ID"
    response 200, "Success", Schema.ref(:ContentPlan)
    response 404, "Not Found", Schema.ref(:Error)
  end

  def show_plan(conn, %{"id" => id}) do
    case ContentPlan.get_by_id(id) do
      nil ->
        conn
        |> put_status(:not_found)
        |> render("error.json", error: "Content plan not found")

      plan ->
        render(conn, "plan.json", plan: plan)
    end
  end

  swagger_path :list_plans do
    get "/api/content-generation/plans"
    summary "List content plans"
    description "Returns a paginated list of content plans with filtering"
    parameter :page, :query, :integer, "Page number", default: 1
    parameter :page_size, :query, :integer, "Items per page", default: 20
    parameter :subject_area, :query, :string, "Filter by subject area"
    parameter :status, :query, :string, "Filter by status"
    parameter :search, :query, :string, "Search query"
    response 200, "Success", Schema.ref(:ContentPlansList)
  end

  def list_plans(conn, params) do
    filters = %{
      subject_area: params["subject_area"],
      status: params["status"],
      search: params["search"]
    }

    pagination = %{
      page: String.to_integer(params["page"] || "1"),
      page_size: String.to_integer(params["page_size"] || "20")
    }

    result = ContentPlan.list_plans(filters, pagination)
    render(conn, "plans_list.json", result: result)
  end

  swagger_path :create_draft do
    post "/api/content-generation/plans/{plan_id}/drafts"
    summary "Create a content draft"
    description "Creates a new content draft for a content plan"
    parameter :plan_id, :path, :integer, "Content plan ID"
    parameter :draft, :body, Schema.ref(:ContentDraft), "Content draft details"
    response 201, "Created", Schema.ref(:ContentDraft)
    response 422, "Unprocessable Entity", Schema.ref(:Error)
  end

  def create_draft(conn, %{"plan_id" => plan_id, "draft" => draft_params}) do
    user = conn.assigns.current_user

    draft_params = Map.merge(draft_params, %{
      "created_by_id" => user.id,
      "content_plan_id" => String.to_integer(plan_id)
    })

    case ContentDraft.create(String.to_integer(plan_id), draft_params) do
      {:ok, draft} ->
        # Record analytics
        Analytics.record_metric(%{
          content_draft_id: draft.id,
          metric_type: "draft_editing",
          metric_name: "draft_created",
          metric_value: 1.0,
          date_recorded: Date.current()
        })

        conn
        |> put_status(:created)
        |> render("draft.json", draft: draft)

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render("error.json", changeset: changeset)
    end
  end

  swagger_path :submit_for_review do
    post "/api/content-generation/drafts/{draft_id}/review"
    summary "Submit draft for review"
    description "Submits a content draft for review by specified reviewers"
    parameter :draft_id, :path, :integer, "Content draft ID"
    parameter :review, :body, Schema.ref(:ReviewSubmission), "Review submission details"
    response 200, "Success", Schema.ref(:ReviewWorkflow)
    response 422, "Unprocessable Entity", Schema.ref(:Error)
  end

  def submit_for_review(conn, %{"draft_id" => draft_id, "review" => review_params}) do
    user = conn.assigns.current_user

    review_params = Map.put(review_params, "requested_by_id", user.id)

    case ReviewWorkflow.submit_for_review(
      String.to_integer(draft_id),
      review_params["reviewer_ids"],
      review_params
    ) do
      {:ok, workflow} ->
        # Record analytics
        Analytics.track_review_metrics(workflow.id, %{})

        render(conn, "review_workflow.json", workflow: workflow)

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render("error.json", changeset: changeset)
    end
  end

  swagger_path :publish_content do
    post "/api/content-generation/drafts/{draft_id}/publish"
    summary "Publish content draft"
    description "Publishes a content draft to specified courses"
    parameter :draft_id, :path, :integer, "Content draft ID"
    parameter :publish, :body, Schema.ref(:PublishRequest), "Publishing details"
    response 202, "Accepted", Schema.ref(:PublishingPipeline)
    response 422, "Unprocessable Entity", Schema.ref(:Error)
  end

  def publish_content(conn, %{"draft_id" => draft_id, "publish" => publish_params}) do
    user = conn.assigns.current_user

    publish_options = Map.put(publish_params, "initiated_by_id", user.id)

    case PublishingPipeline.publish(
      String.to_integer(draft_id),
      publish_params["course_ids"],
      publish_options
    ) do
      {:ok, pipeline} ->
        # Record analytics
        Analytics.track_publishing_metrics(pipeline.id, true, length(publish_params["course_ids"]))

        conn
        |> put_status(:accepted)
        |> render("publishing_pipeline.json", pipeline: pipeline)

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render("error.json", changeset: changeset)
    end
  end

  swagger_path :get_analytics do
    get "/api/content-generation/analytics"
    summary "Get content generation analytics"
    description "Returns analytics and metrics for content generation activities"
    parameter :plan_id, :query, :integer, "Filter by content plan ID"
    parameter :date_from, :query, :string, "Start date (YYYY-MM-DD)"
    parameter :date_to, :query, :string, "End date (YYYY-MM-DD)"
    response 200, "Success", Schema.ref(:ContentAnalytics)
  end

  def get_analytics(conn, params) do
    plan_id = params["plan_id"]
    date_range = if params["date_from"] && params["date_to"] do
      %{
        start: Date.from_iso8601!(params["date_from"]),
        end: Date.from_iso8601!(params["date_to"])
      }
    end

    analytics = if plan_id do
      Analytics.get_plan_analytics(String.to_integer(plan_id), date_range)
    else
      Analytics.get_global_analytics(date_range)
    end

    render(conn, "analytics.json", analytics: analytics)
  end

  swagger_path :generate_content do
    post "/api/content-generation/generate"
    summary "Generate content with AI"
    description "Uses AI to generate content suggestions based on plan requirements"
    parameter :generation, :body, Schema.ref(:ContentGenerationRequest), "Generation parameters"
    response 200, "Success", Schema.ref(:ContentGenerationResponse)
    response 422, "Unprocessable Entity", Schema.ref(:Error)
  end

  def generate_content(conn, %{"generation" => generation_params}) do
    plan_id = generation_params["plan_id"]
    content_type = generation_params["content_type"]
    context = generation_params["context"] || %{}

    case ContentGeneration.generate_content_suggestions(plan_id, content_type, context) do
      {:ok, suggestions} ->
        render(conn, "content_suggestions.json", suggestions: suggestions)

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render("error.json", error: reason)
    end
  end

  # Swagger definitions
  def swagger_definitions do
    %{
      ContentGenerationOverview: swagger_schema do
        title "Content Generation Overview"
        description "Overview of the content generation plugin"
        properties do
          name :string, "Plugin name"
          version :string, "Plugin version"
          description :string, "Plugin description"
          capabilities :array, "List of plugin capabilities"
          supported_formats :array, "Supported export/import formats"
          supported_content_types :array, "Supported content types"
        end
      end,

      ContentPlan: swagger_schema do
        title "Content Plan"
        description "A content plan for educational material development"
        properties do
          id :integer, "Plan ID"
          title :string, "Plan title", required: true
          description :string, "Plan description"
          subject_area :string, "Subject area", required: true
          target_audience :string, "Target audience"
          difficulty_level :string, "Difficulty level", enum: ["beginner", "intermediate", "advanced"]
          status :string, "Plan status", enum: ["draft", "in_progress", "review", "approved", "published"]
          created_at :string, "Creation timestamp"
          updated_at :string, "Last update timestamp"
        end
      end,

      ContentDraft: swagger_schema do
        title "Content Draft"
        description "A draft version of content"
        properties do
          id :integer, "Draft ID"
          version :integer, "Version number"
          title :string, "Draft title"
          content_type :string, "Content type", enum: ["lesson", "assessment", "media", "interactive"]
          status :string, "Draft status", enum: ["draft", "review", "approved", "published", "archived"]
          quality_score :number, "Quality score (0-100)"
          created_at :string, "Creation timestamp"
        end
      end,

      ReviewSubmission: swagger_schema do
        title "Review Submission"
        description "Parameters for submitting content for review"
        properties do
          reviewer_ids :array, "List of reviewer user IDs", items: %{type: :integer}
          review_type :string, "Type of review", enum: ["peer_review", "expert_review", "sme_review"]
          priority :string, "Review priority", enum: ["low", "normal", "high", "urgent"]
          due_date :string, "Review due date (ISO 8601)"
          notes :string, "Additional notes for reviewers"
        end
      end,

      PublishRequest: swagger_schema do
        title "Publish Request"
        description "Parameters for publishing content"
        properties do
          course_ids :array, "List of course IDs to publish to", items: %{type: :integer}
          publish_options :object, "Publishing options"
        end
      end,

      ContentAnalytics: swagger_schema do
        title "Content Analytics"
        description "Analytics data for content generation activities"
        properties do
          total_plans :integer, "Total content plans"
          total_drafts :integer, "Total content drafts"
          metrics_summary :object, "Metrics summary"
          top_performers :array, "Top performing users"
        end
      end,

      ContentGenerationRequest: swagger_schema do
        title "Content Generation Request"
        description "Parameters for AI content generation"
        properties do
          plan_id :integer, "Content plan ID"
          content_type :string, "Type of content to generate"
          context :object, "Context for generation"
        end
      end,

      ContentGenerationResponse: swagger_schema do
        title "Content Generation Response"
        description "AI-generated content suggestions"
        properties do
          suggestions :array, "List of content suggestions"
          confidence_score :number, "AI confidence score"
        end
      end
    }
  end
end