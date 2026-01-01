defmodule LmsApiWeb.GamificationView do
  use LmsApiWeb, :view

  def render("badges.json", %{badges: badges}) do
    %{
      data: render_many(badges, __MODULE__, "badge.json", as: :badge)
    }
  end

  def render("badge.json", %{badge: badge}) do
    %{
      id: badge.id,
      name: badge.name,
      title: badge.title,
      description: badge.description,
      icon: badge.icon,
      color: badge.color,
      rarity: badge.rarity,
      criteria: badge.criteria
    }
  end

  def render("user_badge.json", %{user_badge: user_badge}) do
    %{
      data: %{
        id: user_badge.id,
        user_id: user_badge.user_id,
        badge: render_one(user_badge.badge, __MODULE__, "badge.json", as: :badge),
        awarded_at: user_badge.awarded_at
      }
    }
  end
end