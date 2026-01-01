defmodule LmsApiWeb.EnrollmentControllerTest do
  use LmsApiWeb.ConnCase, async: true

  alias LmsApi.{Accounts, Catalog, Enrollments}

  @course_attrs %{
    code: "ENROLL101",
    title: "Test Course for Enrollment",
    description: "Test course",
    credits: 3,
    delivery_mode: "online",
    active: true
  }

  setup %{conn: conn} do
    # Create student user
    {:ok, student} = Accounts.create_user(%{
      email: "student@example.com",
      password: "SecurePass123!",
      full_name: "Test Student",
      role: "student"
    })

    # Create course
    {:ok, course} = Catalog.create_course(@course_attrs)

    {:ok, token, _claims} = LmsApi.Guardian.encode_and_sign(student)

    conn = conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> put_req_header("content-type", "application/json")

    %{conn: conn, student: student, course: course}
  end

  describe "POST /api/enroll/:course_id" do
    test "enrolls student in course", %{conn: conn, course: course, student: student} do
      conn = post(conn, "/api/enroll/#{course.id}")

      assert %{"id" => _id, "status" => status} = json_response(conn, 201)["data"]
      assert status == "active"
    end

    test "returns 422 when already enrolled (idempotent)", %{conn: conn, course: course, student: student} do
      # First enrollment
      Enrollments.create_enrollment(%{
        user_id: student.id,
        course_id: course.id,
        status: "active"
      })

      # Second enrollment attempt
      conn = post(conn, "/api/enroll/#{course.id}")

      assert json_response(conn, 422)["errors"] != %{}
    end

    test "returns 404 when course not found", %{conn: conn} do
      conn = post(conn, "/api/enroll/99999")

      assert json_response(conn, 404)
    end
  end

  describe "DELETE /api/enroll/:course_id" do
    setup %{student: student, course: course} do
      {:ok, enrollment} = Enrollments.create_enrollment(%{
        user_id: student.id,
        course_id: course.id,
        status: "active"
      })

      %{enrollment: enrollment}
    end

    test "unenrolls student from course", %{conn: conn, course: course} do
      conn = delete(conn, "/api/enroll/#{course.id}")

      assert response(conn, 204)
    end

    test "returns 404 when not enrolled", %{conn: conn} do
      conn = delete(conn, "/api/enroll/99999")

      assert json_response(conn, 404)
    end
  end

  describe "GET /api/my-enrollments" do
    setup %{student: student, course: course} do
      {:ok, _enrollment} = Enrollments.create_enrollment(%{
        user_id: student.id,
        course_id: course.id,
        status: "active"
      })

      :ok
    end

    test "lists user's enrollments", %{conn: conn} do
      conn = get(conn, "/api/my-enrollments")

      enrollments = json_response(conn, 200)["data"]
      assert length(enrollments) >= 1
      assert hd(enrollments)["status"] == "active"
    end

    test "returns empty array when no enrollments", %{conn: conn, student: student} do
      # Delete all enrollments
      Enrollments.list_user_enrollments(student.id)
      |> Enum.each(&Enrollments.delete_enrollment/1)

      conn = get(conn, "/api/my-enrollments")

      assert json_response(conn, 200)["data"] == []
    end
  end

  describe "GET /api/courses/:course_id/enrollments" do
    setup %{conn: conn, student: student, course: course} do
      {:ok, _enrollment} = Enrollments.create_enrollment(%{
        user_id: student.id,
        course_id: course.id,
        status: "active"
      })

      # Create instructor for auth
      {:ok, instructor} = Accounts.create_user(%{
        email: "instructor@example.com",
        password: "SecurePass123!",
        full_name: "Test Instructor",
        role: "instructor"
      })

      {:ok, token, _claims} = LmsApi.Guardian.encode_and_sign(instructor)

      instructor_conn = build_conn()
        |> put_req_header("authorization", "Bearer #{token}")
        |> put_req_header("content-type", "application/json")

      %{instructor_conn: instructor_conn}
    end

    test "lists course enrollments for instructor", %{instructor_conn: conn, course: course} do
      conn = get(conn, "/api/courses/#{course.id}/enrollments")

      enrollments = json_response(conn, 200)["data"]
      assert length(enrollments) >= 1
    end

    test "returns 403 for students trying to view course enrollments", %{conn: student_conn, course: course} do
      conn = get(student_conn, "/api/courses/#{course.id}/enrollments")

      assert json_response(conn, 403)["error"] =~ "Access denied"
    end
  end
end
