defmodule LmsApiWeb.ContentGenerationView do
  @moduledoc """
  View for Content Generation Plugin API responses.
  """

  use LmsApiWeb, :view
  use PhoenixSwagger

  def render("overview.json", %{overview: overview}) do
    overview
  end

  def render("plan.json", %{plan: plan}) do
    %{
      id: plan.id,
      title: plan.title,
      description: plan.description,
      subject_area: plan.subject_area,
      target_audience: plan.target_audience,
      difficulty_level: plan.difficulty_level,
      estimated_duration: plan.estimated_duration,
      learning_objectives: plan.learning_objectives,
      prerequisites: plan.prerequisites,
      keywords: plan.keywords,
      status: plan.status,
      metadata: plan.metadata,
      settings: plan.settings,
      created_by: render_user(plan.created_by),
      updated_by: render_user(plan.updated_by),
      created_at: plan.inserted_at,
      updated_at: plan.updated_at
    }
  end

  def render("plans_list.json", %{result: result}) do
    %{
      plans: Enum.map(result.plans, &render_plan_summary/1),
      pagination: result.pagination
    }
  end

  def render("draft.json", %{draft: draft}) do
    %{
      id: draft.id,
      version: draft.version,
      title: draft.title,
      content_type: draft.content_type,
      content_data: draft.content_data,
      status: draft.status,
      metadata: draft.metadata,
      quality_score: draft.quality_score,
      review_notes: draft.review_notes,
      published_at: draft.published_at,
      content_plan_id: draft.content_plan_id,
      created_by: render_user(draft.created_by),
      updated_by: render_user(draft.updated_by),
      created_at: draft.inserted_at,
      updated_at: draft.updated_at
    }
  end

  def render("review_workflow.json", %{workflow: workflow}) do
    %{
      id: workflow.id,
      status: workflow.status,
      review_type: workflow.review_type,
      priority: workflow.priority,
      due_date: workflow.due_date,
      review_notes: workflow.review_notes,
      approval_criteria: workflow.approval_criteria,
      metadata: workflow.metadata,
      content_draft_id: workflow.content_draft_id,
      requested_by: render_user(workflow.requested_by),
      approved_by: render_user(workflow.approved_by),
      created_at: workflow.inserted_at,
      updated_at: workflow.updated_at,
      assignments: render_assignments(workflow.review_assignments),
      comments: render_comments(workflow.review_comments)
    }
  end

  def render("publishing_pipeline.json", %{pipeline: pipeline}) do
    %{
      id: pipeline.id,
      status: pipeline.status,
      content_draft_id: pipeline.content_draft_id,
      target_course_ids: pipeline.target_course_ids,
      publish_options: pipeline.publish_options,
      results: pipeline.results,
      error_message: pipeline.error_message,
      published_at: pipeline.published_at,
      initiated_by: render_user(pipeline.initiated_by),
      created_at: pipeline.inserted_at,
      updated_at: pipeline.updated_at
    }
  end

  def render("analytics.json", %{analytics: analytics}) do
    analytics
  end

  def render("content_suggestions.json", %{suggestions: suggestions}) do
    %{
      suggestions: suggestions,
      generated_at: DateTime.utc_now()
    }
  end

  def render("error.json", %{changeset: changeset}) do
    %{errors: Ecto.Changeset.traverse_errors(changeset, &translate_error/1)}
  end

  def render("error.json", %{error: error}) do
    %{error: error}
  end

  # Private helper functions

  defp render_plan_summary(plan) do
    %{
      id: plan.id,
      title: plan.title,
      description: plan.description,
      subject_area: plan.subject_area,
      target_audience: plan.target_audience,
      status: plan.status,
      created_by: plan.created_by,
      created_at: plan.created_at,
      updated_at: plan.updated_at
    }
  end

  defp render_user(nil), do: nil
  defp render_user(user) do
    %{
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      avatar_url: user.avatar_url
    }
  end

  defp render_assignments(assignments) do
    Enum.map(assignments, fn assignment ->
      %{
        id: assignment.id,
        status: assignment.status,
        assigned_at: assignment.assigned_at,
        started_at: assignment.started_at,
        completed_at: assignment.completed_at,
        due_date: assignment.due_date,
        priority: assignment.priority,
        notes: assignment.notes,
        reviewer: render_user(assignment.reviewer)
      }
    end)
  end

  defp render_comments(comments) do
    Enum.map(comments, fn comment ->
      %{
        id: comment.id,
        comment_type: comment.comment_type,
        content: comment.content,
        rating: comment.rating,
        position: comment.position,
        is_private: comment.is_private,
        author: render_user(comment.author),
        created_at: comment.inserted_at,
        updated_at: comment.updated_at,
        replies: render_comments(comment.child_comments)
      }
    end)
  end
end