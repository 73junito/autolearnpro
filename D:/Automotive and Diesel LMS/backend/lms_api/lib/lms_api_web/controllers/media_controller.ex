defmodule LmsApiWeb.MediaController do
  use LmsApiWeb, :controller

  alias LmsApi.Media
  alias LmsApi.InstructorDashboard

  action_fallback LmsApiWeb.FallbackController

  def upload(conn, %{"course_id" => course_id, "file" => upload_params}) do
    user = Guardian.Plug.current_resource(conn)

    if InstructorDashboard.can_manage_course?(user, course_id) do
      case Media.upload_file(upload_params["file"], %{
        user_id: user.id,
        course_id: String.to_integer(course_id)
      }) do
        {:ok, file_upload} ->
          conn
          |> put_status(:created)
          |> render("file_upload.json", file_upload: file_upload)
        {:error, changeset} when is_map(changeset) ->
          conn
          |> put_status(:unprocessable_entity)
          |> render("error.json", changeset: changeset)
        {:error, message} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: message})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def index(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    if InstructorDashboard.can_view_analytics?(user, course_id) do
      files = Media.list_course_files(course_id)
      render(conn, "index.json", files: files)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def show(conn, %{"id" => id}) do
    file_upload = Media.get_file_upload!(id)
    user = Guardian.Plug.current_resource(conn)

    # Check if user can access this file
    if file_upload.is_public ||
       file_upload.uploaded_by == user.id ||
       InstructorDashboard.can_manage_course?(user, file_upload.course_id) do
      render(conn, "file_upload.json", file_upload: file_upload)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def update(conn, %{"id" => id, "file_upload" => file_params}) do
    file_upload = Media.get_file_upload!(id)
    user = Guardian.Plug.current_resource(conn)

    if file_upload.uploaded_by == user.id ||
       InstructorDashboard.can_manage_course?(user, file_upload.course_id) do
      with {:ok, file_upload} <- Media.update_file_upload(file_upload, file_params) do
        render(conn, "file_upload.json", file_upload: file_upload)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def delete(conn, %{"id" => id}) do
    file_upload = Media.get_file_upload!(id)
    user = Guardian.Plug.current_resource(conn)

    if file_upload.uploaded_by == user.id ||
       InstructorDashboard.can_manage_course?(user, file_upload.course_id) do
      with {:ok, file_upload} <- Media.delete_file_upload(file_upload) do
        render(conn, "file_upload.json", file_upload: file_upload)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def download(conn, %{"id" => id}) do
    file_upload = Media.get_file_upload!(id)
    user = Guardian.Plug.current_resource(conn)

    # Check if user can access this file
    if file_upload.is_public ||
       file_upload.uploaded_by == user.id ||
       InstructorDashboard.can_manage_course?(user, file_upload.course_id) ||
       LmsApi.Enrollments.user_enrolled_in_course?(user.id, file_upload.course_id) do

      if File.exists?(file_upload.file_path) do
        conn
        |> put_resp_header("content-disposition", "attachment; filename=\"#{file_upload.file_name}\"")
        |> put_resp_content_type(file_upload.content_type)
        |> send_file(200, file_upload.file_path)
      else
        conn
        |> put_status(:not_found)
        |> json(%{error: "File not found"})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end
end