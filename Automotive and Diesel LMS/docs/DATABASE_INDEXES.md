# Database Indexing Strategy

## Overview

This document outlines the indexing strategy for the AutoLearnPro LMS database. Proper indexing is critical for query performance, especially as the database grows with more users, courses, and enrollments.

## Indexing Principles

1. **Foreign Keys**: Always index foreign key columns for efficient JOIN operations
2. **Filter Columns**: Index columns frequently used in WHERE clauses
3. **Sort Columns**: Index columns used in ORDER BY clauses
4. **Composite Indexes**: Create multi-column indexes for queries filtering on multiple columns
5. **Avoid Over-Indexing**: Each index adds overhead to INSERT/UPDATE operations

## Core Table Indexes

### Users Table

```elixir
# Primary key (auto-indexed)
users(id)

# Unique indexes for authentication
CREATE UNIQUE INDEX users_email_index ON users(email);

# Lookup by role for admin queries
CREATE INDEX users_role_index ON users(role);

# Soft delete queries
CREATE INDEX users_deleted_at_index ON users(deleted_at) WHERE deleted_at IS NULL;
```

**Rationale:**
- `email` is used for login lookups (must be unique)
- `role` is used for filtering users by role (admin, instructor, student)
- Partial index on `deleted_at` optimizes active user queries

### Courses Table

```elixir
# Primary key (auto-indexed)
courses(id)

# Unique course code
CREATE UNIQUE INDEX courses_code_index ON courses(code);

# Filter active courses
CREATE INDEX courses_active_index ON courses(active) WHERE active = true;

# Filter by delivery mode
CREATE INDEX courses_delivery_mode_index ON courses(delivery_mode);

# Composite index for filtering active courses by mode
CREATE INDEX courses_active_delivery_mode_index ON courses(active, delivery_mode) 
  WHERE active = true;
```

**Rationale:**
- `code` must be unique for course identification
- Most queries filter for active courses only
- `delivery_mode` (online/hybrid/in-person) is a common filter
- Composite index optimizes queries like "show all active online courses"

### Enrollments Table

```elixir
# Primary key (auto-indexed)
enrollments(id)

# Foreign key indexes (CRITICAL for JOINs)
CREATE INDEX enrollments_user_id_index ON enrollments(user_id);
CREATE INDEX enrollments_course_id_index ON enrollments(course_id);

# Composite unique constraint (prevent duplicate enrollments)
CREATE UNIQUE INDEX enrollments_user_course_unique_index 
  ON enrollments(user_id, course_id);

# Filter by status
CREATE INDEX enrollments_status_index ON enrollments(status);

# Composite index for "user's active enrollments"
CREATE INDEX enrollments_user_status_index ON enrollments(user_id, status) 
  WHERE status = 'active';

# Composite index for "course enrollments list"
CREATE INDEX enrollments_course_status_index ON enrollments(course_id, status);

# Sort by enrollment date
CREATE INDEX enrollments_enrolled_at_index ON enrollments(enrolled_at);
```

**Rationale:**
- Foreign keys are queried in every JOIN operation
- Unique constraint prevents duplicate enrollments
- Composite indexes optimize common query patterns:
  - "Show me all active enrollments for user X"
  - "Show me all students enrolled in course Y"
- `enrolled_at` supports sorting by enrollment date

### Progress Tracking Table

```elixir
# Primary key (auto-indexed)
progress_records(id)

# Foreign keys
CREATE INDEX progress_user_id_index ON progress_records(user_id);
CREATE INDEX progress_lesson_id_index ON progress_records(lesson_id);
CREATE INDEX progress_course_id_index ON progress_records(course_id);

# Composite unique constraint (one progress record per user per lesson)
CREATE UNIQUE INDEX progress_user_lesson_unique_index 
  ON progress_records(user_id, lesson_id);

# Composite index for "user's course progress"
CREATE INDEX progress_user_course_index ON progress_records(user_id, course_id);

# Filter by completion status
CREATE INDEX progress_completed_index ON progress_records(completed) 
  WHERE completed = true;

# Sort by last accessed
CREATE INDEX progress_last_accessed_index ON progress_records(last_accessed_at);
```

**Rationale:**
- Composite indexes support dashboard queries like "show progress for course X"
- Unique constraint ensures one progress record per user per lesson
- Partial index on `completed` optimizes completion tracking

### Assessment Attempts Table

```elixir
# Primary key (auto-indexed)
assessment_attempts(id)

# Foreign keys
CREATE INDEX attempts_user_id_index ON assessment_attempts(user_id);
CREATE INDEX attempts_assessment_id_index ON assessment_attempts(assessment_id);

# Composite index for "user's attempts on assessment"
CREATE INDEX attempts_user_assessment_index 
  ON assessment_attempts(user_id, assessment_id);

# Sort by attempt date
CREATE INDEX attempts_started_at_index ON assessment_attempts(started_at);
CREATE INDEX attempts_submitted_at_index ON assessment_attempts(submitted_at);

# Filter by status
CREATE INDEX attempts_status_index ON assessment_attempts(status);

# Composite index for "incomplete attempts"
CREATE INDEX attempts_user_status_index ON assessment_attempts(user_id, status) 
  WHERE status IN ('in_progress', 'paused');
```

**Rationale:**
- Supports queries like "show all attempts by user X on assessment Y"
- Timestamps enable sorting by submission date
- Partial index optimizes queries for incomplete attempts

### Course Modules & Lessons

```elixir
# course_modules table
CREATE INDEX modules_course_id_index ON course_modules(course_id);
CREATE INDEX modules_position_index ON course_modules(position);
CREATE INDEX modules_course_position_index ON course_modules(course_id, position);

# module_lessons table
CREATE INDEX lessons_module_id_index ON module_lessons(module_id);
CREATE INDEX lessons_position_index ON module_lessons(position);
CREATE INDEX lessons_module_position_index ON module_lessons(module_id, position);
CREATE INDEX lessons_content_type_index ON module_lessons(content_type);
```

**Rationale:**
- `position` is used for sorting modules/lessons in order
- Composite indexes support "get all lessons for module X in order"
- `content_type` supports filtering by video/quiz/reading/etc.

## Migration Template

Use this template when creating new migrations with indexes:

```elixir
defmodule LmsApi.Repo.Migrations.AddEnrollmentsTable do
  use Ecto.Migration

  def change do
    create table(:enrollments) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :course_id, references(:courses, on_delete: :delete_all), null: false
      add :status, :string, default: "active", null: false
      add :enrolled_at, :utc_datetime, null: false

      timestamps()
    end

    # Foreign key indexes (CRITICAL)
    create index(:enrollments, [:user_id])
    create index(:enrollments, [:course_id])

    # Unique constraint (prevent duplicate enrollments)
    create unique_index(:enrollments, [:user_id, :course_id], 
      name: :enrollments_user_course_unique_index)

    # Composite index for common queries
    create index(:enrollments, [:user_id, :status], 
      where: "status = 'active'",
      name: :enrollments_user_status_index)

    # Sort index
    create index(:enrollments, [:enrolled_at])
  end
end
```

## Index Monitoring

### Check Existing Indexes

```sql
-- List all indexes for a table
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'enrollments';

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'enrollments'
ORDER BY idx_scan DESC;
```

### Identify Missing Indexes

```sql
-- Find tables with sequential scans (potential missing indexes)
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  seq_tup_read / seq_scan AS avg_seq_tuples
FROM pg_stat_user_tables
WHERE seq_scan > 0
  AND schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY seq_scan DESC
LIMIT 20;
```

### Unused Indexes

```sql
-- Find indexes that are never used
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%_pkey'
  AND schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY tablename;
```

## Performance Optimization Tips

1. **Use EXPLAIN ANALYZE**: Always analyze query plans before adding indexes
   ```sql
   EXPLAIN ANALYZE 
   SELECT * FROM enrollments 
   WHERE user_id = 123 AND status = 'active';
   ```

2. **Monitor Index Size**: Large indexes impact write performance
   ```sql
   SELECT 
     tablename,
     indexname,
     pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size
   FROM pg_indexes
   WHERE schemaname = 'public'
   ORDER BY pg_relation_size(indexname::regclass) DESC;
   ```

3. **Partial Indexes**: Use WHERE clauses for filtered queries
   ```elixir
   create index(:users, [:role], where: "role IN ('instructor', 'admin')")
   ```

4. **Composite Index Order**: Most selective column first
   ```elixir
   # Good: user_id is more selective than status
   create index(:enrollments, [:user_id, :status])
   
   # Bad: status has fewer unique values
   create index(:enrollments, [:status, :user_id])
   ```

5. **GIN Indexes for Full-Text Search**: Use for text search columns
   ```elixir
   create index(:courses, [:title], using: :gin, 
     prefix: :trgm)  # Requires pg_trgm extension
   ```

## Index Maintenance

### Regular Maintenance Tasks

```sql
-- Rebuild indexes (removes bloat)
REINDEX TABLE enrollments;

-- Update statistics for query planner
ANALYZE enrollments;

-- Check for bloated indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size,
  round(100 * pg_relation_size(indexname::regclass) / 
    pg_relation_size(tablename::regclass)) AS index_ratio
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexname::regclass) DESC;
```

## References

- [PostgreSQL Indexes Documentation](https://www.postgresql.org/docs/current/indexes.html)
- [Ecto Migration Guide](https://hexdocs.pm/ecto_sql/Ecto.Migration.html)
- [Index Types in PostgreSQL](https://www.postgresql.org/docs/current/indexes-types.html)

## Contributing

When adding new tables or modifying queries:
1. Review this document for existing patterns
2. Use EXPLAIN ANALYZE to identify slow queries
3. Add indexes in migrations, not manually in production
4. Document new indexes here with rationale
