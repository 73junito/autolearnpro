# Question Bank Expansion System

## Overview

Comprehensive system for expanding the LMS question bank from 5,000 to 10,000+ ASE-certified questions across automotive and diesel categories.

## Architecture

### Database Schema

**Tables:**
- `question_banks` - Organized collections by category and difficulty
- `questions` - Master question repository with full metadata
- `assessment_questions` - Links questions to specific assessments

**Question Types Supported:**
1. `multiple_choice` - 4 options, single correct answer
2. `multiple_select` - Multiple correct answers
3. `true_false` - Binary choice
4. `fill_blank` - Fill in missing words
5. `short_answer` - Brief text response
6. `matching` - Match terms with definitions
7. `ordering` - Sequence items correctly
8. `calculation` - Numerical problem solving

### Components

#### 1. QuestionBankManager (Elixir Module)

**Location:** `backend/lms_api/lib/lms_api/question_bank_manager.ex`

**Key Functions:**
- `generate_bulk_questions/4` - Generate questions using AI
- `insert_questions/3` - Store questions in database
- `check_for_duplicates/2` - Similarity detection (Jaccard index)
- `get_question_stats/0` - Analytics on question coverage

**Features:**
- Batch generation (10 questions at a time for quality)
- ASE standard alignment
- Automatic question bank creation
- Duplicate detection using text similarity
- Usage tracking and statistics

#### 2. Expansion Scripts (PowerShell)

**expand_question_bank.ps1** - Main production script
- Generates 10,000 questions across 5 categories
- Configurable distribution percentages
- ASE standards integration
- Duplicate checking
- Progress tracking and error handling

**test_question_generation.ps1** - Testing script
- Generates 10 sample questions
- Validates entire pipeline
- Displays sample output
- Quick verification before full run

## Question Distribution

### By Category (10,000 questions total)

| Category | Count | Percentage | Priority | ASE Standards |
|----------|-------|------------|----------|---------------|
| EV (Electric Vehicles) | 2,500 | 25% | Highest gap | L3.A.1-C.1 |
| Diesel | 2,000 | 20% | High gap | T2.A.1-D.1 |
| Engine Performance | 2,000 | 20% | High gap | A8.A.1-D.1 |
| Electrical | 2,000 | 20% | Medium gap | A6.A.1-D.1 |
| Brakes | 1,500 | 15% | Lower gap | A5.A.1-D.1 |

### By Difficulty (within each category)

| Difficulty | Percentage | Description |
|------------|-----------|-------------|
| Easy | 30% | Basic recall, definitions, simple concepts |
| Medium | 50% | Application, diagnosis, procedures |
| Hard | 20% | Complex scenarios, advanced troubleshooting |

## ASE Standards Coverage

### A5 - Brakes
- A5.A.1 - Brake system diagnosis
- A5.A.2 - Hydraulic system diagnosis
- A5.B.1 - Drum brake service
- A5.C.1 - Disc brake service
- A5.D.1 - Power assist units

### A6 - Electrical/Electronic Systems
- A6.A.1 - General electrical system diagnosis
- A6.A.2 - Battery diagnosis and service
- A6.B.1 - Starting system diagnosis
- A6.C.1 - Charging system diagnosis
- A6.D.1 - Lighting systems diagnosis

### A8 - Engine Performance
- A8.A.1 - General engine diagnosis
- A8.A.2 - Ignition system diagnosis
- A8.B.1 - Fuel, air induction, and exhaust
- A8.C.1 - Emissions control systems
- A8.D.1 - Computerized engine controls

### T2 - Diesel Engines
- T2.A.1 - General diesel engine diagnosis
- T2.A.2 - Cylinder head and valve train
- T2.B.1 - Engine block diagnosis
- T2.C.1 - Lubrication and cooling systems
- T2.D.1 - Fuel system diagnosis

### L3 - Light Duty Hybrid/Electric Vehicles
- L3.A.1 - General hybrid/EV diagnosis
- L3.A.2 - High voltage safety procedures
- L3.A.3 - High voltage battery systems
- L3.B.1 - Electric motor/generator systems
- L3.B.2 - Drive system diagnosis
- L3.C.1 - Auxiliary systems

## Question Structure

### Example: Multiple Choice

```json
{
  "question_type": "multiple_choice",
  "question_text": "A technician is diagnosing a hybrid vehicle with a P0A80 code. What does this code indicate?",
  "question_data": {
    "options": [
      "Replace hybrid battery pack",
      "Battery deterioration",
      "Charge battery immediately",
      "Recalibrate battery management system"
    ],
    "correct": 1
  },
  "difficulty": "medium",
  "topic": "Hybrid battery diagnostics",
  "learning_objective": "Diagnose hybrid battery fault codes",
  "ase_standard": "L3.A.3",
  "points": 1,
  "explanation": "P0A80 indicates battery pack deterioration. The battery management system has detected reduced capacity through cell voltage monitoring...",
  "reference_material": "ASE Study Guide L3, Chapter 4: Battery Systems",
  "correct_feedback": "Correct! P0A80 specifically indicates battery deterioration, not complete failure.",
  "incorrect_feedback": "Review hybrid battery diagnostic codes. P0A80 relates to battery health, not immediate replacement needs."
}
```

### Example: True/False

```json
{
  "question_type": "true_false",
  "question_text": "Diesel engines require higher compression ratios than gasoline engines.",
  "question_data": {
    "correct": true
  },
  "difficulty": "easy",
  "topic": "Diesel engine fundamentals",
  "learning_objective": "Understand diesel vs gasoline compression differences",
  "ase_standard": "T2.A.1",
  "points": 1,
  "explanation": "Diesel engines use compression ignition (14:1-25:1 ratio) vs gasoline engines' spark ignition (8:1-12:1 ratio)...",
  "reference_material": "ASE T2 Study Guide, Section 1.2",
  "correct_feedback": "Correct! Diesel compression ratios are typically 14:1 to 25:1.",
  "incorrect_feedback": "Diesel engines require higher compression to achieve auto-ignition temperatures."
}
```

## Quality Assurance

### Duplicate Detection
- **Algorithm:** Jaccard similarity on word sets
- **Threshold:** 85% similarity triggers duplicate flag
- **Process:** Check against all existing questions before insertion

### Validation Criteria
1. ✓ Question text is clear and unambiguous
2. ✓ Only one correct answer for MC/TF
3. ✓ All options are plausible (no obvious wrong answers)
4. ✓ Explanation provides learning value
5. ✓ ASE standard properly referenced
6. ✓ Difficulty level appropriate

### AI Prompt Engineering
- **Model:** GPT-4o (high quality, technical accuracy)
- **Batch Size:** 10 questions per API call
- **Context:** ASE standards, category, difficulty level
- **Format:** JSON with strict schema
- **Validation:** Automatic field checking and defaults

## Usage

### Quick Test (10 questions)
```powershell
.\scripts\test_question_generation.ps1
```

### Full Expansion (10,000 questions)
```powershell
# Standard run with duplicate checking
.\scripts\expand_question_bank.ps1

# Dry run to preview
.\scripts\expand_question_bank.ps1 -DryRun

# Custom quantity
.\scripts\expand_question_bank.ps1 -TotalQuestions 5000

# Skip duplicate checking (faster)
.\scripts\expand_question_bank.ps1 -CheckDuplicates:$false
```

### Manual Generation (Elixir)
```elixir
alias LmsApi.QuestionBankManager

# Generate 50 hard diesel questions
{:ok, questions} = QuestionBankManager.generate_bulk_questions(
  "diesel",
  "hard",
  50,
  ase_standards: ["T2.A.1", "T2.B.1", "T2.C.1"]
)

# Check for duplicates
{unique, duplicates} = QuestionBankManager.check_for_duplicates(questions)
IO.puts("Unique: #{length(unique)}, Duplicates: #{length(duplicates)}")

# Insert into database
{:ok, count} = QuestionBankManager.insert_questions(unique, "diesel", "hard")
IO.puts("Inserted: #{count} questions")

# View statistics
QuestionBankManager.get_question_stats()
```

## Database Queries

### Check Total Questions
```sql
SELECT COUNT(*) FROM questions WHERE active = true;
```

### Questions by Category and Difficulty
```sql
SELECT 
  qb.category,
  q.difficulty,
  COUNT(*) as count
FROM questions q
LEFT JOIN question_banks qb ON q.question_bank_id = qb.id
WHERE q.active = true
GROUP BY qb.category, q.difficulty
ORDER BY qb.category, q.difficulty;
```

### Top Used Questions
```sql
SELECT 
  question_text,
  times_used,
  ROUND(times_correct::NUMERIC / NULLIF(times_used, 0) * 100, 1) as success_rate
FROM questions
WHERE times_used > 0
ORDER BY times_used DESC
LIMIT 10;
```

### Questions Needing Review
```sql
SELECT 
  q.id,
  q.question_text,
  q.difficulty,
  ROUND(q.times_correct::NUMERIC / NULLIF(q.times_used, 0) * 100, 1) as success_rate
FROM questions q
WHERE q.times_used >= 10
  AND (q.times_correct::FLOAT / NULLIF(q.times_used, 0)) < 0.3
ORDER BY q.times_used DESC;
```

## Monitoring

### Success Metrics
- **Target:** 10,000 questions
- **Duplicate Rate:** <10% (currently 7.5% expected)
- **Category Coverage:** All 5 categories with specified distribution
- **ASE Alignment:** 100% of questions reference standards
- **Quality Score:** >4.0/5.0 from instructor reviews

### Performance
- **Generation Time:** ~2-3 seconds per question
- **Total Time:** ~6-8 hours for 10,000 questions
- **API Costs:** $15-25 for full expansion (GPT-4o)
- **Database Size:** ~50MB for 10,000 questions

## Maintenance

### Regular Tasks
1. **Weekly:** Review questions with <30% success rate
2. **Monthly:** Analyze category balance and difficulty distribution
3. **Quarterly:** Update ASE standards references
4. **Annually:** Refresh outdated content (technology changes)

### Expansion Strategy
- **Phase 1:** 10,000 questions (current)
- **Phase 2:** Add 2,500 specialty questions (transmissions, HVAC)
- **Phase 3:** Expand to 15,000 with multimedia integration
- **Phase 4:** Adaptive testing with difficulty adjustment

## Troubleshooting

### Issue: Pod not found
```powershell
kubectl get pods -n autolearnpro -l app=lms-api
# Verify pod is running, update label selector if needed
```

### Issue: JSON parse error
- Check AI response format
- Increase prompt specificity
- Review recent model changes

### Issue: High duplicate rate
- Lower similarity threshold
- Review question generation prompts
- Check for template reuse

### Issue: Database connection failed
```powershell
# Test database connectivity
kubectl exec -n autolearnpro <pod-name> -- /app/bin/lms_api eval "LmsApi.Repo.query!(\"SELECT 1\", [])"
```

## Future Enhancements

1. **Question Review Interface** - Instructor portal for quality review
2. **Student Feedback Loop** - Flag confusing/incorrect questions
3. **Adaptive Generation** - AI learns from usage patterns
4. **Multimedia Questions** - Images, videos, interactive diagrams
5. **Question Versioning** - Track edits and improvements
6. **Collaborative Authoring** - Multiple instructors contribute
7. **Export/Import** - Share question banks between institutions

## References

- ASE Education Foundation: https://www.aseeducationfoundation.org/
- ASE Test Specifications: https://www.ase.com/Tests.aspx
- NATEF Standards: https://www.natef.org/
- Automotive Service Excellence Study Guides (A5, A6, A8, T2, L3)
