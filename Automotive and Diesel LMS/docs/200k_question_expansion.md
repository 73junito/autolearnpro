# 200K Question Bank Expansion Guide

## Overview

Massive expansion to **200,000 ASE-certified questions** using direct OpenAI API integration and PostgreSQL insertion. No code deployment required - runs as standalone PowerShell script.

## Distribution

### Total: 200,000 Questions

**By Category:**
- EV (Electric Vehicles): 50,000 (25%)
- Diesel: 40,000 (20%)
- Engine Performance: 40,000 (20%)
- Electrical: 40,000 (20%)
- Brakes: 30,000 (15%)

**By Question Type:**
- Multiple Choice: 80,000 (40%)
- True/False: 70,000 (35%)
- Fill in the Blank: 50,000 (25%)

**By Difficulty:**
- Easy: 60,000 (30%)
- Medium: 100,000 (50%)
- Hard: 40,000 (20%)

## Scripts

### Main Script: `generate_200k_questions.ps1`

**Features:**
- Direct OpenAI API calls (GPT-4o)
- Automatic progress tracking and resume capability
- Direct SQL insertion to PostgreSQL
- Rate limiting and error recovery
- Detailed logging
- Real-time progress updates

**Parameters:**
```powershell
-TotalQuestions 200000    # Target count (default: 200000)
-BatchSize 50             # Questions per API call (default: 50)
-MaxConcurrent 5          # Parallel generation (default: 5)
-Resume                   # Resume from .question_progress.json
-DryRun                   # Test without inserting
-OpenAIKey                # API key (or use env var)
```

### Test Script: `test_200k_generation.ps1`

Generates 30 questions (10 of each type) to verify:
- OpenAI API connectivity
- Database connectivity
- Question generation quality
- SQL insertion success

## Setup

### 1. Set OpenAI API Key

```powershell
# Option A: Environment variable (recommended)
$env:OPENAI_API_KEY = "sk-..."

# Option B: Pass as parameter
.\scripts\generate_200k_questions.ps1 -OpenAIKey "sk-..."
```

### 2. Verify Prerequisites

```powershell
# Check kubectl access
kubectl get pods -n autolearnpro

# Check database
$pod = kubectl get pod -n autolearnpro -l app=postgres -o jsonpath='{.items[0].metadata.name}'
kubectl exec -n autolearnpro $pod -- psql -U postgres -d lms_api_prod -c "SELECT COUNT(*) FROM questions;"

# Check OpenAI credits
# Visit: https://platform.openai.com/account/usage
```

## Execution

### Quick Test (30 questions)

```powershell
.\scripts\test_200k_generation.ps1
```

**Expected output:**
- API connection verified
- Database connection verified
- 30 questions generated and inserted
- Log file created with details

### Full Generation (200K questions)

```powershell
# Standard run
.\scripts\generate_200k_questions.ps1

# Custom configuration
.\scripts\generate_200k_questions.ps1 -TotalQuestions 100000 -BatchSize 30

# Resume interrupted run
.\scripts\generate_200k_questions.ps1 -Resume

# Dry run (no database writes)
.\scripts\generate_200k_questions.ps1 -DryRun -TotalQuestions 1000
```

## Progress Tracking

### Progress File: `.question_progress.json`

Automatically created and updated every batch:

```json
{
  "total_generated": 125000,
  "by_category": {
    "ev": 31250,
    "diesel": 25000
  },
  "by_type": {
    "multiple_choice": 50000,
    "true_false": 43750
  },
  "by_difficulty": {
    "easy": 37500,
    "medium": 62500
  },
  "failed_batches": [],
  "start_time": "2025-12-16T10:30:00Z"
}
```

### Log File

Named: `question_generation_YYYYMMDD_HHMMSS.log`

Contains:
- Timestamp for each operation
- API calls and responses
- SQL insertion results
- Progress milestones
- Error details

### Real-time Monitoring

Script outputs progress every 10 batches:
```
Progress Update:
  Total: 5,230/200,000 (2.6%)
  Rate: 87.2 questions/minute
  ETA: 2,235 minutes (37.2 hours)
  Elapsed: 60.0 minutes
```

## Performance

### Timing Estimates

| Metric | Value |
|--------|-------|
| Questions per API call | 50 |
| API response time | 3-5 seconds |
| SQL insert per question | 0.1 seconds |
| Total batches | 4,000 |
| Rate | 60-80 questions/minute |
| **Total time** | **40-60 hours** |

### Cost Estimates (GPT-4o)

| Component | Tokens | Cost |
|-----------|--------|------|
| Input (prompt) | ~800 per batch | $0.0075 |
| Output (response) | ~3,000 per batch | $0.045 |
| **Per batch** | | **$0.0525** |
| **Total (4,000 batches)** | | **$210** |
| **With retries/overhead** | | **$300-500** |

## Quality Assurance

### AI Prompt Engineering

Each question type has specific instructions:

**Multiple Choice:**
- 4 options, single correct answer
- Plausible distractors
- No "all/none of the above"
- Industry-standard terminology

**True/False:**
- Clear, unambiguous statements
- Definitely true or false
- No edge cases or tricks
- Technical accuracy verified

**Fill in the Blank:**
- 1-3 blanks per question
- Specific technical terms
- Accept spelling variations
- Case-insensitive by default

### Validation

Automatic validation for each question:
- ✓ Question text present and meaningful
- ✓ Question data matches type format
- ✓ Difficulty level specified
- ✓ Learning objective defined
- ✓ Explanation provides value
- ✓ ASE standard referenced (where applicable)

### ASE Standards Mapping

| Category | Standards | Count |
|----------|-----------|-------|
| EV | L3.A.1-C.1 | 6 standards |
| Diesel | T2.A.1-E.1 | 6 standards |
| Engine | A8.A.1-E.1 | 6 standards |
| Electrical | A6.A.1-E.1 | 6 standards |
| Brakes | A5.A.1-E.1 | 6 standards |

## Database Schema

### Questions Table Structure

```sql
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    question_bank_id INTEGER,
    question_type VARCHAR(50),
    question_text TEXT,
    difficulty VARCHAR(50),
    topic VARCHAR(200),
    learning_objective VARCHAR(500),
    ase_standard VARCHAR(100),
    points INTEGER DEFAULT 1,
    question_data JSONB,
    explanation TEXT,
    reference_material TEXT,
    correct_feedback TEXT,
    incorrect_feedback TEXT,
    times_used INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    times_incorrect INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    inserted_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Question Data Formats

**Multiple Choice:**
```json
{
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct": 1
}
```

**True/False:**
```json
{
  "correct": true
}
```

**Fill in the Blank:**
```json
{
  "blanks": ["answer1", "answer2"],
  "case_sensitive": false,
  "acceptable_variations": ["alt1", "alt2"]
}
```

## Monitoring

### Check Progress

```powershell
# View progress file
Get-Content .\scripts\.question_progress.json | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Check database count
$pod = kubectl get pod -n autolearnpro -l app=postgres -o jsonpath='{.items[0].metadata.name}'
kubectl exec -n autolearnpro $pod -- psql -U postgres -d lms_api_prod -t -c "SELECT COUNT(*) FROM questions WHERE active = true;"

# View latest log
Get-Content (Get-ChildItem .\scripts\question_generation_*.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName -Tail 50
```

### Statistics Query

```sql
SELECT 
    qb.category,
    q.question_type,
    q.difficulty,
    COUNT(*) as count
FROM questions q
LEFT JOIN question_banks qb ON q.question_bank_id = qb.id
WHERE q.active = true
GROUP BY qb.category, q.question_type, q.difficulty
ORDER BY qb.category, q.question_type, q.difficulty;
```

## Error Recovery

### Resume Interrupted Run

If script crashes or is stopped:

```powershell
# Resume from last checkpoint
.\scripts\generate_200k_questions.ps1 -Resume
```

Progress file tracks:
- Completed batches
- Generated counts by category/type/difficulty
- Failed batches for retry

### Retry Failed Batches

```powershell
# Check failed batches
$progress = Get-Content .\scripts\.question_progress.json | ConvertFrom-Json
$progress.failed_batches | ConvertTo-Json -Depth 10
```

Failed batches are logged but generation continues. Review and manually regenerate if needed.

## Optimization

### Speed Up Generation

```powershell
# Larger batches (more tokens, fewer API calls)
.\scripts\generate_200k_questions.ps1 -BatchSize 100

# Reduce delay between calls (careful with rate limits)
# Edit script: Start-Sleep -Milliseconds 200
```

### Reduce Costs

```powershell
# Use smaller batches for better quality control
.\scripts\generate_200k_questions.ps1 -BatchSize 25

# Switch to GPT-4o-mini (cheaper, slightly lower quality)
# Edit script: $Model = "gpt-4o-mini"
```

## Validation Queries

### Quality Checks

```sql
-- Questions with short text (potential issues)
SELECT id, question_text, LENGTH(question_text) as len
FROM questions
WHERE LENGTH(question_text) < 20
ORDER BY len;

-- Questions missing explanations
SELECT COUNT(*) 
FROM questions 
WHERE explanation IS NULL OR LENGTH(explanation) < 10;

-- Distribution by category and type
SELECT 
    COALESCE(qb.category, 'uncategorized') as category,
    q.question_type,
    COUNT(*) as count,
    ROUND(AVG(LENGTH(q.question_text))) as avg_length
FROM questions q
LEFT JOIN question_banks qb ON q.question_bank_id = qb.id
WHERE q.active = true
GROUP BY qb.category, q.question_type
ORDER BY category, question_type;

-- ASE standard coverage
SELECT 
    ase_standard,
    COUNT(*) as count
FROM questions
WHERE ase_standard IS NOT NULL
GROUP BY ase_standard
ORDER BY count DESC;
```

## Troubleshooting

### Issue: OpenAI Rate Limit

**Error:** `429 Too Many Requests`

**Solution:**
```powershell
# Increase delay between calls
# Edit script line: Start-Sleep -Milliseconds 1000

# Reduce batch size
.\scripts\generate_200k_questions.ps1 -BatchSize 25
```

### Issue: Database Connection Lost

**Error:** `unable to connect to postgres`

**Solution:**
```powershell
# Check pod status
kubectl get pods -n autolearnpro -l app=postgres

# Restart if needed
kubectl rollout restart deployment postgres -n autolearnpro

# Resume generation
.\scripts\generate_200k_questions.ps1 -Resume
```

### Issue: JSON Parse Errors

**Error:** `ConvertFrom-Json: Invalid JSON`

**Solution:**
- Check log file for malformed responses
- GPT-4o occasionally returns markdown instead of pure JSON
- Script attempts to strip ```json blocks automatically
- Increase temperature if responses are too repetitive
- Failed batches are logged for manual review

### Issue: Duplicate Questions

**Prevention:**
- Vary prompts with topic rotation
- Temperature set to 0.8 for diversity
- Track topics within categories

**Check:**
```sql
SELECT 
    question_text,
    COUNT(*) as duplicates
FROM questions
GROUP BY question_text
HAVING COUNT(*) > 1
ORDER BY duplicates DESC;
```

## Post-Generation

### Verification

```powershell
# Total count
$pod = kubectl get pod -n autolearnpro -l app=postgres -o jsonpath='{.items[0].metadata.name}'
kubectl exec -n autolearnpro $pod -- psql -U postgres -d lms_api_prod -t -c "SELECT COUNT(*) FROM questions WHERE active = true;"

# Distribution verification
kubectl exec -n autolearnpro $pod -- psql -U postgres -d lms_api_prod -c "
SELECT 
    qb.category,
    COUNT(*) as count,
    ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM questions WHERE active = true) * 100, 1) as percentage
FROM questions q
LEFT JOIN question_banks qb ON q.question_bank_id = qb.id
WHERE q.active = true
GROUP BY qb.category
ORDER BY count DESC;
"
```

### Backup

```powershell
# Export questions to JSON backup
kubectl exec -n autolearnpro $pod -- psql -U postgres -d lms_api_prod -c "
COPY (
    SELECT row_to_json(q) 
    FROM questions q 
    WHERE active = true
) TO '/tmp/questions_backup.json';
"

# Copy backup locally
kubectl cp autolearnpro/$pod:/tmp/questions_backup.json ./backups/questions_$(Get-Date -Format 'yyyyMMdd').json
```

## Next Steps

After 200K generation complete:

1. **Quality Review** - Sample 100 questions per category for accuracy
2. **Link to Assessments** - Create assessments using new question bank
3. **Student Testing** - Deploy to pilot group for feedback
4. **Analytics** - Track usage, difficulty, success rates
5. **Continuous Improvement** - Update questions based on performance data

## Maintenance

### Regular Updates

- **Quarterly:** Review ASE standard changes
- **Monthly:** Analyze question performance metrics
- **Weekly:** Check for outdated technology references
- **Daily:** Monitor error logs during active generation

### Performance Tuning

```sql
-- Questions needing review (low success rate)
SELECT 
    id,
    question_text,
    times_used,
    ROUND(times_correct::NUMERIC / NULLIF(times_used, 0) * 100, 1) as success_rate
FROM questions
WHERE times_used >= 20
  AND times_correct::NUMERIC / NULLIF(times_used, 0) < 0.3
ORDER BY times_used DESC;

-- Update difficulty if too easy/hard
UPDATE questions
SET difficulty = 'easy'
WHERE times_used >= 20
  AND times_correct::NUMERIC / times_used > 0.9
  AND difficulty = 'medium';
```

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Total questions | 200,000 | Database count |
| Category distribution | ±2% of target | SQL query |
| Type distribution | ±2% of target | SQL query |
| Questions with ASE refs | >80% | SQL query |
| Avg explanation length | >100 chars | SQL query |
| Failed batches | <1% | Progress file |
| Generation time | <60 hours | Log file |
| Total cost | <$500 | OpenAI dashboard |

## Support

For issues or questions:
1. Check log file: `.\scripts\question_generation_*.log`
2. Review progress: `.\scripts\.question_progress.json`
3. Test connectivity: `.\scripts\test_200k_generation.ps1`
4. Check OpenAI status: https://status.openai.com/
5. Verify Kubernetes: `kubectl get all -n autolearnpro`
