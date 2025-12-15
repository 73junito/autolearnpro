defmodule LmsApiWeb.Router do
  use LmsApiWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_flash
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :auth do
    plug LmsApiWeb.Auth.Pipeline
  end

  scope "/api", LmsApiWeb do
    pipe_through :api

    # Health check for API readiness
    get "/health", HealthController, :index

    # Auth endpoints
    post "/register", AuthController, :register
    post "/login", AuthController, :login
  end

  scope "/api", LmsApiWeb do
    pipe_through [:api, :auth]

    # Enrollment endpoints
    post "/enroll/:course_id", EnrollmentController, :enroll
    delete "/enroll/:course_id", EnrollmentController, :unenroll
    get "/my-enrollments", EnrollmentController, :my_enrollments
    get "/courses/:course_id/enrollments", EnrollmentController, :course_enrollments

    # Progress endpoints
    post "/lessons/:lesson_id/start", ProgressController, :start_lesson
    post "/lessons/:lesson_id/complete", ProgressController, :complete_lesson
    post "/lessons/:lesson_id/quiz", ProgressController, :submit_quiz
    get "/lessons/:lesson_id/progress", ProgressController, :lesson_progress
    get "/courses/:course_id/progress", ProgressController, :course_progress

    # Instructor dashboard endpoints
    get "/instructor/dashboard", InstructorDashboardController, :dashboard
    get "/instructor/courses", InstructorDashboardController, :courses
    get "/instructor/courses/:course_id/analytics", InstructorDashboardController, :course_analytics
    get "/instructor/courses/:course_id/students", InstructorDashboardController, :student_progress
    post "/instructor/courses", InstructorDashboardController, :create_course
    put "/instructor/courses/:id", InstructorDashboardController, :update_course
    delete "/instructor/courses/:id", InstructorDashboardController, :delete_course

    # Content management endpoints
    get "/courses/:course_id/structure", ContentController, :course_structure
    post "/courses/:course_id/modules", ContentController, :create_module
    put "/modules/:id", ContentController, :update_module
    delete "/modules/:id", ContentController, :delete_module
    post "/courses/:course_id/reorder-modules", ContentController, :reorder_modules
    post "/modules/:module_id/lessons", ContentController, :create_lesson
    put "/lessons/:id", ContentController, :update_lesson
    delete "/lessons/:id", ContentController, :delete_lesson
    post "/modules/:module_id/reorder-lessons", ContentController, :reorder_lessons
    post "/lessons/:lesson_id/duplicate", ContentController, :duplicate_lesson
    post "/modules/:module_id/duplicate", ContentController, :duplicate_module

    # Assessment endpoints
    get "/courses/:course_id/assessments", AssessmentController, :index
    post "/courses/:course_id/assessments", AssessmentController, :create
    get "/assessments/:id", AssessmentController, :show
    put "/assessments/:id", AssessmentController, :update
    delete "/assessments/:id", AssessmentController, :delete
    get "/assessments/:id/analytics", AssessmentController, :analytics
    post "/assessments/:assessment_id/start", AssessmentController, :start_attempt
    post "/assessment-attempts/:attempt_id/submit", AssessmentController, :submit_attempt
    get "/assessments/:assessment_id/my-attempts", AssessmentController, :user_attempts

    # Media/file upload endpoints
    post "/courses/:course_id/upload", MediaController, :upload
    get "/courses/:course_id/files", MediaController, :index
    get "/files/:id", MediaController, :show
    put "/files/:id", MediaController, :update
    delete "/files/:id", MediaController, :delete
    get "/files/:id/download", MediaController, :download

    # AI-powered features
    post "/ai/generate-questions", AIController, :generate_quiz_questions
    get "/courses/:course_id/ai/recommendations", AIController, :learning_recommendations
    get "/courses/:course_id/ai/study-plan", AIController, :study_plan
    post "/ai/grading-feedback", AIController, :grading_feedback
    post "/courses/:course_id/ai/answer", AIController, :answer_question
    get "/courses/:course_id/ai/analytics", AIController, :course_analytics

    # Gamification features
    get "/gamification/badges", GamificationController, :badges
    get "/gamification/my-badges", GamificationController, :user_badges
    get "/courses/:course_id/leaderboard", GamificationController, :course_leaderboard
    post "/gamification/award-badge", GamificationController, :award_badge
    post "/gamification/check-achievements", GamificationController, :check_achievements

    # Live sessions / video conferencing
    get "/courses/:course_id/sessions", LiveSessionsController, :index
    post "/courses/:course_id/sessions", LiveSessionsController, :create
    get "/sessions/:id", LiveSessionsController, :show
    put "/sessions/:id", LiveSessionsController, :update
    delete "/sessions/:id", LiveSessionsController, :delete
    post "/sessions/:id/start", LiveSessionsController, :start_session
    post "/sessions/:id/end", LiveSessionsController, :end_session
    post "/sessions/:id/join", LiveSessionsController, :join_session
    post "/sessions/:id/leave", LiveSessionsController, :leave_session
    get "/sessions/:id/participants", LiveSessionsController, :participants
    get "/sessions/:id/recordings", LiveSessionsController, :recordings
    get "/sessions/:id/analytics", LiveSessionsController, :analytics

    # Permissions and roles management
    get "/permissions/roles", PermissionsController, :index_roles
    post "/permissions/roles", PermissionsController, :create_role
    get "/permissions/roles/:id", PermissionsController, :show_role
    put "/permissions/roles/:id", PermissionsController, :update_role
    delete "/permissions/roles/:id", PermissionsController, :delete_role
    post "/permissions/assign-role", PermissionsController, :assign_role_to_user
    get "/permissions/user/:user_id/roles", PermissionsController, :get_user_roles
    post "/permissions/assign-permission", PermissionsController, :assign_permission_to_role
    delete "/permissions/roles/:role_id/permissions/:permission_id", PermissionsController, :remove_permission_from_role
    get "/permissions/roles/:role_id/permissions", PermissionsController, :get_role_permissions
    post "/permissions/check", PermissionsController, :check_permission
    get "/permissions/list", PermissionsController, :list_permissions

    resources "/users", UserController, except: [:new, :edit]
    resources "/courses", CourseController, except: [:new, :edit]
  end

  scope "/", LmsApiWeb do
    pipe_through :browser

    get "/", PageController, :index
  end
end