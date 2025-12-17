defmodule LmsApiWeb.AuthControllerTest do
  use LmsApiWeb.ConnCase, async: true

  alias LmsApi.Accounts

  @valid_attrs %{
    email: "test@example.com",
    password: "SecurePass123!",
    full_name: "Test User",
    role: "student"
  }

  @invalid_attrs %{
    email: "invalid",
    password: "short",
    full_name: "",
    role: "invalid"
  }

  describe "POST /api/register" do
    test "registers a new user with valid data", %{conn: conn} do
      conn = post(conn, "/api/register", user: @valid_attrs)

      assert %{"id" => _id, "email" => email, "role" => role} = json_response(conn, 201)["data"]
      assert email == @valid_attrs.email
      assert role == @valid_attrs.role
      refute Map.has_key?(json_response(conn, 201)["data"], "password")
    end

    test "returns 422 when user already exists (idempotent)", %{conn: conn} do
      # First registration
      post(conn, "/api/register", user: @valid_attrs)

      # Second registration with same email
      conn = post(conn, "/api/register", user: @valid_attrs)

      assert json_response(conn, 422)["errors"] != %{}
    end

    test "returns validation errors with invalid data", %{conn: conn} do
      conn = post(conn, "/api/register", user: @invalid_attrs)

      assert json_response(conn, 422)["errors"] != %{}
    end

    test "sanitizes sensitive data in response", %{conn: conn} do
      conn = post(conn, "/api/register", user: @valid_attrs)
      response = json_response(conn, 201)["data"]

      refute Map.has_key?(response, "password")
      refute Map.has_key?(response, "password_hash")
    end
  end

  describe "POST /api/login" do
    setup do
      {:ok, user} = Accounts.create_user(@valid_attrs)
      %{user: user}
    end

    test "authenticates user and returns JWT token", %{conn: conn} do
      conn = post(conn, "/api/login", %{
        email: @valid_attrs.email,
        password: @valid_attrs.password
      })

      assert %{"token" => token, "user" => user_data} = json_response(conn, 200)["data"]
      assert is_binary(token)
      assert String.length(token) > 20
      assert user_data["email"] == @valid_attrs.email
    end

    test "returns 401 with invalid credentials", %{conn: conn} do
      conn = post(conn, "/api/login", %{
        email: @valid_attrs.email,
        password: "WrongPassword123!"
      })

      assert json_response(conn, 401)["error"] =~ "Invalid"
    end

    test "returns 401 with non-existent user", %{conn: conn} do
      conn = post(conn, "/api/login", %{
        email: "nonexistent@example.com",
        password: "SomePassword123!"
      })

      assert json_response(conn, 401)["error"] =~ "Invalid"
    end

    test "returns 422 with missing fields", %{conn: conn} do
      conn = post(conn, "/api/login", %{email: @valid_attrs.email})

      assert json_response(conn, 422)["errors"] != %{}
    end
  end

  describe "authenticated requests" do
    setup %{conn: conn} do
      {:ok, user} = Accounts.create_user(@valid_attrs)
      {:ok, token, _claims} = LmsApi.Guardian.encode_and_sign(user)

      conn = conn
        |> put_req_header("authorization", "Bearer #{token}")

      %{conn: conn, user: user, token: token}
    end

    test "can access protected endpoints with valid token", %{conn: conn} do
      conn = get(conn, "/api/my-enrollments")

      assert json_response(conn, 200)
    end

    test "receives 401 without token" do
      conn = build_conn()
      conn = get(conn, "/api/my-enrollments")

      assert json_response(conn, 401)
    end

    test "receives 401 with invalid token" do
      conn = build_conn()
        |> put_req_header("authorization", "Bearer invalid.token.here")

      conn = get(conn, "/api/my-enrollments")

      assert json_response(conn, 401)
    end
  end
end
