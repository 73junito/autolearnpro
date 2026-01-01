# AI-Powered LMS - Configuration Complete ✅

## Overview
The Automotive & Diesel LMS now has AI integration configured with local Ollama models for automated course content generation.

## AI Infrastructure

### ✅ Ollama Models Available
- **qwen3-vl:8b** (6.1 GB, 8.8B parameters)
  - Purpose: Vision-language model for course content generation
  - Use cases: Lesson content, learning outcomes, quiz questions, explanations
  
- **Flux_AI/Flux_AI:latest** (2.0 GB, 3.2B parameters)
  - Purpose: Image generation model
  - Use cases: Course diagrams, thumbnails, visual aids
  
- **llama3.1:8b** (4.9 GB, 8.0B parameters)
  - Purpose: General-purpose fallback model
  
- **mistral:7b** (4.4 GB, 7.2B parameters)
  - Purpose: Alternative general-purpose model

### ✅ Network Connectivity
- Ollama accessible from Kubernetes cluster via: `http://host.docker.internal:11434`
- Test Result: ✅ 200 OK response with model list
- API Endpoints:
  - `/api/tags` - List available models
  - `/api/generate` - Generate completions

## Backend Configuration

### ✅ Files Created/Updated

1. **AI Client Module** (`backend/lms_api/lib/lms_api/ai_client.ex`)
   - Lightweight Ollama adapter
   - Default URL: `http://host.docker.internal:11434`
   - Functions: `generate/2`, `ask/2`

2. **AI Content Generator** (`backend/lms_api/lib/lms_api/ai_content_generator.ex`)
   - High-level course generation functions
   - Functions:
     - `generate_learning_outcomes/2` - Creates 5-7 measurable outcomes
     - `generate_course_modules/3` - Creates 4 modules with descriptions/objectives
     - `generate_lesson_content/2` - Creates comprehensive lesson content
     - `generate_assessment_questions/3` - Creates quiz questions
     - `generate_complete_course/1` - Orchestrates full course creation

3. **Runtime Configuration** (`backend/lms_api/config/runtime.exs`)
   - Added Ollama URL configuration
   - Added AI model mappings:
     ```elixir
     config :lms_api, :ollama_url, "http://host.docker.internal:11434"
     config :lms_api, :ai_models,
       content_generation: "qwen3-vl:8b",
       image_generation: "Flux_AI/Flux_AI:latest",
       default: "llama3.1:8b"
     ```

4. **Database Schemas Updated**
   - ✅ `course.ex` - Added level, duration_hours fields, changed credits to float
   - ✅ `course_syllabus.ex` - Updated to match DB schema (arrays, jsonb)
   - ✅ `course_module.ex` - Updated to use sequence_number, objectives array
   - ✅ `module_lesson.ex` - Updated to match DB schema completely
   - ✅ `catalog.ex` - Added create_course_syllabus/1 function

### ✅ Database Schema (11 Tables)
```
users                  - User accounts
enrollments            - Student course enrollments  
courses                - Course catalog (code, title, description, credits, level, etc.)
course_syllabus        - Syllabi with learning outcomes, grading
course_modules         - Course modules (sequence, objectives)
module_lessons         - Lessons within modules (content, type, duration)
assessments            - Quizzes/exams
assessment_questions   - Individual questions
assessment_attempts    - Student attempts
student_progress       - Progress tracking
schema_migrations      - Migration version tracking
```

## AI Seed Script

### ✅ Created: `backend/lms_api/priv/repo/seeds_ai_courses.exs`
Pre-configured to generate 3 sample courses:
- **AUT-120**: Introduction to Brake Systems (4 credits, 60 hours)
- **AUT-140**: Engine Fundamentals (5 credits, 75 hours)
- **DSL-160**: Diesel Engine Operation (5 credits, 75 hours)

Each course will have:
- AI-generated learning outcomes (5-7 outcomes)
- 4 modules with descriptions and objectives
- 12 lessons total (3 per module: 2 regular + 1 lab)
- Comprehensive markdown content for each lesson

## Course Catalog Documentation

### ✅ Extracted from Word Documents
- `docs/course_catalog_extracted.txt` - Full course structure
- `docs/master_instructional_package.txt` - Implementation details

**Catalog Structure:**
- **Lower Division (100-200 level)**: 15-20 courses
  - Automotive Core: Brake systems, engines, electrical, suspension
  - Diesel Fundamentals: Engine operation, fuel systems, maintenance
  - EV/Hybrid: Battery systems, charging, inverters
  - Virtual Lab Foundations: Diagnostic tools, safety
  
- **Upper Division (300-400 level)**: 10+ courses
  - Advanced diagnostics, heavy equipment
  - High-voltage EV systems
  - Fleet management, capstone projects

## Deployment Status

### ✅ Completed
- [x] Database schema fully deployed (11 tables)
- [x] Course catalog extracted from documentation
- [x] Ollama connectivity verified from cluster
- [x] AI client module configured
- [x] AI content generator created
- [x] Database schemas synchronized with DB
- [x] Sample course seed script created
- [x] Test enrollment created (ai-test@example.com in course_id=1)

### ⏸️ Pending (Code Deployment Required)
- [ ] Rebuild Docker image with updated code
- [ ] Deploy updated backend pods
- [ ] Run AI seed script to generate sample courses
- [ ] Test AI endpoints with deployed code
- [ ] Generate full course catalog (25-30 courses)

### ❌ Known Issues
- Docker build keeps getting interrupted/cancelled
- Backend pods running old code without latest fixes:
  - Missing `can_manage_course?/2` function
  - Wrong `Accounts` module reference in AI module
  
## Next Steps

### Option 1: Rebuild Docker Image (Recommended)
```bash
cd backend/lms_api
docker build -t lms-api:latest .
kubectl rollout restart deployment lms-api -n autolearnpro
```

### Option 2: Generate Courses via Development Environment
```bash
cd backend/lms_api
mix run priv/repo/seeds_ai_courses.exs
```

### Option 3: Test AI Generation Manually
```elixir
# In iex -S mix
alias LmsApi.AIContentGenerator
alias LmsApi.Catalog

# Create a course
{:ok, course} = Catalog.create_course(%{
  code: "AUT-120",
  title: "Introduction to Brake Systems",
  description: "Comprehensive brake systems course",
  credits: 4.0,
  delivery_mode: "hybrid",
  level: "lower_division",
  duration_hours: 60,
  active: true
})

# Generate learning outcomes
{:ok, outcomes} = AIContentGenerator.generate_learning_outcomes("AUT-120", "Introduction to Brake Systems")

# Generate modules
{:ok, modules} = AIContentGenerator.generate_course_modules("AUT-120", "Introduction to Brake Systems", 4)
```

## Performance Benchmarks

### Stress Test Results (Pre-AI)
- **LMS API**: 2,846 requests in 60s = 47.43 req/s, 100% success, <1ms avg
- **Frontend**: 3,289 requests in 60s = 54.81 req/s, 100% success, <1ms avg
- **AI Endpoints**: 117 calls, 33% success (limited by missing code deployment)

### Expected AI Performance
- Content generation: 5-15 seconds per module
- Quiz generation: 3-10 seconds for 5 questions
- Full course generation: 2-5 minutes (4 modules, 12 lessons)

## Configuration Reference

### Environment Variables (Kubernetes)
```yaml
- name: OLLAMA_URL
  value: "http://host.docker.internal:11434"
- name: SECRET_KEY_BASE
  valueFrom:
    secretKeyRef:
      name: lms-api-secrets
      key: secret-key-base
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: lms-api-secrets
      key: database-url
```

### Model Selection Guidelines
- **Course content** (lessons, explanations): `qwen3-vl:8b`
- **Quiz questions**: `qwen3-vl:8b` or `llama3.1:8b`
- **Images/diagrams**: `Flux_AI/Flux_AI:latest`
- **General fallback**: `llama3.1:8b`

## Testing Commands

### Test Ollama from Cluster
```bash
kubectl run -it --rm ollama-test --image=curlimages/curl -- \
  curl http://host.docker.internal:11434/api/tags
```

### Check Database Tables
```bash
kubectl exec -n autolearnpro postgres-<pod-id> -- \
  psql -U postgres -d lms_api_prod -c "\dt"
```

### View Backend Logs
```bash
kubectl logs -n autolearnpro deployment/lms-api -f
```

### Run AI Seed Script (from K8s)
```bash
kubectl exec -it deployment/lms-api -n autolearnpro -- \
  bin/lms_api eval "LmsApi.Release.seed_ai_courses()"
```

## Support & Troubleshooting

### Ollama Not Accessible
1. Verify Ollama is running: `ollama list`
2. Check port binding: `netstat -an | findstr 11434`
3. Test from host: `curl http://localhost:11434/api/tags`

### Course Generation Fails
1. Check Ollama logs for errors
2. Verify model is downloaded: `ollama list`
3. Test model manually: `ollama run qwen3-vl:8b "Hello"`
4. Check backend logs for API errors

### Database Schema Mismatch
1. Check current schema: `\d table_name` in psql
2. Review migration files in `priv/repo/migrations/`
3. Run pending migrations: `mix ecto.migrate`

## Summary
🎉 **AI integration is configured and ready!** All components are in place:
- ✅ Ollama models verified and accessible
- ✅ Backend code updated with AI client and content generator
- ✅ Database schema complete (11 tables)
- ✅ Seed script ready to generate sample courses
- ⏸️ Awaiting Docker rebuild to deploy updated code

Once the Docker image is rebuilt and deployed, you can run the seed script to automatically generate 3 complete courses with AI-powered content!
