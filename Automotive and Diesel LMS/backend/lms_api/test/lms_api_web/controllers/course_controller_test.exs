defmodule LmsApiWeb.CourseControllerTest do
  use LmsApiWeb.ConnCase, async: true

  alias LmsApi.Catalog
  alias LmsApi.Accounts

  @valid_course_attrs %{
    code: "CS101",
    title: "Introduction to Computer Science",
    description: "Learn the basics of CS",
    credits: 3,
    delivery_mode: "online",
    active: true
  }

  @invalid_course_attrs %{
    code: "",
    title: "",
    credits: -1
  }

  setup %{conn: conn} do
    # Create instructor user for auth
    {:ok, instructor} = Accounts.create_user(%{
      email: "instructor@example.com",
      password: "SecurePass123!",
      full_name: "Test Instructor",
      role: "instructor"
    })

    {:ok, token, _claims} = LmsApi.Guardian.encode_and_sign(instructor)

    conn = conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> put_req_header("content-type", "application/json")

    %{conn: conn, instructor: instructor}
  end

  describe "GET /api/courses" do
    test "lists all courses", %{conn: conn} do
      {:ok, _course} = Catalog.create_course(@valid_course_attrs)

      conn = get(conn, "/api/courses")

      assert json_response(conn, 200)["data"] |> length() >= 1
    end

    test "returns empty array when no courses exist", %{conn: conn} do
      conn = get(conn, "/api/courses")

      assert json_response(conn, 200)["data"] == []
    end
  end

  describe "GET /api/courses/:id" do
    setup %{conn: conn} do
      {:ok, course} = Catalog.create_course(@valid_course_attrs)
      %{conn: conn, course: course}
    end

    test "returns course when ID is valid", %{conn: conn, course: course} do
      conn = get(conn, "/api/courses/#{course.id}")

      assert %{
        "id" => id,
        "code" => code,
        "title" => title
      } = json_response(conn, 200)["data"]

      assert id == course.id
      assert code == @valid_course_attrs.code
      assert title == @valid_course_attrs.title
    end

    test "returns 404 when course not found", %{conn: conn} do
      conn = get(conn, "/api/courses/99999")

      assert json_response(conn, 404)["errors"] != %{}
    end
  end

  describe "POST /api/courses" do
    test "creates course with valid data", %{conn: conn} do
      conn = post(conn, "/api/courses", course: @valid_course_attrs)

      assert %{"id" => id, "code" => code} = json_response(conn, 201)["data"]
      assert is_integer(id)
      assert code == @valid_course_attrs.code
    end

    test "returns validation errors with invalid data", %{conn: conn} do
      conn = post(conn, "/api/courses", course: @invalid_course_attrs)

      assert json_response(conn, 422)["errors"] != %{}
    end

    test "returns 422 when duplicate course code", %{conn: conn} do
      post(conn, "/api/courses", course: @valid_course_attrs)
      conn = post(conn, "/api/courses", course: @valid_course_attrs)

      assert json_response(conn, 422)["errors"] != %{}
    end
  end

  describe "PUT /api/courses/:id" do
    setup %{conn: conn} do
      {:ok, course} = Catalog.create_course(@valid_course_attrs)
      %{conn: conn, course: course}
    end

    test "updates course with valid data", %{conn: conn, course: course} do
      update_attrs = %{title: "Updated Course Title", credits: 4}
      conn = put(conn, "/api/courses/#{course.id}", course: update_attrs)

      assert %{"title" => title, "credits" => credits} = json_response(conn, 200)["data"]
      assert title == "Updated Course Title"
      assert credits == 4
    end

    test "returns 422 with invalid data", %{conn: conn, course: course} do
      conn = put(conn, "/api/courses/#{course.id}", course: @invalid_course_attrs)

      assert json_response(conn, 422)["errors"] != %{}
    end

    test "returns 404 when course not found", %{conn: conn} do
      conn = put(conn, "/api/courses/99999", course: %{title: "New Title"})

      assert json_response(conn, 404)
    end
  end

  describe "DELETE /api/courses/:id" do
    setup %{conn: conn} do
      {:ok, course} = Catalog.create_course(@valid_course_attrs)
      %{conn: conn, course: course}
    end

    test "deletes course", %{conn: conn, course: course} do
      conn = delete(conn, "/api/courses/#{course.id}")

      assert response(conn, 204)

      # Verify course is deleted
      assert_raise Ecto.NoResultsError, fn ->
        Catalog.get_course!(course.id)
      end
    end

    test "returns 404 when course not found", %{conn: conn} do
      conn = delete(conn, "/api/courses/99999")

      assert json_response(conn, 404)
    end
  end
end
