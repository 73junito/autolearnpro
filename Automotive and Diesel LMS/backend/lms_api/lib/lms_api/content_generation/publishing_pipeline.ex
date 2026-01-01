defmodule LmsApi.ContentGeneration.PublishingPipeline do
  @moduledoc """
  Publishing Pipeline module for managing content deployment to courses.

  This module handles the final step of the content generation process,
  publishing approved content to LMS courses with proper integration.
  """

  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  alias LmsApi.Repo
  alias LmsApi.ContentGeneration.ContentDraft
  alias LmsApi.Catalog.{Course, CourseModule, ModuleLesson}
  alias LmsApi.Assessments.{Assessment, Question}
  alias LmsApi.Media
  alias LmsApi.Accounts.User

  schema "publishing_pipeline" do
    field :status, :string, default: "pending"  # pending, processing, published, failed
    field :content_draft_id, :integer
    field :target_course_ids, {:array, :integer}, default: []
    field :publish_options, :map, default: %{}
    field :results, :map, default: %{}
    field :error_message, :string
    field :published_at, :utc_datetime

    belongs_to :initiated_by, User

    timestamps()
  end

  @doc """
  Changeset for publishing pipeline.
  """
  def changeset(pipeline, attrs) do
    pipeline
    |> cast(attrs, [
      :status,
      :content_draft_id,
      :target_course_ids,
      :publish_options,
      :results,
      :error_message,
      :published_at,
      :initiated_by_id
    ])
    |> validate_required([:content_draft_id, :initiated_by_id])
    |> validate_inclusion(:status, ["pending", "processing", "published", "failed"])
  end

  @doc """
  Publishes content draft to specified courses.
  """
  def publish(draft_id, course_ids, publish_options \\ %{}) do
    # Create publishing pipeline record
    pipeline_attrs = %{
      content_draft_id: draft_id,
      target_course_ids: course_ids,
      publish_options: publish_options,
      status: "processing",
      initiated_by_id: publish_options[:initiated_by_id]
    }

    case Repo.insert(changeset(%__MODULE__{}, pipeline_attrs)) do
      {:ok, pipeline} ->
        # Start async publishing process
        Task.async(fn -> execute_publish(pipeline.id) end)

        {:ok, pipeline}

      error -> error
    end
  end

  @doc """
  Executes the publishing process.
  """
  def execute_publish(pipeline_id) do
    pipeline = Repo.get(__MODULE__, pipeline_id)
    draft = Repo.get(ContentDraft, pipeline.content_draft_id)
    # Sanitize draft content to avoid leaking PII during publishing
    draft = Map.update!(draft, :content_data, fn data -> LmsApi.Redactor.sanitize(data || %{}) end)

    try do
      results = %{}

      # Publish to each target course
      Enum.each(pipeline.target_course_ids, fn course_id ->
        course_result = publish_to_course(draft, course_id, pipeline.publish_options)
        results = Map.put(results, course_id, course_result)
      end)

      # Update pipeline status
      update_pipeline(pipeline_id, %{
        status: "published",
        results: results,
        published_at: DateTime.utc_now()
      })

      # Mark draft as published
      ContentDraft.publish_draft(draft.id)

      # Send notifications
      notify_publication_complete(pipeline_id)

    rescue
      error ->
        update_pipeline(pipeline_id, %{
          status: "failed",
          error_message: Exception.message(error)
        })

        notify_publication_failed(pipeline_id, error)
    end
  end

  @doc """
  Gets publishing pipeline status.
  """
  def get_status(pipeline_id) do
    case Repo.get(__MODULE__, pipeline_id) do
      nil -> {:error, :not_found}
      pipeline ->
        %{
          id: pipeline.id,
          status: pipeline.status,
          progress: calculate_progress(pipeline),
          results: pipeline.results,
          error_message: pipeline.error_message,
          created_at: pipeline.inserted_at,
          published_at: pipeline.published_at
        }
    end
  end

  @doc """
  Gets publishing history for a draft.
  """
  def get_draft_history(draft_id) do
    Repo.all(
      from p in __MODULE__,
      where: p.content_draft_id == ^draft_id,
      order_by: [desc: p.inserted_at],
      select: %{
        id: p.id,
        status: p.status,
        target_course_ids: p.target_course_ids,
        published_at: p.published_at,
        initiated_by: fragment("SELECT full_name FROM users WHERE id = ?", p.initiated_by_id)
      }
    )
  end

  # Private functions

  defp publish_to_course(draft, course_id, options) do
    case Repo.get(Course, course_id) do
      nil -> {:error, "Course not found"}
      course ->
        try do
          # Create content based on draft type
          result = case draft.content_type do
            "lesson" -> publish_lesson(draft, course, options)
            "assessment" -> publish_assessment(draft, course, options)
            "media" -> publish_media(draft, course, options)
            "interactive" -> publish_interactive(draft, course, options)
            _ -> {:error, "Unsupported content type"}
          end

          {:ok, result}
        rescue
          error -> {:error, Exception.message(error)}
        end
    end
  end

  defp publish_lesson(draft, course, options) do
    content_data = draft.content_data
     
    # Create or update module
    module = get_or_create_module(course.id, content_data["module_title"] || draft.title)

    # Create lesson
    lesson_attrs = %{
      course_module_id: module.id,
      position: get_next_lesson_position(module.id),
      title: content_data["title"] || draft.title,
      lesson_type: "page",
      content: content_data["content"] || "",
      duration_minutes: content_data["duration"] || 30
    }

    case Repo.insert(ModuleLesson.changeset(%ModuleLesson{}, lesson_attrs)) do
      {:ok, lesson} ->
        # Handle media attachments
        if content_data["media_files"] do
          attach_media_to_lesson(lesson.id, content_data["media_files"])
        end

        %{lesson_id: lesson.id, module_id: module.id}

      error -> error
    end
  end

  defp publish_assessment(draft, course, options) do
    content_data = draft.content_data

    # Create assessment
    assessment_attrs = %{
      course_id: course.id,
      title: content_data["title"] || draft.title,
      description: content_data["description"] || "",
      assessment_type: content_data["assessment_type"] || "quiz",
      time_limit: content_data["time_limit"],
      passing_score: content_data["passing_score"] || 70,
      max_attempts: content_data["max_attempts"] || 3,
      is_active: true
    }

    case Repo.insert(Assessment.changeset(%Assessment{}, assessment_attrs)) do
      {:ok, assessment} ->
        # Create questions
        if content_data["questions"] do
          create_assessment_questions(assessment.id, content_data["questions"])
        end

        %{assessment_id: assessment.id}

      error -> error
    end
  end

  defp publish_media(draft, course, options) do
    content_data = draft.content_data

    # Upload media file
    case Media.upload_file(content_data["file_path"], content_data["file_name"]) do
      {:ok, media_file} ->
        # Associate with course
        # This would typically create a media reference in the course
        %{media_file_id: media_file.id}

      error -> error
    end
  end

  defp publish_interactive(draft, course, options) do
    content_data = draft.content_data

    # Create interactive lesson
    module = get_or_create_module(course.id, content_data["module_title"] || "Interactive Content")

    lesson_attrs = %{
      course_module_id: module.id,
      position: get_next_lesson_position(module.id),
      title: content_data["title"] || draft.title,
      lesson_type: "interactive",
      content: content_data["interactive_content"] || "",
      duration_minutes: content_data["duration"] || 45
    }

    case Repo.insert(ModuleLesson.changeset(%ModuleLesson{}, lesson_attrs)) do
      {:ok, lesson} -> %{lesson_id: lesson.id, module_id: module.id}
      error -> error
    end
  end

  defp get_or_create_module(course_id, module_title) do
    case Repo.get_by(CourseModule, course_id: course_id, title: module_title) do
      nil ->
        # Create new module
        module_attrs = %{
          course_id: course_id,
          position: get_next_module_position(course_id),
          title: module_title,
          summary: "Auto-generated module",
          published: true
        }

        {:ok, module} = Repo.insert(CourseModule.changeset(%CourseModule{}, module_attrs))
        module

      module -> module
    end
  end

  defp get_next_module_position(course_id) do
    case Repo.one(
      from m in CourseModule,
      where: m.course_id == ^course_id,
      select: max(m.position)
    ) do
      nil -> 1
      max_pos -> max_pos + 1
    end
  end

  defp get_next_lesson_position(module_id) do
    case Repo.one(
      from l in ModuleLesson,
      where: l.course_module_id == ^module_id,
      select: max(l.position)
    ) do
      nil -> 1
      max_pos -> max_pos + 1
    end
  end

  defp attach_media_to_lesson(lesson_id, media_files) do
    # This would create associations between lessons and media files
    # Implementation depends on the media association schema
    :ok
  end

  defp create_assessment_questions(assessment_id, questions_data) do
    Enum.each(questions_data, fn question_data ->
      question_attrs = %{
        assessment_id: assessment_id,
        question_text: question_data["text"],
        question_type: question_data["type"] || "multiple_choice",
        points: question_data["points"] || 1,
        options: question_data["options"] || [],
        correct_answer: question_data["correct_answer"],
        explanation: question_data["explanation"]
      }

      Repo.insert(Question.changeset(%Question{}, question_attrs))
    end)
  end

  defp update_pipeline(pipeline_id, attrs) do
    case Repo.get(__MODULE__, pipeline_id) do
      nil -> {:error, :not_found}
      pipeline ->
        pipeline
        |> changeset(attrs)
        |> Repo.update()
    end
  end

  defp calculate_progress(pipeline) do
    case pipeline.status do
      "pending" -> 0
      "processing" -> 50
      "published" -> 100
      "failed" -> 0
      _ -> 0
    end
  end

  defp notify_publication_complete(pipeline_id) do
    # Send notifications to stakeholders
    LmsApi.Notifications.notify_publication_success(pipeline_id)
  end

  defp notify_publication_failed(pipeline_id, error) do
    # Send failure notifications
    LmsApi.Notifications.notify_publication_failure(pipeline_id, error)
  end

  @doc "Sanitize draft map's content_data using Redactor. Returns updated draft map." 
  def sanitize_draft_data(%{content_data: content_data} = draft) do
    Map.put(draft, :content_data, LmsApi.Redactor.sanitize(content_data || %{}))
  end

  def sanitize_draft_data(draft), do: draft
end
