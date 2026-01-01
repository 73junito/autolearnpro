-- Simple seed data for assessments - working version
-- Uses existing table structure

-- ============================================================================
-- INSERT QUESTION BANKS
-- ============================================================================

INSERT INTO question_banks (name, description, category, difficulty, active) VALUES
('Brake Systems - Basic', 'Fundamental brake system concepts', 'automotive', 'beginner', true),
('Engine Performance - Basic', 'Basic engine diagnostics', 'automotive', 'beginner', true),
('Diesel Fundamentals', 'Diesel engine basics', 'diesel', 'beginner', true),
('EV Safety', 'High voltage safety', 'ev', 'beginner', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- INSERT SAMPLE QUESTIONS
-- ============================================================================

-- Get module IDs for AUT-120
DO $$
DECLARE
    mod1_id INTEGER;
    mod2_id INTEGER;
    ev_mod1_id INTEGER;
BEGIN
    -- Get AUT-120 Module 1 ID
    SELECT id INTO mod1_id 
    FROM course_modules 
    WHERE course_id = (SELECT id FROM courses WHERE code = 'AUT-120' LIMIT 1) 
    AND sequence_number = 1 
    LIMIT 1;
    
    -- Get AUT-120 Module 2 ID
    SELECT id INTO mod2_id 
    FROM course_modules 
    WHERE course_id = (SELECT id FROM courses WHERE code = 'AUT-120' LIMIT 1) 
    AND sequence_number = 2 
    LIMIT 1;
    
    -- Get EV-150 Module 1 ID
    SELECT id INTO ev_mod1_id 
    FROM course_modules 
    WHERE course_id = (SELECT id FROM courses WHERE code = 'EV-150' LIMIT 1) 
    AND sequence_number = 1 
    LIMIT 1;
    
    IF mod1_id IS NOT NULL THEN
        -- Question 1: Multiple Choice
        INSERT INTO questions (
            module_id, question_type, question_text, difficulty, topic,
            learning_objective, ase_standard, points, question_data,
            correct_feedback, explanation, hint, active
        ) VALUES (
            mod1_id, 'multiple_choice',
            'What principle allows hydraulic brake systems to multiply force?',
            'medium', 'Hydraulic Principles',
            'Understand Pascal''s Law', 'A5.A.1', 1,
            '{"options": ["Pascal''s Law", "Newton''s First Law", "Bernoulli''s Principle", "Archimedes'' Principle"], "correct": 0}'::jsonb,
            'Correct! Pascal''s Law states that pressure in a confined fluid is transmitted equally.',
            'Pascal''s Law is the foundation of hydraulic brake systems.',
            'Think about how pressure is transmitted through brake fluid.',
            true
        );
        
        -- Question 2: Multiple Select
        INSERT INTO questions (
            module_id, question_type, question_text, difficulty, topic,
            points, question_data, correct_feedback, active
        ) VALUES (
            mod1_id, 'multiple_select',
            'Which safety equipment is required when working with brake systems? (Select all)',
            'easy', 'Shop Safety', 2,
            '{"options": ["Safety glasses", "Nitrile gloves", "Steel-toed boots", "Hearing protection"], "correct": [0, 1, 2]}'::jsonb,
            'Excellent! You identified all required PPE for brake work.',
            true
        );
        
        -- Question 3: True/False
        INSERT INTO questions (
            module_id, question_type, question_text, difficulty, topic,
            points, question_data, explanation, active
        ) VALUES (
            mod1_id, 'true_false',
            'Brake fluid is hygroscopic, meaning it absorbs moisture from the air.',
            'easy', 'Brake Fluid Properties', 1,
            '{"correct": true}'::jsonb,
            'Brake fluid (DOT 3, 4, 5.1) is hygroscopic. This is why it must be changed regularly.',
            true
        );
        
        -- Question 4: Calculation
        INSERT INTO questions (
            module_id, question_type, question_text, difficulty, topic,
            points, question_data, explanation, active
        ) VALUES (
            mod1_id, 'calculation',
            'A master cylinder piston has 0.75 sq in area. With 150 lbs force applied, calculate pressure in PSI.',
            'hard', 'Hydraulic Calculations', 3,
            '{"correct_answer": 200.0, "unit": "psi", "tolerance": 1.0, "formula": "Pressure = Force / Area"}'::jsonb,
            'Using P = F / A: 150 lbs / 0.75 sq in = 200 PSI',
            true
        );
    END IF;
    
    IF mod2_id IS NOT NULL THEN
        -- Question 5: Multiple Choice - Tools
        INSERT INTO questions (
            module_id, question_type, question_text, difficulty, topic,
            ase_standard, points, question_data, explanation, active
        ) VALUES (
            mod2_id, 'multiple_choice',
            'What tool is used to measure brake rotor thickness?',
            'easy', 'Brake Measurement Tools', 'A5.B.2', 1,
            '{"options": ["Micrometer", "Dial indicator", "Feeler gauge", "Torque wrench"], "correct": 0}'::jsonb,
            'A micrometer provides accurate rotor thickness measurements to 0.001 inch.',
            true
        );
        
        -- Question 6: Short Answer
        INSERT INTO questions (
            module_id, question_type, question_text, difficulty, topic,
            points, question_data, explanation, active
        ) VALUES (
            mod2_id, 'short_answer',
            'Explain why brake squeal occurs and list two methods to prevent it.',
            'medium', 'Brake Noise Diagnosis', 3,
            '{"max_length": 500, "min_length": 100, "requires_manual_grading": true}'::jsonb,
            'Brake squeal is caused by vibrations. Prevention: anti-squeal shims, brake lubricant, chamfering pad edges.',
            true
        );
    END IF;
    
    IF ev_mod1_id IS NOT NULL THEN
        -- Question 7: Multiple Choice - HV Safety
        INSERT INTO questions (
            module_id, question_type, question_text, difficulty, topic,
            points, question_data, explanation, active
        ) VALUES (
            ev_mod1_id, 'multiple_choice',
            'What is the minimum voltage level considered "high voltage" in EVs?',
            'easy', 'High Voltage Safety', 1,
            '{"options": ["12 volts", "60 volts", "120 volts", "240 volts"], "correct": 1}'::jsonb,
            'Voltages above 60V DC are classified as high voltage in EVs.',
            true
        );
        
        -- Question 8: Multiple Select - PPE
        INSERT INTO questions (
            module_id, question_type, question_text, difficulty, topic,
            points, question_data, explanation, active
        ) VALUES (
            ev_mod1_id, 'multiple_select',
            'Which PPE is required for energized high-voltage EV work? (Select all)',
            'medium', 'High Voltage PPE', 2,
            '{"options": ["Class 0 insulated gloves", "Leather protector gloves", "Safety glasses with side shields", "Face shield", "Regular cotton gloves"], "correct": [0, 1, 2, 3]}'::jsonb,
            'HV work requires insulated gloves, leather protectors, safety glasses, and face shield.',
            true
        );
    END IF;
    
    RAISE NOTICE 'Sample questions inserted successfully!';
END $$;

-- ============================================================================
-- CREATE SAMPLE ASSESSMENTS
-- ============================================================================

DO $$
DECLARE
    aut120_id INTEGER;
    aut120_mod1_id INTEGER;
    ev150_id INTEGER;
    ev150_mod1_id INTEGER;
    assess_id INTEGER;
BEGIN
    -- Get course IDs
    SELECT id INTO aut120_id FROM courses WHERE code = 'AUT-120' LIMIT 1;
    SELECT id INTO ev150_id FROM courses WHERE code = 'EV-150' LIMIT 1;
    
    IF aut120_id IS NOT NULL THEN
        SELECT id INTO aut120_mod1_id FROM course_modules WHERE course_id = aut120_id AND sequence_number = 1 LIMIT 1;
        
        -- Practice Quiz
        INSERT INTO assessments (
            course_id, module_id, title, description, assessment_type,
            total_points, passing_score, time_limit_minutes, attempts_allowed, active
        ) VALUES (
            aut120_id, aut120_mod1_id,
            'Module 1 Practice Quiz: Brake Safety & Hydraulics',
            'Practice quiz with unlimited attempts and immediate feedback.',
            'practice', 10, 70, 15, 999, true
        ) RETURNING id INTO assess_id;
        
        -- Link questions to quiz
        INSERT INTO assessment_questions (assessment_id, assessment_question_id, sequence_number)
        SELECT assess_id, q.id, ROW_NUMBER() OVER (ORDER BY q.id)
        FROM questions q
        WHERE q.module_id = aut120_mod1_id AND q.active = true
        LIMIT 4;
        
        -- Graded Module Quiz
        INSERT INTO assessments (
            course_id, module_id, title, description, assessment_type,
            total_points, passing_score, time_limit_minutes, attempts_allowed, active
        ) VALUES (
            aut120_id, aut120_mod1_id,
            'Module 1 Quiz: Brake Safety & Hydraulics (Graded)',
            'Graded quiz - 2 attempts allowed. Counts toward final grade.',
            'quiz', 10, 75, 20, 2, true
        );
        
        -- Midterm Exam
        INSERT INTO assessments (
            course_id, title, description, assessment_type,
            total_points, passing_score, time_limit_minutes, attempts_allowed, active
        ) VALUES (
            aut120_id,
            'AUT-120 Midterm Exam',
            'Comprehensive midterm covering Modules 1-2.',
            'midterm', 50, 75, 60, 1, true
        );
        
        -- Final Exam
        INSERT INTO assessments (
            course_id, title, description, assessment_type,
            total_points, passing_score, time_limit_minutes, attempts_allowed, active
        ) VALUES (
            aut120_id,
            'AUT-120 Final Exam',
            'Comprehensive final exam covering all course content.',
            'final', 100, 70, 120, 1, true
        );
    END IF;
    
    IF ev150_id IS NOT NULL THEN
        SELECT id INTO ev150_mod1_id FROM course_modules WHERE course_id = ev150_id AND sequence_number = 1 LIMIT 1;
        
        -- Safety Certification Quiz
        INSERT INTO assessments (
            course_id, module_id, title, description, assessment_type,
            total_points, passing_score, time_limit_minutes, attempts_allowed, active
        ) VALUES (
            ev150_id, ev150_mod1_id,
            'High Voltage Safety Certification Quiz',
            'Must score 100% to work on HV systems. Unlimited attempts.',
            'quiz', 10, 100, 30, 999, true
        );
    END IF;
    
    RAISE NOTICE 'Sample assessments created successfully!';
END $$;

-- ============================================================================
-- CREATE QUESTION TAGS
-- ============================================================================

INSERT INTO question_tags (name, description, category) VALUES
('hydraulics', 'Hydraulic principles and systems', 'topic'),
('safety', 'Safety procedures and equipment', 'topic'),
('measurement', 'Measurement tools and techniques', 'skill'),
('diagnosis', 'Diagnostic procedures', 'skill'),
('ase_a5', 'ASE A5 Brake Systems', 'certification'),
('calculations', 'Mathematical calculations', 'skill'),
('high_voltage', 'High voltage systems', 'topic'),
('ev_components', 'EV component identification', 'topic')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
    q_count INTEGER;
    a_count INTEGER;
    b_count INTEGER;
    t_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO q_count FROM questions;
    SELECT COUNT(*) INTO a_count FROM assessments;
    SELECT COUNT(*) INTO b_count FROM question_banks;
    SELECT COUNT(*) INTO t_count FROM question_tags;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ASSESSMENT SYSTEM POPULATED';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Database Tables:';
    RAISE NOTICE '  ✓ question_banks';
    RAISE NOTICE '  ✓ questions (8 types supported)';
    RAISE NOTICE '  ✓ assessments';
    RAISE NOTICE '  ✓ assessment_questions';
    RAISE NOTICE '  ✓ assessment_attempts';
    RAISE NOTICE '  ✓ question_tags';
    RAISE NOTICE '  ✓ assessment_analytics';
    RAISE NOTICE '';
    RAISE NOTICE 'Sample Data Created:';
    RAISE NOTICE '  • Question Banks: %', b_count;
    RAISE NOTICE '  • Questions: %', q_count;
    RAISE NOTICE '  • Assessments: %', a_count;
    RAISE NOTICE '  • Question Tags: %', t_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Question Types Included:';
    RAISE NOTICE '  ✓ Multiple Choice';
    RAISE NOTICE '  ✓ Multiple Select';
    RAISE NOTICE '  ✓ True/False';
    RAISE NOTICE '  ✓ Fill in the Blank';
    RAISE NOTICE '  ✓ Short Answer';
    RAISE NOTICE '  ✓ Calculation';
    RAISE NOTICE '  ✓ Ordering';
    RAISE NOTICE '  ✓ Matching';
    RAISE NOTICE '';
    RAISE NOTICE 'Assessment Types Created:';
    RAISE NOTICE '  ✓ Practice Quizzes';
    RAISE NOTICE '  ✓ Graded Module Quizzes';
    RAISE NOTICE '  ✓ Midterm Exams';
    RAISE NOTICE '  ✓ Final Exams';
    RAISE NOTICE '  ✓ Safety Certifications';
    RAISE NOTICE '';
    RAISE NOTICE 'Ready for use!';
END $$;
