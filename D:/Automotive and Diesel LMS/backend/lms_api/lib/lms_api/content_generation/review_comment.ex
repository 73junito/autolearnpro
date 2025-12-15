defmodule LmsApi.ContentGeneration.ReviewComment do
  @moduledoc """
  Review Comment schema for storing feedback and comments during review process.
  """

  use Ecto.Schema
  import Ecto.Changeset

  alias LmsApi.ContentGeneration.ReviewWorkflow
  alias LmsApi.Accounts.User

  schema "review_comments" do
    field :comment_type, :string, default: "comment"  # comment, review, approval, rejection
    field :content, :string
    field :rating, :integer  # 1-5 star rating for reviews
    field :position, :map, default: %{}  # For inline comments (line numbers, etc.)
    field :metadata, :map, default: %{}
    field :is_private, :boolean, default: false  # Private comments not visible to all reviewers

    belongs_to :review_workflow, ReviewWorkflow
    belongs_to :author, User
    belongs_to :parent_comment, __MODULE__  # For threaded comments

    has_many :child_comments, __MODULE__, foreign_key: :parent_comment_id

    timestamps()
  end

  def changeset(comment, attrs) do
    comment
    |> cast(attrs, [
      :comment_type,
      :content,
      :rating,
      :position,
      :metadata,
      :is_private,
      :review_workflow_id,
      :author_id,
      :parent_comment_id
    ])
    |> validate_required([:review_workflow_id, :author_id])
    |> validate_inclusion(:comment_type, ["comment", "review", "approval", "rejection", "suggestion"])
    |> validate_number(:rating, greater_than: 0, less_than_or_equal_to: 5)
    |> foreign_key_constraint(:review_workflow_id)
    |> foreign_key_constraint(:author_id)
    |> foreign_key_constraint(:parent_comment_id)
  end
end
