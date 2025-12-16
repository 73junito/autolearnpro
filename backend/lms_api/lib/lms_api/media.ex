defmodule LmsApi.Media do
  @moduledoc """
  The Media context.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo
  alias LmsApi.Media.{FileUpload}

  @upload_dir "uploads"
  @allowed_extensions ~w(.jpg .jpeg .png .gif .pdf .doc .docx .txt .mp4 .avi .mov .zip)
  @max_file_size 50_000_000  # 50MB

  @doc """
  Returns the list of file uploads.

  ## Examples

      iex> list_file_uploads()
      [%FileUpload{}, ...]

  """
  def list_file_uploads do
    Repo.all(FileUpload)
  end

  @doc """
  Gets a single file upload.

  Raises `Ecto.NoResultsError` if the FileUpload does not exist.

  ## Examples

      iex> get_file_upload!(123)
      %FileUpload{}

      iex> get_file_upload!(456)
      ** (Ecto.NoResultsError)

  """
  def get_file_upload!(id), do: Repo.get!(FileUpload, id)

  @doc """
  Creates a file upload record.

  ## Examples

      iex> create_file_upload(%{field: value})
      {:ok, %FileUpload{}}

      iex> create_file_upload(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_file_upload(attrs \\ %{}) do
    %FileUpload{}
    |> FileUpload.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a file upload.

  ## Examples

      iex> update_file_upload(file_upload, %{field: new_value})
      {:ok, %FileUpload{}}

      iex> update_file_upload(file_upload, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_file_upload(%FileUpload{} = file_upload, attrs) do
    file_upload
    |> FileUpload.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a file upload.

  ## Examples

      iex> delete_file_upload(file_upload)
      {:ok, %FileUpload{}}

      iex> delete_file_upload(file_upload)
      {:error, %Ecto.Changeset{}}

  """
  def delete_file_upload(%FileUpload{} = file_upload) do
    # Delete the actual file
    delete_file(file_upload.file_path)

    Repo.delete(file_upload)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking file upload changes.

  ## Examples

      iex> change_file_upload(file_upload)
      %Ecto.Changeset{data: %FileUpload{}}

  """
  def change_file_upload(%FileUpload{} = file_upload, attrs \\ %{}) do
    FileUpload.changeset(file_upload, attrs)
  end

  @doc """
  Uploads a file and creates a record.

  ## Examples

      iex> upload_file(%Plug.Upload{}, %{user_id: 1, course_id: 1})
      {:ok, %FileUpload{}}

  """
  def upload_file(%Plug.Upload{} = upload, attrs) do
    with {:ok, file_path, file_name, file_size} <- save_uploaded_file(upload),
         {:ok, file_upload} <- create_file_upload(Map.merge(attrs, %{
           file_name: file_name,
           file_path: file_path,
           file_size: file_size,
           content_type: upload.content_type,
           uploaded_by: attrs.user_id
         })) do
      {:ok, file_upload}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Lists files for a course.

  ## Examples

      iex> list_course_files(123)
      [%FileUpload{}, ...]

  """
  def list_course_files(course_id) do
    FileUpload
    |> where([f], f.course_id == ^course_id)
    |> order_by([f], desc: f.inserted_at)
    |> Repo.all()
  end

  @doc """
  Lists files uploaded by a user.

  ## Examples

      iex> list_user_files(123)
      [%FileUpload{}, ...]

  """
  def list_user_files(user_id) do
    FileUpload
    |> where([f], f.uploaded_by == ^user_id)
    |> order_by([f], desc: f.inserted_at)
    |> Repo.all()
  end

  @doc """
  Validates file upload.

  ## Examples

      iex> validate_file(%Plug.Upload{})
      :ok

  """
  def validate_file(%Plug.Upload{} = upload) do
    cond do
      upload.filename == "" ->
        {:error, "No file selected"}

      not allowed_file_type?(upload.filename) ->
        {:error, "File type not allowed"}

      upload.content_type == "" ->
        {:error, "Invalid file type"}

      true ->
        :ok
    end
  end

  # Private functions

  defp save_uploaded_file(%Plug.Upload{} = upload) do
    with :ok <- validate_file(upload) do
      # Create unique filename
      extension = Path.extname(upload.filename)
      unique_name = "#{Ecto.UUID.generate()}#{extension}"
      file_path = Path.join([@upload_dir, unique_name])

      # Ensure upload directory exists
      File.mkdir_p!(@upload_dir)

      # Copy file to destination
      case File.cp(upload.path, file_path) do
        :ok ->
          file_size = File.stat!(upload.path).size
          {:ok, file_path, upload.filename, file_size}
        {:error, reason} ->
          {:error, "Failed to save file: #{reason}"}
      end
    end
  end

  defp delete_file(file_path) do
    if File.exists?(file_path) do
      File.rm(file_path)
    end
  end

  defp allowed_file_type?(filename) do
    extension = Path.extname(filename) |> String.downcase()
    extension in @allowed_extensions
  end
end