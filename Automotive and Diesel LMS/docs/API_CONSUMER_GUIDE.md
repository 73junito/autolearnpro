# AutoLearnPro API Consumer Guide

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Base URL & Headers](#base-url--headers)
- [Rate Limiting](#rate-limiting)
- [Error Codes](#error-codes)
- [Core Endpoints](#core-endpoints)
- [Code Examples](#code-examples)

## Overview

The AutoLearnPro LMS API is a RESTful API built with Elixir/Phoenix. All responses are in JSON format.

**API Version:** v1  
**Base URL:** `https://api.autolearnpro.com/api` (production)  
**Base URL:** `http://localhost:4000/api` (development)

## Authentication

### Register a New User

**Endpoint:** `POST /register`

```bash
curl -X POST https://api.autolearnpro.com/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "user": {
      "email": "student@example.com",
      "password": "SecurePass123!",
      "full_name": "Jane Doe",
      "role": "student"
    }
  }'
```

**Response (201 Created):**
```json
{
  "data": {
    "id": 123,
    "email": "student@example.com",
    "full_name": "Jane Doe",
    "role": "student",
    "inserted_at": "2025-12-16T10:30:00Z"
  }
}
```

**Error Response (422 Unprocessable Entity):**
```json
{
  "errors": {
    "email": ["has already been taken"],
    "password": ["should be at least 12 characters"]
  }
}
```

### Login

**Endpoint:** `POST /login`

```bash
curl -X POST https://api.autolearnpro.com/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "password": "SecurePass123!"
  }'
```

**Response (200 OK):**
```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 123,
      "email": "student@example.com",
      "full_name": "Jane Doe",
      "role": "student"
    }
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "error": "Invalid email or password"
}
```

### Using JWT Tokens

Include the JWT token in the `Authorization` header for all authenticated requests:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Base URL & Headers

**Required Headers:**
```
Content-Type: application/json
Accept: application/json
```

**Authenticated Requests:**
```
Authorization: Bearer <your_jwt_token>
```

## Rate Limiting

The API implements rate limiting to prevent abuse:

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Authentication (`/login`, `/register`) | 5 requests | 60 seconds |
| General API endpoints | 100 requests | 60 seconds |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1702729800
Retry-After: 60 (when rate limited)
```

**Rate Limit Exceeded (429):**
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retry_after_seconds": 60
}
```

## Error Codes

| Status Code | Meaning |
|------------|---------|
| 200 | OK - Request succeeded |
| 201 | Created - Resource created successfully |
| 204 | No Content - Request succeeded, no response body |
| 400 | Bad Request - Invalid request format |
| 401 | Unauthorized - Missing or invalid authentication |
| 403 | Forbidden - Authenticated but lacks permission |
| 404 | Not Found - Resource doesn't exist |
| 422 | Unprocessable Entity - Validation failed |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |

**Standard Error Response Format:**
```json
{
  "error": "Error message",
  "errors": {
    "field_name": ["validation error message"]
  }
}
```

## Core Endpoints

### Courses

#### List All Courses
```bash
GET /courses

curl -X GET https://api.autolearnpro.com/api/courses \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": 1,
      "code": "CS101",
      "title": "Introduction to Computer Science",
      "description": "Learn the basics of CS",
      "credits": 3,
      "delivery_mode": "online",
      "active": true
    }
  ]
}
```

#### Get Course Details
```bash
GET /courses/:id

curl -X GET https://api.autolearnpro.com/api/courses/1 \
  -H "Authorization: Bearer <token>"
```

#### Get Course Structure (Modules & Lessons)
```bash
GET /courses/:course_id/structure

curl -X GET https://api.autolearnpro.com/api/courses/1/structure \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "data": {
    "id": 1,
    "code": "CS101",
    "title": "Introduction to Computer Science",
    "modules": [
      {
        "id": 1,
        "title": "Module 1: Basics",
        "position": 1,
        "lessons": [
          {
            "id": 1,
            "title": "Lesson 1: Introduction",
            "content_type": "video",
            "duration_minutes": 30,
            "position": 1
          }
        ]
      }
    ]
  }
}
```

### Enrollments

#### Enroll in Course
```bash
POST /enroll/:course_id

curl -X POST https://api.autolearnpro.com/api/enroll/1 \
  -H "Authorization: Bearer <token>"
```

**Response (201 Created):**
```json
{
  "data": {
    "id": 456,
    "user_id": 123,
    "course_id": 1,
    "status": "active",
    "enrolled_at": "2025-12-16T10:30:00Z"
  }
}
```

#### Get My Enrollments
```bash
GET /my-enrollments

curl -X GET https://api.autolearnpro.com/api/my-enrollments \
  -H "Authorization: Bearer <token>"
```

#### Unenroll from Course
```bash
DELETE /enroll/:course_id

curl -X DELETE https://api.autolearnpro.com/api/enroll/1 \
  -H "Authorization: Bearer <token>"
```

### Progress Tracking

#### Start a Lesson
```bash
POST /lessons/:lesson_id/start

curl -X POST https://api.autolearnpro.com/api/lessons/5/start \
  -H "Authorization: Bearer <token>"
```

#### Mark Lesson as Complete
```bash
POST /lessons/:lesson_id/complete

curl -X POST https://api.autolearnpro.com/api/lessons/5/complete \
  -H "Authorization: Bearer <token>"
```

#### Get Course Progress
```bash
GET /courses/:course_id/progress

curl -X GET https://api.autolearnpro.com/api/courses/1/progress \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "data": {
    "course_id": 1,
    "completion_percentage": 65.5,
    "completed_lessons": 15,
    "total_lessons": 23,
    "last_accessed": "2025-12-16T09:15:00Z"
  }
}
```

### Assessments

#### Get Course Assessments
```bash
GET /courses/:course_id/assessments

curl -X GET https://api.autolearnpro.com/api/courses/1/assessments \
  -H "Authorization: Bearer <token>"
```

#### Start Assessment Attempt
```bash
POST /assessments/:assessment_id/start

curl -X POST https://api.autolearnpro.com/api/assessments/10/start \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "data": {
    "attempt_id": 789,
    "assessment_id": 10,
    "started_at": "2025-12-16T10:30:00Z",
    "time_limit_minutes": 60,
    "questions": [
      {
        "id": 1,
        "question_text": "What is 2+2?",
        "question_type": "multiple_choice",
        "options": ["3", "4", "5", "6"],
        "points": 1
      }
    ]
  }
}
```

#### Submit Assessment
```bash
POST /assessment-attempts/:attempt_id/submit

curl -X POST https://api.autolearnpro.com/api/assessment-attempts/789/submit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "answers": [
      {"question_id": 1, "answer": "4"},
      {"question_id": 2, "answer": ["a", "c"]}
    ]
  }'
```

## Code Examples

### JavaScript/Node.js

```javascript
const API_BASE = 'https://api.autolearnpro.com/api';

// Login
async function login(email, password) {
  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  if (!response.ok) throw new Error('Login failed');
  
  const data = await response.json();
  return data.data.token;
}

// Get courses
async function getCourses(token) {
  const response = await fetch(`${API_BASE}/courses`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) throw new Error('Failed to fetch courses');
  
  const data = await response.json();
  return data.data;
}

// Enroll in course
async function enrollInCourse(token, courseId) {
  const response = await fetch(`${API_BASE}/enroll/${courseId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) throw new Error('Enrollment failed');
  
  return await response.json();
}
```

### Python

```python
import requests

API_BASE = 'https://api.autolearnpro.com/api'

class LMSClient:
    def __init__(self):
        self.token = None
        self.session = requests.Session()
    
    def login(self, email, password):
        response = self.session.post(
            f'{API_BASE}/login',
            json={'email': email, 'password': password}
        )
        response.raise_for_status()
        
        data = response.json()
        self.token = data['data']['token']
        self.session.headers.update({
            'Authorization': f'Bearer {self.token}'
        })
        return self.token
    
    def get_courses(self):
        response = self.session.get(f'{API_BASE}/courses')
        response.raise_for_status()
        return response.json()['data']
    
    def enroll_in_course(self, course_id):
        response = self.session.post(f'{API_BASE}/enroll/{course_id}')
        response.raise_for_status()
        return response.json()['data']

# Usage
client = LMSClient()
client.login('student@example.com', 'SecurePass123!')
courses = client.get_courses()
print(f"Found {len(courses)} courses")
```

### cURL Examples Collection

```bash
# Save token to variable
TOKEN=$(curl -s -X POST https://api.autolearnpro.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@example.com","password":"SecurePass123!"}' \
  | jq -r '.data.token')

# List courses
curl -X GET https://api.autolearnpro.com/api/courses \
  -H "Authorization: Bearer $TOKEN"

# Enroll in course
curl -X POST https://api.autolearnpro.com/api/enroll/1 \
  -H "Authorization: Bearer $TOKEN"

# Get progress
curl -X GET https://api.autolearnpro.com/api/courses/1/progress \
  -H "Authorization: Bearer $TOKEN"
```

## Postman Collection

Import the Swagger/OpenAPI spec to Postman:

1. Open Postman
2. Click Import → Link
3. Enter: `https://api.autolearnpro.com/api/swagger.json`
4. Configure environment variables:
   - `base_url`: `https://api.autolearnpro.com/api`
   - `token`: (obtained from login)

## Support

For API support, please:
- Check the [Swagger documentation](https://api.autolearnpro.com/api/docs)
- Open an issue on [GitHub](https://github.com/73junito/autolearnpro/issues)
- Contact: support@autolearnpro.com
