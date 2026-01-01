# CSRF Protection Implementation Guide

## Overview

Cross-Site Request Forgery (CSRF) protection is critical for web applications to prevent unauthorized state-changing operations. This guide covers CSRF protection for the AutoLearnPro LMS API with Single-Page Application (SPA) frontend.

## Architecture: API + SPA

AutoLearnPro uses a decoupled architecture:
- **Backend**: Elixir/Phoenix API (stateless JWT authentication)
- **Frontend**: Next.js SPA (React)

This architecture requires a specific CSRF approach different from traditional server-rendered applications.

## CSRF Protection Strategy

### Traditional Web Apps vs. API + SPA

**Traditional (Server-Rendered):**
- Session cookies automatically sent with every request
- CSRF tokens in forms/meta tags
- Phoenix's `Plug.CSRFProtection` works out-of-the-box

**API + SPA (Our Approach):**
- JWT tokens in Authorization header (not auto-sent)
- CSRF protection needed for cookie-based operations
- Custom CSRF token exchange for sensitive operations

### When CSRF Protection is Needed

✅ **Requires CSRF Protection:**
- Operations using session cookies
- Password reset confirmations
- Email verification links
- Remember-me functionality
- Admin actions from browser

❌ **Does NOT Require CSRF Protection:**
- JWT-authenticated API requests (Authorization header)
- Public endpoints (no authentication)
- Webhook callbacks (server-to-server)

## Implementation

### 1. Backend Configuration

#### Enable CSRF Protection in Router

**File:** `backend/lms_api/lib/lms_api_web/router.ex`

```elixir
defmodule LmsApiWeb.Router do
  use LmsApiWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session  # Required for CSRF
    plug :protect_from_forgery  # Enable CSRF protection
    plug :put_secure_browser_headers
  end

  pipeline :api_protected do
    plug :accepts, ["json"]
    plug :fetch_session
    plug :protect_from_forgery
    plug LmsApiWeb.Guardian.AuthPipeline
  end

  # Public endpoints (no CSRF)
  scope "/api", LmsApiWeb do
    pipe_through :api

    post "/login", AuthController, :login
    post "/register", AuthController, :register
    get "/courses", CourseController, :index
  end

  # Protected endpoints (require JWT + CSRF for sensitive ops)
  scope "/api", LmsApiWeb do
    pipe_through :api_protected

    post "/enroll/:course_id", EnrollmentController, :enroll
    delete "/enroll/:course_id", EnrollmentController, :unenroll
    post "/assessments/:id/submit", AssessmentController, :submit
    put "/profile", UserController, :update_profile
  end
end
```

#### Custom CSRF Plug for API

**File:** `backend/lms_api/lib/lms_api_web/plugs/api_csrf_protection.ex`

```elixir
defmodule LmsApiWeb.Plugs.ApiCsrfProtection do
  @moduledoc """
  CSRF protection for API endpoints that require it.
  
  Validates CSRF token from:
  1. X-CSRF-Token header (preferred for SPAs)
  2. _csrf_token parameter in body
  
  Skips validation for:
  - GET, HEAD, OPTIONS requests (safe methods)
  - Requests with valid JWT but no session
  """
  
  import Plug.Conn
  require Logger

  def init(opts), do: opts

  def call(conn, _opts) do
    if csrf_required?(conn) do
      validate_csrf_token(conn)
    else
      conn
    end
  end

  defp csrf_required?(conn) do
    # Only require CSRF for state-changing methods
    conn.method in ["POST", "PUT", "PATCH", "DELETE"] and
    # Only if session is present (indicates cookie-based auth)
    get_session(conn, :csrf_token) != nil
  end

  defp validate_csrf_token(conn) do
    session_token = get_session(conn, :csrf_token)
    header_token = get_req_header(conn, "x-csrf-token") |> List.first()
    body_token = conn.params["_csrf_token"]

    provided_token = header_token || body_token

    if valid_csrf_token?(session_token, provided_token) do
      conn
    else
      Logger.warning("CSRF token validation failed for #{conn.request_path}")
      
      conn
      |> put_status(:forbidden)
      |> Phoenix.Controller.json(%{
        error: "CSRF token invalid or missing",
        message: "Include X-CSRF-Token header with valid token"
      })
      |> halt()
    end
  end

  defp valid_csrf_token?(session_token, provided_token) do
    session_token != nil and
    provided_token != nil and
    Plug.Crypto.secure_compare(session_token, provided_token)
  end
end
```

#### CSRF Token Generation Endpoint

**File:** `backend/lms_api/lib/lms_api_web/controllers/csrf_controller.ex`

```elixir
defmodule LmsApiWeb.CsrfController do
  use LmsApiWeb, :controller

  @doc """
  Generate and return a CSRF token for the current session.
  
  Frontend should call this on app initialization to obtain a token.
  """
  def token(conn, _params) do
    csrf_token = Plug.CSRFProtection.get_csrf_token()
    
    conn
    |> put_session(:csrf_token, csrf_token)
    |> json(%{
      csrf_token: csrf_token,
      expires_in: 3600  # 1 hour
    })
  end
end
```

**Add route:**
```elixir
scope "/api", LmsApiWeb do
  pipe_through :api
  
  get "/csrf-token", CsrfController, :token
end
```

### 2. Frontend Configuration

#### Fetch CSRF Token on App Init

**File:** `frontend/web/src/lib/csrf.ts`

```typescript
let csrfToken: string | null = null;

export async function initCsrfProtection(): Promise<void> {
  try {
    const response = await fetch('/api/csrf-token', {
      method: 'GET',
      credentials: 'include',  // Include cookies
    });

    if (!response.ok) {
      throw new Error('Failed to fetch CSRF token');
    }

    const data = await response.json();
    csrfToken = data.csrf_token;

    // Refresh token before it expires
    setTimeout(() => {
      initCsrfProtection();
    }, (data.expires_in - 60) * 1000);  // Refresh 1 min before expiry
  } catch (error) {
    console.error('CSRF token fetch failed:', error);
  }
}

export function getCsrfToken(): string | null {
  return csrfToken;
}
```

#### Include Token in API Requests

**File:** `frontend/web/src/lib/api.ts`

```typescript
import { getCsrfToken } from './csrf';

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers,
  };

  // Add JWT token if available
  const jwtToken = localStorage.getItem('auth_token');
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }

  // Add CSRF token for state-changing requests
  const method = options.method?.toUpperCase() || 'GET';
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',  // Send cookies
  });

  if (!response.ok) {
    if (response.status === 403) {
      // CSRF token invalid, refresh and retry
      await initCsrfProtection();
      throw new Error('CSRF token expired, please retry');
    }
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
```

#### Initialize in App Root

**File:** `frontend/web/src/app/layout.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { initCsrfProtection } from '@/lib/csrf';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Initialize CSRF protection on app mount
    initCsrfProtection();
  }, []);

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

## Configuration Options

### Phoenix CSRF Configuration

**File:** `backend/lms_api/config/config.exs`

```elixir
config :lms_api_web, LmsApiWeb.Endpoint,
  # CSRF configuration
  csrf_token_name: "csrf_token",
  csrf_token_plug: Plug.CSRFProtection,
  csrf_token_reader: {Plug.CSRFProtection, :read_csrf_token, []},
  
  # Session configuration (required for CSRF)
  session: [
    store: :cookie,
    key: "_lms_api_key",
    signing_salt: "your_signing_salt",
    encryption_salt: "your_encryption_salt",
    max_age: 86400  # 24 hours
  ]
```

### Environment-Specific Settings

**Development:**
```elixir
# config/dev.exs
config :lms_api_web, LmsApiWeb.Endpoint,
  check_origin: false,  # Allow all origins in dev
  csrf: [
    enabled: true,
    allow_origins: ["http://localhost:3000"]
  ]
```

**Production:**
```elixir
# config/prod.exs
config :lms_api_web, LmsApiWeb.Endpoint,
  check_origin: [
    "https://autolearnpro.com",
    "https://www.autolearnpro.com"
  ],
  csrf: [
    enabled: true,
    token_max_age: 3600  # 1 hour
  ]
```

## Testing CSRF Protection

### Backend Tests

**File:** `backend/lms_api/test/lms_api_web/plugs/api_csrf_protection_test.exs`

```elixir
defmodule LmsApiWeb.Plugs.ApiCsrfProtectionTest do
  use LmsApiWeb.ConnCase, async: true

  alias LmsApiWeb.Plugs.ApiCsrfProtection

  describe "CSRF protection" do
    test "allows GET requests without token", %{conn: conn} do
      conn = conn
      |> get("/api/courses")
      
      assert conn.status != 403
    end

    test "blocks POST without CSRF token", %{conn: conn} do
      conn = conn
      |> put_session(:csrf_token, "valid_token")
      |> post("/api/enroll/1", %{})
      
      assert conn.status == 403
      assert json_response(conn, 403)["error"] =~ "CSRF"
    end

    test "allows POST with valid CSRF token in header", %{conn: conn} do
      csrf_token = Plug.CSRFProtection.get_csrf_token()
      
      conn = conn
      |> put_session(:csrf_token, csrf_token)
      |> put_req_header("x-csrf-token", csrf_token)
      |> post("/api/enroll/1", %{})
      
      assert conn.status != 403
    end

    test "allows POST with valid CSRF token in body", %{conn: conn} do
      csrf_token = Plug.CSRFProtection.get_csrf_token()
      
      conn = conn
      |> put_session(:csrf_token, csrf_token)
      |> post("/api/enroll/1", %{_csrf_token: csrf_token})
      
      assert conn.status != 403
    end
  end
end
```

### Frontend Tests

```typescript
// frontend/web/src/lib/__tests__/api.test.ts
import { apiRequest } from '../api';
import { getCsrfToken } from '../csrf';

jest.mock('../csrf');

describe('API requests with CSRF', () => {
  beforeEach(() => {
    (getCsrfToken as jest.Mock).mockReturnValue('mock-csrf-token');
  });

  it('includes CSRF token in POST requests', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    await apiRequest('/enroll/1', { method: 'POST' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-CSRF-Token': 'mock-csrf-token',
        }),
      })
    );
  });

  it('does not include CSRF token in GET requests', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await apiRequest('/courses', { method: 'GET' });

    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(headers['X-CSRF-Token']).toBeUndefined();
  });
});
```

## Security Best Practices

1. **Use HTTPS in Production**: CSRF tokens should only be transmitted over secure connections
2. **Rotate Tokens Regularly**: Implement token expiration and rotation
3. **Validate Origin Header**: Check `Origin` and `Referer` headers in addition to CSRF tokens
4. **SameSite Cookies**: Set `SameSite=Strict` or `SameSite=Lax` on session cookies
5. **Secure Cookies**: Set `Secure` and `HttpOnly` flags on session cookies
6. **Token Entropy**: Use cryptographically secure random tokens (Phoenix does this by default)

### Production Cookie Configuration

```elixir
# config/prod.exs
config :lms_api_web, LmsApiWeb.Endpoint,
  session: [
    store: :cookie,
    key: "_lms_api_key",
    signing_salt: System.get_env("SESSION_SIGNING_SALT"),
    encryption_salt: System.get_env("SESSION_ENCRYPTION_SALT"),
    max_age: 86400,  # 24 hours
    secure: true,     # HTTPS only
    http_only: true,  # No JavaScript access
    same_site: "Lax"  # CSRF protection
  ]
```

## Troubleshooting

### Common Issues

**1. "CSRF token missing" errors:**
- Ensure `initCsrfProtection()` is called on app mount
- Check that cookies are enabled in browser
- Verify `credentials: 'include'` in fetch options

**2. "CSRF token invalid" errors:**
- Token may have expired (default 1 hour)
- Session may have been cleared
- Token not matching between frontend and backend

**3. CORS issues with CSRF:**
- Ensure `check_origin` is configured correctly
- Verify `Access-Control-Allow-Credentials: true` header
- Frontend and backend must be on same domain or configured CORS

### Debug Mode

Add this to your endpoint configuration for debugging:

```elixir
# config/dev.exs
config :logger, level: :debug

config :lms_api_web, LmsApiWeb.Endpoint,
  debug_errors: true,
  csrf: [enabled: true, log_missing_token: true]
```

## References

- [Phoenix CSRF Protection](https://hexdocs.pm/phoenix/csrf_protection.html)
- [Plug.CSRFProtection](https://hexdocs.pm/plug/Plug.CSRFProtection.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [SameSite Cookie Attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)

## Contributing

When implementing new sensitive endpoints:
1. Determine if CSRF protection is needed (cookie-based auth)
2. Add appropriate CSRF validation in controller or plug
3. Update frontend to include CSRF token
4. Add test cases for CSRF validation
5. Document any special CSRF requirements
