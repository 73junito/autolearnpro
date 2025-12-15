defmodule LmsApiWeb.MediaView do
  use LmsApiWeb, :view

  def render("index.json", %{files: files}) do
    %{
      data: render_many(files, __MODULE__, "file_upload.json", as: :file_upload)
    }
  end

  def render("file_upload.json", %{file_upload: file_upload}) do
    %{
      id: file_upload.id,
      file_name: file_upload.file_name,
      file_path: file_upload.file_path,
      file_size: file_upload.file_size,
      content_type: file_upload.content_type,
      description: file_upload.description,
      is_public: file_upload.is_public,
      uploaded_by: file_upload.uploaded_by,
      course_id: file_upload.course_id,
      download_url: "/api/files/#{file_upload.id}/download",
      inserted_at: file_upload.inserted_at,
      updated_at: file_upload.updated_at
    }
  end
end