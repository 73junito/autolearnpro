# Frontend Requirements Checklist

Purpose: gather the minimal information needed to implement the first UI iteration (layout, navigation, and core data flows).

1) Stakeholders
- Product owner: [name/email]
- Backend owner: [name/email]
- Designer: [name/email]

2) Target pages / flows (initial scope)
- Dashboard (overview, recent activity)
- Course catalog (list, filters, search)
- Course page (lessons list, meta)
- Lesson player (video/audio, transcripts, resources)
- Assessment / quiz interface
- Account / profile

3) UX goals
- Fast initial load for catalog and dashboard
- Clear progress indicators for lessons and assessments
- Mobile-first responsive layout
- Accessibility: keyboard navigation and screen-reader friendly

4) API contracts (collect from backend)
- Endpoint: `GET /api/courses` — pagination, filters, search params
- Endpoint: `GET /api/courses/{id}` — course details, lessons
- Endpoint: `GET /api/lessons/{id}` — lesson metadata and media URLs
- Endpoint: `POST /api/assessments/{id}/submit` — answers payload and result
- Auth: JWT via `Authorization: Bearer <token>`

Example endpoints and sample payloads (from backend controllers & views)

- Auth
	- POST `/api/login`
		- body: `{ "email": "user@example.com", "password": "secret" }`
		- response: `{ "token": "<jwt>", "user": { "id": 123, "email": "user@example.com", "name": "Alex" } }`

- Courses (catalog)
	- GET `/api/courses`
		- query params: `page`, `page_size`, `q` (search), `active=true|false`
		- response shape:

```json
{
	"data": [
		{
			"id": 1,
			"code": "CS101",
			"title": "Intro to Programming",
			"description": "Basics of programming",
			"credits": 3,
			"delivery_mode": "online",
			"active": true
		}
	]
}
```

	- GET `/api/courses/{id}`
		- response (course detail):

```json
{
	"data": {
		"id": 1,
		"code": "CS101",
		"title": "Intro to Programming",
		"description": "Basics of programming",
		"credits": 3,
		"delivery_mode": "online",
		"active": true,
		"syllabus": {
			"overview": "Course overview text",
			"learning_outcomes": ["Write programs", "Understand algorithms"]
		},
		"modules": [
			{
				"id": 11,
				"position": 1,
				"title": "Getting started",
				"summary": "Intro module",
				"lessons": [
					{ "id": 101, "position": 1, "title": "Variables", "lesson_type": "video", "duration_minutes": 8 }
				]
			}
		]
	}
}
```

- Lesson
	- GET `/api/lessons/{id}`
		- response includes `media_urls`, `transcript` (optional), `resources`

```json
{
	"id": 101,
	"title": "Variables",
	"lesson_type": "video",
	"duration_minutes": 8,
	"media_urls": { "mp4": "https://.../video.mp4", "thumbnail": "https://.../thumb.jpg" },
	"transcript": "...",
	"resources": [ { "label": "Slides PDF", "url": "https://.../slides.pdf" } ]
}
```

- Enrollment / Progress
	- POST `/api/enroll/{course_id}` — enroll current user in course (no body)
	- POST `/api/lessons/{lesson_id}/start` — start lesson (no body)
	- POST `/api/lessons/{lesson_id}/complete` — mark complete (no body)

	- Example progress response:

```json
{ "lesson_id": 101, "user_id": 42, "status": "completed", "completed_at": "2026-01-01T16:40:00Z" }
```

Notes:
- The backend exposes `resources "/courses"` and `resources "/users"` for CRUD; use `GET /api/courses` and `GET /api/courses/{id}` for catalog and course page.
- For authenticated endpoints, include `Authorization: Bearer <token>` header.

5) Acceptance criteria (example)
- Catalog loads first page within 1s (local dev target)
- Lesson player loads media and playback controls are keyboard accessible
- Submitting an assessment returns result and persists progress

6) Deliverables / artifacts
- High-fidelity wireframes (desktop + mobile)
- Component inventory (Storybook stories)
- API contract document (example requests/responses)
- Acceptance test checklist

Next steps (this task)
- Schedule 15–30 minute interviews with stakeholders to confirm APIs and UX goals.
- Populate `API contracts` section with real endpoints and example payloads.
- Collect representative sample data (JSON) for wireframes and Storybook.
