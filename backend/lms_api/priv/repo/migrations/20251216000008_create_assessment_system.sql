-- Migration: Create comprehensive assessment system
-- Tables for practice questions, quizzes, exams, and final exams

-- ============================================================================
-- ASSESSMENT BANKS: Store questions organized by topic/difficulty
-- ============================================================================

CREATE TABLE question_banks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- 'automotive', 'diesel', 'ev', 'safety', etc.
    difficulty VARCHAR(50), -- 'beginner', 'intermediate', 'advanced'
    active BOOLEAN DEFAULT true,
    inserted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_question_banks_category ON question_banks(category);
CREATE INDEX idx_question_banks_difficulty ON question_banks(difficulty);

COMMENT ON TABLE question_banks IS 'Organized collections of assessment questions by topic and difficulty';

-- ============================================================================
-- QUESTIONS: Master table for all question types
-- ============================================================================

CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    question_bank_id INTEGER REFERENCES question_banks(id) ON DELETE SET NULL,
    module_id INTEGER REFERENCES course_modules(id) ON DELETE CASCADE,
    lesson_id INTEGER REFERENCES module_lessons(id) ON DELETE CASCADE,
    
    -- Question content
    question_type VARCHAR(50) NOT NULL, -- 'multiple_choice', 'multiple_select', 'true_false', 'fill_blank', 'short_answer', 'matching', 'ordering', 'calculation'
    question_text TEXT NOT NULL,
    question_image_url VARCHAR(500),
    question_diagram JSONB, -- For technical diagrams
    
    -- Metadata
    difficulty VARCHAR(50), -- 'easy', 'medium', 'hard'
    topic VARCHAR(200), -- Specific topic/skill being tested
    learning_objective VARCHAR(500), -- What this question assesses
    ase_standard VARCHAR(100), -- ASE task reference (e.g., 'A5.A.1')
    
    -- Points and timing
    points INTEGER DEFAULT 1,
    time_limit_seconds INTEGER, -- Optional time limit per question
    
    -- Question-specific data (stores answer options, correct answers, etc.)
    question_data JSONB NOT NULL,
    
    -- Feedback and explanations
    correct_feedback TEXT, -- Shown when answer is correct
    incorrect_feedback TEXT, -- Shown when answer is incorrect
    explanation TEXT, -- Detailed explanation of correct answer
    hint TEXT, -- Optional hint for students
    reference_material TEXT, -- Where to find more information
    
    -- Usage tracking
    times_used INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    times_incorrect INTEGER DEFAULT 0,
    average_time_seconds INTEGER,
    
    active BOOLEAN DEFAULT true,
    inserted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_type ON questions(question_type);
CREATE INDEX idx_questions_difficulty ON questions(difficulty);
CREATE INDEX idx_questions_module ON questions(module_id);
CREATE INDEX idx_questions_lesson ON questions(lesson_id);
CREATE INDEX idx_questions_bank ON questions(question_bank_id);
CREATE INDEX idx_questions_ase ON questions(ase_standard);
CREATE INDEX idx_questions_topic ON questions(topic);
CREATE INDEX idx_questions_data ON questions USING GIN(question_data);

COMMENT ON TABLE questions IS 'Master table for all assessment questions with support for multiple question types';
COMMENT ON COLUMN questions.question_data IS 'JSON structure varies by question_type: 
  multiple_choice: {"options": ["A", "B", "C", "D"], "correct": 0}
  multiple_select: {"options": ["A", "B", "C", "D"], "correct": [0, 2]}
  true_false: {"correct": true}
  fill_blank: {"blanks": ["answer1", "answer2"], "case_sensitive": false}
  short_answer: {"acceptable_answers": ["answer1", "answer2"], "max_length": 200}
  matching: {"pairs": [{"left": "term1", "right": "def1"}]}
  ordering: {"items": ["step1", "step2"], "correct_order": [0, 1, 2]}
  calculation: {"correct_answer": 42.5, "unit": "psi", "tolerance": 0.5}';

-- ============================================================================
-- ASSESSMENTS: Exams, quizzes, practice tests
-- ============================================================================

CREATE TABLE assessments (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    module_id INTEGER REFERENCES course_modules(id) ON DELETE CASCADE,
    
    -- Assessment details
    title VARCHAR(300) NOT NULL,
    description TEXT,
    assessment_type VARCHAR(50) NOT NULL, -- 'practice', 'quiz', 'midterm', 'final', 'certification'
    
    -- Configuration
    total_points INTEGER DEFAULT 100,
    passing_score INTEGER DEFAULT 70, -- Percentage
    time_limit_minutes INTEGER, -- NULL = untimed
    
    -- Attempts and availability
    max_attempts INTEGER, -- NULL = unlimited
    available_from TIMESTAMP,
    available_until TIMESTAMP,
    
    -- Display settings
    shuffle_questions BOOLEAN DEFAULT false,
    shuffle_answers BOOLEAN DEFAULT true,
    show_feedback_immediately BOOLEAN DEFAULT true, -- Show correct/incorrect after each question
    show_correct_answers BOOLEAN DEFAULT true, -- Show correct answers at end
    allow_review BOOLEAN DEFAULT true, -- Allow reviewing after submission
    
    -- Proctoring and security
    require_proctor BOOLEAN DEFAULT false,
    lock_browser BOOLEAN DEFAULT false, -- Full screen, no navigation away
    one_question_at_time BOOLEAN DEFAULT false,
    prevent_backtrack BOOLEAN DEFAULT false,
    
    -- Weighting in course grade
    weight_in_course DECIMAL(5,2), -- Percentage of final grade
    
    active BOOLEAN DEFAULT true,
    inserted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assessments_course ON assessments(course_id);
CREATE INDEX idx_assessments_module ON assessments(module_id);
CREATE INDEX idx_assessments_type ON assessments(assessment_type);
CREATE INDEX idx_assessments_available ON assessments(available_from, available_until);

COMMENT ON TABLE assessments IS 'Exams, quizzes, and practice tests with configuration and security settings';

-- ============================================================================
-- ASSESSMENT QUESTIONS: Links questions to specific assessments
-- ============================================================================

CREATE TABLE assessment_questions (
    id SERIAL PRIMARY KEY,
    assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    
    sequence_number INTEGER NOT NULL, -- Order within assessment
    points_override INTEGER, -- Override default question points
    required BOOLEAN DEFAULT true, -- Must be answered to submit
    
    inserted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    UNIQUE(assessment_id, question_id),
    UNIQUE(assessment_id, sequence_number)
);

CREATE INDEX idx_assessment_questions_assessment ON assessment_questions(assessment_id);
CREATE INDEX idx_assessment_questions_question ON assessment_questions(question_id);
CREATE INDEX idx_assessment_questions_sequence ON assessment_questions(assessment_id, sequence_number);

COMMENT ON TABLE assessment_questions IS 'Links questions to assessments with ordering and point overrides';

-- ============================================================================
-- STUDENT ATTEMPTS: Track individual test-taking sessions
-- ============================================================================

CREATE TABLE assessment_attempts (
    id SERIAL PRIMARY KEY,
    assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    
    -- Attempt details
    attempt_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'submitted', 'graded', 'abandoned'
    
    -- Timing
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMP,
    time_spent_seconds INTEGER,
    
    -- Scoring
    total_points_earned DECIMAL(10,2),
    total_points_possible INTEGER,
    percentage_score DECIMAL(5,2),
    passed BOOLEAN,
    
    -- Grading
    auto_graded BOOLEAN DEFAULT false,
    manually_graded BOOLEAN DEFAULT false,
    graded_by INTEGER REFERENCES instructors(id),
    graded_at TIMESTAMP,
    
    -- Feedback
    instructor_feedback TEXT,
    
    -- Security and proctoring
    ip_address INET,
    user_agent TEXT,
    proctor_id INTEGER REFERENCES instructors(id),
    proctor_notes TEXT,
    flagged_for_review BOOLEAN DEFAULT false,
    flag_reason TEXT,
    
    inserted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    UNIQUE(assessment_id, student_id, attempt_number)
);

CREATE INDEX idx_attempts_assessment ON assessment_attempts(assessment_id);
CREATE INDEX idx_attempts_student ON assessment_attempts(student_id);
CREATE INDEX idx_attempts_status ON assessment_attempts(status);
CREATE INDEX idx_attempts_graded ON assessment_attempts(manually_graded, graded_at);
CREATE INDEX idx_attempts_flagged ON assessment_attempts(flagged_for_review);

COMMENT ON TABLE assessment_attempts IS 'Individual student attempts at assessments with timing and scoring';

-- ============================================================================
-- STUDENT ANSWERS: Individual responses to questions
-- ============================================================================

CREATE TABLE student_answers (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    
    -- Answer content
    answer_data JSONB NOT NULL, -- Format varies by question type
    answer_text TEXT, -- For text-based answers (fill-blank, short answer)
    
    -- Scoring
    is_correct BOOLEAN,
    points_earned DECIMAL(10,2),
    points_possible INTEGER,
    
    -- Timing
    time_spent_seconds INTEGER,
    answered_at TIMESTAMP,
    
    -- Manual grading
    manually_graded BOOLEAN DEFAULT false,
    grader_id INTEGER REFERENCES instructors(id),
    grading_notes TEXT,
    
    inserted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    UNIQUE(attempt_id, question_id)
);

CREATE INDEX idx_student_answers_attempt ON student_answers(attempt_id);
CREATE INDEX idx_student_answers_question ON student_answers(question_id);
CREATE INDEX idx_student_answers_correct ON student_answers(is_correct);
CREATE INDEX idx_student_answers_manual ON student_answers(manually_graded);
CREATE INDEX idx_student_answers_data ON student_answers USING GIN(answer_data);

COMMENT ON TABLE student_answers IS 'Individual student responses to assessment questions';
COMMENT ON COLUMN student_answers.answer_data IS 'JSON structure varies by question_type:
  multiple_choice: {"selected": 0}
  multiple_select: {"selected": [0, 2]}
  true_false: {"selected": true}
  fill_blank: {"answers": ["answer1", "answer2"]}
  short_answer: {"answer": "student response"}
  matching: {"pairs": [[0,1], [1,0]]}
  ordering: {"order": [2, 0, 1]}
  calculation: {"answer": 42.3, "work_shown": "calculation steps"}';

-- ============================================================================
-- QUESTION TAGS: For categorization and filtering
-- ============================================================================

CREATE TABLE question_tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50), -- 'skill', 'topic', 'system', 'tool'
    inserted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_question_tags_category ON question_tags(category);

CREATE TABLE question_tag_mappings (
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES question_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (question_id, tag_id)
);

CREATE INDEX idx_question_tag_mappings_question ON question_tag_mappings(question_id);
CREATE INDEX idx_question_tag_mappings_tag ON question_tag_mappings(tag_id);

COMMENT ON TABLE question_tags IS 'Tags for organizing and filtering questions';

-- ============================================================================
-- PERFORMANCE ANALYTICS: Question and assessment statistics
-- ============================================================================

CREATE TABLE assessment_analytics (
    id SERIAL PRIMARY KEY,
    assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    
    -- Overall statistics
    total_attempts INTEGER DEFAULT 0,
    completed_attempts INTEGER DEFAULT 0,
    average_score DECIMAL(5,2),
    median_score DECIMAL(5,2),
    highest_score DECIMAL(5,2),
    lowest_score DECIMAL(5,2),
    pass_rate DECIMAL(5,2),
    
    -- Timing statistics
    average_time_minutes INTEGER,
    median_time_minutes INTEGER,
    
    -- Question performance
    easiest_question_id INTEGER REFERENCES questions(id),
    hardest_question_id INTEGER REFERENCES questions(id),
    
    last_calculated_at TIMESTAMP,
    inserted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    UNIQUE(assessment_id)
);

CREATE INDEX idx_assessment_analytics_assessment ON assessment_analytics(assessment_id);

COMMENT ON TABLE assessment_analytics IS 'Aggregated performance statistics for assessments';

-- ============================================================================
-- SAMPLE DATA: Question type examples
-- ============================================================================

COMMENT ON DATABASE lms_api_prod IS 'Assessment System Question Type Examples:

1. MULTIPLE CHOICE:
{
  "options": ["Hydraulic pressure", "Vacuum", "Mechanical linkage", "Electronic signal"],
  "correct": 0
}

2. MULTIPLE SELECT:
{
  "options": ["Wear safety glasses", "Disconnect battery", "Release system pressure", "Wear gloves"],
  "correct": [0, 1, 2, 3]
}

3. TRUE/FALSE:
{
  "statement": "Brake fluid is hygroscopic",
  "correct": true
}

4. FILL IN THE BLANK:
{
  "text": "The master cylinder converts ___ force into ___ pressure.",
  "blanks": ["pedal", "hydraulic"],
  "case_sensitive": false,
  "acceptable_variants": [["foot", "pedal"], ["hydraulic", "fluid"]]
}

5. SHORT ANSWER:
{
  "question": "Explain why brake fluid must be changed regularly",
  "acceptable_answers": ["absorbs moisture", "hygroscopic", "water contamination"],
  "max_length": 500,
  "min_length": 50
}

6. MATCHING:
{
  "left_items": ["Master Cylinder", "Caliper", "Rotor", "Brake Pad"],
  "right_items": ["Creates friction", "Converts pressure", "Rotates with wheel", "Applies pressure"],
  "correct_pairs": [[0,1], [1,3], [2,2], [3,0]]
}

7. ORDERING/SEQUENCING:
{
  "items": [
    "Release parking brake",
    "Remove wheel",
    "Remove caliper",
    "Remove brake pads",
    "Inspect rotor"
  ],
  "correct_order": [0, 1, 2, 3, 4]
}

8. CALCULATION:
{
  "problem": "A master cylinder has a 1-inch diameter piston. If 100 lbs force is applied, calculate the pressure in PSI.",
  "correct_answer": 127.32,
  "unit": "psi",
  "tolerance": 2.0,
  "show_work_required": true
}
';

-- ============================================================================
-- VIEWS: Convenient data access
-- ============================================================================

-- View: Student performance summary
CREATE VIEW student_assessment_summary AS
SELECT 
    s.id as student_id,
    s.first_name,
    s.last_name,
    a.id as assessment_id,
    a.title as assessment_title,
    a.assessment_type,
    aa.attempt_number,
    aa.status,
    aa.percentage_score,
    aa.passed,
    aa.started_at,
    aa.submitted_at,
    aa.time_spent_seconds / 60 as time_spent_minutes
FROM students s
JOIN assessment_attempts aa ON s.id = aa.student_id
JOIN assessments a ON aa.assessment_id = a.id;

-- View: Question difficulty analysis
CREATE VIEW question_difficulty_analysis AS
SELECT 
    q.id,
    q.question_text,
    q.question_type,
    q.difficulty,
    q.times_used,
    q.times_correct,
    q.times_incorrect,
    CASE 
        WHEN q.times_used > 0 THEN ROUND((q.times_correct::DECIMAL / q.times_used * 100), 2)
        ELSE NULL
    END as success_rate,
    q.average_time_seconds
FROM questions q
WHERE q.active = true AND q.times_used > 0;

-- View: Assessment completion tracking
CREATE VIEW assessment_completion_tracking AS
SELECT 
    c.code as course_code,
    c.title as course_title,
    a.title as assessment_title,
    a.assessment_type,
    COUNT(DISTINCT aa.student_id) as students_attempted,
    COUNT(DISTINCT CASE WHEN aa.status = 'submitted' THEN aa.student_id END) as students_completed,
    COUNT(DISTINCT CASE WHEN aa.passed = true THEN aa.student_id END) as students_passed,
    ROUND(AVG(aa.percentage_score), 2) as average_score
FROM courses c
JOIN assessments a ON c.id = a.course_id
LEFT JOIN assessment_attempts aa ON a.id = aa.assessment_id
GROUP BY c.id, c.code, c.title, a.id, a.title, a.assessment_type;

COMMENT ON VIEW student_assessment_summary IS 'Student performance across all assessments';
COMMENT ON VIEW question_difficulty_analysis IS 'Question statistics and success rates';
COMMENT ON VIEW assessment_completion_tracking IS 'Assessment completion and pass rates by course';

-- ============================================================================
-- FUNCTIONS: Automated calculations
-- ============================================================================

-- Function to auto-grade multiple choice questions
CREATE OR REPLACE FUNCTION auto_grade_answer(
    p_question_id INTEGER,
    p_answer_data JSONB
) RETURNS TABLE(is_correct BOOLEAN, points_earned DECIMAL) AS $$
DECLARE
    v_question RECORD;
    v_is_correct BOOLEAN;
    v_points DECIMAL;
BEGIN
    SELECT * INTO v_question FROM questions WHERE id = p_question_id;
    
    CASE v_question.question_type
        WHEN 'multiple_choice' THEN
            v_is_correct := (v_question.question_data->>'correct')::INTEGER = (p_answer_data->>'selected')::INTEGER;
        WHEN 'true_false' THEN
            v_is_correct := (v_question.question_data->>'correct')::BOOLEAN = (p_answer_data->>'selected')::BOOLEAN;
        WHEN 'multiple_select' THEN
            v_is_correct := v_question.question_data->'correct' = p_answer_data->'selected';
        ELSE
            v_is_correct := NULL; -- Requires manual grading
    END CASE;
    
    IF v_is_correct THEN
        v_points := v_question.points;
    ELSE
        v_points := 0;
    END IF;
    
    RETURN QUERY SELECT v_is_correct, v_points;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate assessment score
CREATE OR REPLACE FUNCTION calculate_assessment_score(p_attempt_id INTEGER) 
RETURNS TABLE(total_earned DECIMAL, total_possible INTEGER, percentage DECIMAL, passed BOOLEAN) AS $$
DECLARE
    v_assessment RECORD;
    v_total_earned DECIMAL;
    v_total_possible INTEGER;
    v_percentage DECIMAL;
    v_passed BOOLEAN;
BEGIN
    -- Get assessment details
    SELECT a.* INTO v_assessment
    FROM assessment_attempts aa
    JOIN assessments a ON aa.assessment_id = a.id
    WHERE aa.id = p_attempt_id;
    
    -- Calculate totals
    SELECT 
        COALESCE(SUM(sa.points_earned), 0),
        COALESCE(SUM(sa.points_possible), 0)
    INTO v_total_earned, v_total_possible
    FROM student_answers sa
    WHERE sa.attempt_id = p_attempt_id;
    
    -- Calculate percentage
    IF v_total_possible > 0 THEN
        v_percentage := ROUND((v_total_earned / v_total_possible * 100), 2);
    ELSE
        v_percentage := 0;
    END IF;
    
    -- Determine pass/fail
    v_passed := v_percentage >= v_assessment.passing_score;
    
    RETURN QUERY SELECT v_total_earned, v_total_possible, v_percentage, v_passed;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_grade_answer IS 'Automatically grade objective question types';
COMMENT ON FUNCTION calculate_assessment_score IS 'Calculate total score and pass/fail for an attempt';

-- ============================================================================
-- TRIGGERS: Automated updates
-- ============================================================================

-- Update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_question_banks_updated_at BEFORE UPDATE ON question_banks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessment_attempts_updated_at BEFORE UPDATE ON assessment_attempts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_answers_updated_at BEFORE UPDATE ON student_answers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update question usage statistics
CREATE OR REPLACE FUNCTION update_question_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE questions 
    SET 
        times_used = times_used + 1,
        times_correct = times_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
        times_incorrect = times_incorrect + CASE WHEN NOT NEW.is_correct THEN 1 ELSE 0 END
    WHERE id = NEW.question_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_question_stats AFTER INSERT ON student_answers
    FOR EACH ROW EXECUTE FUNCTION update_question_stats();

COMMENT ON FUNCTION update_question_stats IS 'Automatically update question usage statistics';

-- ============================================================================
-- INDEXES: Performance optimization
-- ============================================================================

-- Additional composite indexes for common queries
CREATE INDEX idx_student_answers_attempt_correct ON student_answers(attempt_id, is_correct);
CREATE INDEX idx_assessment_attempts_student_status ON assessment_attempts(student_id, status);
CREATE INDEX idx_questions_module_type ON questions(module_id, question_type);
CREATE INDEX idx_questions_difficulty_active ON questions(difficulty, active);

-- ============================================================================
-- GRANTS: Basic permissions (adjust as needed)
-- ============================================================================

-- Grant read access to views
GRANT SELECT ON student_assessment_summary TO postgres;
GRANT SELECT ON question_difficulty_analysis TO postgres;
GRANT SELECT ON assessment_completion_tracking TO postgres;

-- ============================================================================
-- SUMMARY QUERY
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ASSESSMENT SYSTEM CREATED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables Created:';
    RAISE NOTICE '  • question_banks - Question collections';
    RAISE NOTICE '  • questions - Master question table (8 types supported)';
    RAISE NOTICE '  • assessments - Exams, quizzes, practice tests';
    RAISE NOTICE '  • assessment_questions - Question-to-assessment links';
    RAISE NOTICE '  • assessment_attempts - Student test sessions';
    RAISE NOTICE '  • student_answers - Individual responses';
    RAISE NOTICE '  • question_tags - Categorization';
    RAISE NOTICE '  • assessment_analytics - Performance stats';
    RAISE NOTICE '';
    RAISE NOTICE 'Question Types Supported:';
    RAISE NOTICE '  1. Multiple Choice';
    RAISE NOTICE '  2. Multiple Select';
    RAISE NOTICE '  3. True/False';
    RAISE NOTICE '  4. Fill in the Blank';
    RAISE NOTICE '  5. Short Answer';
    RAISE NOTICE '  6. Matching';
    RAISE NOTICE '  7. Ordering/Sequencing';
    RAISE NOTICE '  8. Calculation';
    RAISE NOTICE '';
    RAISE NOTICE 'Features:';
    RAISE NOTICE '  ✓ Auto-grading for objective questions';
    RAISE NOTICE '  ✓ Manual grading support';
    RAISE NOTICE '  ✓ Time limits and attempts';
    RAISE NOTICE '  ✓ Question shuffling';
    RAISE NOTICE '  ✓ Detailed feedback and explanations';
    RAISE NOTICE '  ✓ Performance analytics';
    RAISE NOTICE '  ✓ ASE standard tracking';
    RAISE NOTICE '  ✓ Proctoring support';
    RAISE NOTICE '';
END $$;
