-- Sample Assessment Data: Practice Questions, Quizzes, and Exams
-- For Automotive & Diesel LMS courses

-- ============================================================================
-- QUESTION BANKS
-- ============================================================================

INSERT INTO question_banks (name, description, category, difficulty) VALUES
('Brake Systems Basics', 'Fundamental brake system concepts and safety', 'automotive', 'beginner'),
('Brake Systems Advanced', 'Advanced brake diagnostics and repair', 'automotive', 'intermediate'),
('Engine Performance Basics', 'Basic engine operation and diagnostics', 'automotive', 'beginner'),
('Diesel Fundamentals', 'Diesel engine principles and operation', 'diesel', 'beginner'),
('EV Safety', 'High-voltage safety and procedures', 'ev', 'beginner'),
('EV Battery Systems', 'Battery technology and management', 'ev', 'intermediate');

-- ============================================================================
-- SAMPLE QUESTIONS FOR AUT-120 (Brake Systems)
-- ============================================================================

-- Module 1: Brake Safety & Hydraulic Fundamentals

-- Q1: Multiple Choice - Hydraulics
INSERT INTO questions (
    module_id, 
    question_type, 
    question_text,
    difficulty,
    topic,
    learning_objective,
    ase_standard,
    points,
    question_data,
    correct_feedback,
    incorrect_feedback,
    explanation,
    hint
) VALUES (
    (SELECT id FROM course_modules WHERE course_id = (SELECT id FROM courses WHERE code = 'AUT-120') AND sequence_number = 1),
    'multiple_choice',
    'What principle allows hydraulic brake systems to multiply force?',
    'medium',
    'Hydraulic Principles',
    'Understand Pascal''s Law and hydraulic force multiplication',
    'A5.A.1',
    1,
    jsonb_build_object(
        'options', jsonb_build_array(
            'Pascal''s Law',
            'Newton''s First Law',
            'Bernoulli''s Principle',
            'Archimedes'' Principle'
        ),
        'correct', 0
    ),
    'Correct! Pascal''s Law states that pressure applied to a confined fluid is transmitted equally in all directions.',
    'Not quite. Review the fundamental principles of hydraulic systems.',
    'Pascal''s Law is the foundation of hydraulic brake systems. It states that when pressure is applied to a confined fluid, that pressure is transmitted undiminished throughout the fluid and acts with equal force on equal areas.',
    'Think about how pressure is transmitted through brake fluid.'
);

-- Q2: Multiple Select - Safety Equipment
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    points,
    question_data,
    correct_feedback,
    explanation
) VALUES (
    (SELECT id FROM course_modules WHERE course_id = (SELECT id FROM courses WHERE code = 'AUT-120') AND sequence_number = 1),
    'multiple_select',
    'Which safety equipment is required when working with brake systems? (Select all that apply)',
    'easy',
    'Shop Safety',
    2,
    jsonb_build_object(
        'options', jsonb_build_array(
            'Safety glasses',
            'Nitrile gloves',
            'Steel-toed boots',
            'Hearing protection'
        ),
        'correct', jsonb_build_array(0, 1, 2)
    ),
    'Excellent! You identified all the required PPE for brake work.',
    'Brake work requires safety glasses (to protect from brake dust and fluid), nitrile gloves (brake fluid is corrosive), and steel-toed boots (heavy components). Hearing protection is not typically required for brake work unless using power tools.'
);

-- Q3: True/False - Brake Fluid
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    points,
    question_data,
    correct_feedback,
    incorrect_feedback,
    explanation
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'AUT-120') AND sequence_number = 1),
    'true_false',
    'Brake fluid is hygroscopic, meaning it absorbs moisture from the air.',
    'easy',
    'Brake Fluid Properties',
    1,
    jsonb_build_object(
        'statement', 'Brake fluid is hygroscopic',
        'correct', true
    ),
    'Correct! This is why brake fluid containers must be kept sealed and why brake fluid should be changed periodically.',
    'Actually, this is true. Hygroscopic means it absorbs moisture.',
    'Brake fluid (DOT 3, 4, and 5.1) is hygroscopic, meaning it absorbs moisture from the air. This moisture lowers the boiling point of the fluid and can cause brake fade and corrosion. This is why brake fluid must be changed at regular intervals and stored in sealed containers.'
);

-- Q4: Fill in the Blank - Master Cylinder
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    points,
    question_data,
    explanation
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'AUT-120') AND sequence_number = 1),
    'fill_blank',
    'The master cylinder converts mechanical force from the brake ____ into hydraulic ____ in the brake system.',
    'medium',
    'Master Cylinder Function',
    2,
    jsonb_build_object(
        'text', 'The master cylinder converts mechanical force from the brake ____ into hydraulic ____ in the brake system.',
        'blanks', jsonb_build_array('pedal', 'pressure'),
        'case_sensitive', false,
        'acceptable_variants', jsonb_build_array(
            jsonb_build_array('pedal', 'foot pedal', 'brake pedal'),
            jsonb_build_array('pressure', 'fluid pressure')
        )
    ),
    'The master cylinder is the heart of the hydraulic brake system. When the driver presses the brake pedal (mechanical force), the master cylinder converts this into hydraulic pressure that is transmitted through brake lines to the wheel cylinders or calipers.'
);

-- Q5: Calculation - Hydraulic Pressure
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    learning_objective,
    points,
    question_data,
    explanation,
    hint
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'AUT-120') AND sequence_number = 1),
    'calculation',
    'A master cylinder has a piston with a cross-sectional area of 0.75 square inches. If 150 pounds of force is applied to the piston, calculate the hydraulic pressure generated in PSI.',
    'hard',
    'Hydraulic Calculations',
    'Calculate hydraulic pressure using the formula: Pressure = Force / Area',
    3,
    jsonb_build_object(
        'problem', 'Master cylinder piston area = 0.75 sq in, Applied force = 150 lbs',
        'correct_answer', 200.0,
        'unit', 'psi',
        'tolerance', 1.0,
        'formula', 'Pressure = Force / Area',
        'show_work_required', true
    ),
    'Using the formula Pressure = Force / Area: P = 150 lbs / 0.75 sq in = 200 PSI. This pressure is then transmitted through the brake lines to create braking force at each wheel.',
    'Use the formula: Pressure = Force / Area. Don''t forget to include the unit (psi) in your answer.'
);

-- Module 2: Disc Brake Service

-- Q6: Multiple Choice - Rotor Measurement
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    ase_standard,
    points,
    question_data,
    correct_feedback,
    explanation
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'AUT-120') AND sequence_number = 2),
    'multiple_choice',
    'What tool is used to measure brake rotor thickness?',
    'easy',
    'Brake Measurement Tools',
    'A5.B.2',
    1,
    jsonb_build_object(
        'options', jsonb_build_array(
            'Micrometer',
            'Dial indicator',
            'Feeler gauge',
            'Torque wrench'
        ),
        'correct', 0
    ),
    'Correct! A micrometer provides accurate rotor thickness measurements.',
    'A micrometer is the proper tool for measuring rotor thickness. It provides measurements accurate to 0.001 inch (thousandths), which is necessary because rotors have minimum thickness specifications that must be checked. Dial indicators measure runout, feeler gauges measure gaps, and torque wrenches measure fastener tightness.'
);

-- Q7: Ordering - Brake Pad Replacement
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    points,
    question_data,
    explanation
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'AUT-120') AND sequence_number = 2),
    'ordering',
    'Place the following steps for disc brake pad replacement in the correct order:',
    'medium',
    'Disc Brake Service Procedure',
    2,
    jsonb_build_object(
        'items', jsonb_build_array(
            'Remove wheel',
            'Compress caliper piston',
            'Remove caliper bolts',
            'Remove old brake pads',
            'Install new brake pads',
            'Reinstall caliper',
            'Pump brake pedal'
        ),
        'correct_order', jsonb_build_array(0, 2, 1, 3, 4, 5, 6)
    ),
    'The correct sequence ensures safety and prevents damage to components. Always remove the wheel first for access, then remove caliper bolts, compress the piston (to make room for new, thicker pads), remove old pads, install new pads, reinstall caliper, and finally pump the pedal to seat the pads against the rotor.'
);

-- Q8: Short Answer - Brake Noise
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    points,
    question_data,
    explanation
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'AUT-120') AND sequence_number = 2),
    'short_answer',
    'Explain why brake squeal occurs and list at least two methods to prevent it.',
    'medium',
    'Brake Noise Diagnosis',
    3,
    jsonb_build_object(
        'question', 'Explain why brake squeal occurs and list at least two methods to prevent it.',
        'acceptable_keywords', jsonb_build_array(
            'vibration', 'frequency', 'shims', 'lubricant', 'chamfer', 'pad', 'rotor'
        ),
        'max_length', 500,
        'min_length', 100,
        'requires_manual_grading', true
    ),
    'Brake squeal is caused by vibrations between the pad and rotor at certain frequencies (typically 1000-16000 Hz). Prevention methods include: 1) Using anti-squeal shims to dampen vibrations, 2) Applying brake lubricant to pad backing plates, 3) Chamfering pad edges to reduce initial contact area, 4) Ensuring proper rotor surface finish, 5) Using quality brake pads with proper friction materials.'
);

-- ============================================================================
-- SAMPLE QUESTIONS FOR EV-150 (Electric Vehicle Fundamentals)
-- ============================================================================

-- Q9: Multiple Choice - High Voltage Safety
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    points,
    question_data,
    correct_feedback,
    explanation,
    question_image_url
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'EV-150') AND sequence_number = 1),
    'multiple_choice',
    'What is the minimum voltage level considered "high voltage" in electric vehicles that requires special safety precautions?',
    'easy',
    'High Voltage Safety Standards',
    1,
    jsonb_build_object(
        'options', jsonb_build_array(
            '12 volts',
            '60 volts',
            '120 volts',
            '240 volts'
        ),
        'correct', 1
    ),
    'Correct! Voltages above 60V DC (or 30V AC) are considered high voltage and require certified technician training and PPE.',
    'In the EV industry, systems operating above 60 volts DC are classified as high voltage. This threshold was established because voltages above this level can penetrate human skin and cause serious injury or death. EVs typically operate at 200-800+ volts, making proper safety procedures critical.',
    '/images/questions/hv_warning_symbols.jpg'
);

-- Q10: Multiple Select - PPE for HV Work
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    points,
    question_data,
    explanation
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'EV-150') AND sequence_number = 1),
    'multiple_select',
    'Which Personal Protective Equipment is required when working on energized high-voltage EV systems? (Select all that apply)',
    'medium',
    'High Voltage PPE',
    2,
    jsonb_build_object(
        'options', jsonb_build_array(
            'Class 0 insulated gloves rated 1000V',
            'Leather protector gloves',
            'Safety glasses with side shields',
            'Face shield',
            'Regular cotton work gloves',
            'Steel-toed boots'
        ),
        'correct', jsonb_build_array(0, 1, 2, 3)
    ),
    'Working with high-voltage systems requires: Class 0 insulated gloves (rated for at least 1000V) with leather protectors to prevent punctures, safety glasses with side shields, and a face shield for arc flash protection. Regular cotton gloves provide NO protection and steel-toed boots are general PPE but not HV-specific.'
);

-- Q11: Matching - EV Components
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    points,
    question_data,
    explanation
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'EV-150') AND sequence_number = 2),
    'matching',
    'Match each EV component with its primary function:',
    'medium',
    'EV Component Functions',
    3,
    jsonb_build_object(
        'left_items', jsonb_build_array(
            'Traction Battery',
            'Inverter',
            'Onboard Charger',
            'Battery Management System (BMS)',
            'Electric Motor'
        ),
        'right_items', jsonb_build_array(
            'Converts DC power to AC power for the motor',
            'Converts mechanical rotation to propel the vehicle',
            'Stores electrical energy for vehicle operation',
            'Converts AC grid power to DC for battery charging',
            'Monitors battery health, temperature, and charge state'
        ),
        'correct_pairs', jsonb_build_array(
            jsonb_build_array(0, 2),  -- Battery -> Stores energy
            jsonb_build_array(1, 0),  -- Inverter -> Converts DC to AC
            jsonb_build_array(2, 3),  -- Charger -> Converts AC to DC
            jsonb_build_array(3, 4),  -- BMS -> Monitors battery
            jsonb_build_array(4, 1)   -- Motor -> Converts to motion
        )
    ),
    'Understanding these core EV components is essential: The traction battery stores energy, the inverter converts DC battery power to AC for the motor, the onboard charger converts AC from the grid to DC for charging, the BMS monitors and protects the battery, and the electric motor converts electrical energy to mechanical motion.'
);

-- ============================================================================
-- SAMPLE QUESTIONS FOR DSL-160 (Diesel Engine Operation)
-- ============================================================================

-- Q12: True/False - Diesel Combustion
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    points,
    question_data,
    correct_feedback,
    incorrect_feedback,
    explanation
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'DSL-160') AND sequence_number = 1),
    'true_false',
    'Diesel engines use spark plugs to ignite the fuel-air mixture.',
    'easy',
    'Diesel Combustion Process',
    1,
    jsonb_build_object(
        'statement', 'Diesel engines use spark plugs',
        'correct', false
    ),
    'Correct! Diesel engines use compression ignition, not spark ignition.',
    'This is false. Diesel engines rely on compression ignition.',
    'Unlike gasoline engines that use spark plugs, diesel engines use compression ignition. Air is compressed to such a high pressure (often 400-600 PSI) that the temperature rises above 500°C (932°F). When fuel is injected into this hot, compressed air, it spontaneously ignites without needing a spark.'
);

-- Q13: Calculation - Compression Ratio
INSERT INTO questions (
    module_id,
    question_type,
    question_text,
    difficulty,
    topic,
    points,
    question_data,
    explanation
) VALUES (
    (SELECT id FROM course_modules WHERE code = 'DSL-160') AND sequence_number = 1),
    'calculation',
    'A diesel engine has a cylinder volume of 510 cubic centimeters at BDC (bottom dead center) and 30 cubic centimeters at TDC (top dead center). Calculate the compression ratio.',
    'hard',
    'Engine Specifications',
    3,
    jsonb_build_object(
        'problem', 'Volume at BDC = 510 cc, Volume at TDC = 30 cc',
        'correct_answer', 17.0,
        'unit', ':1',
        'tolerance', 0.5,
        'formula', 'Compression Ratio = Volume at BDC / Volume at TDC',
        'show_work_required', true
    ),
    'Compression ratio is calculated as: CR = Volume at BDC / Volume at TDC = 510 cc / 30 cc = 17:1. Diesel engines typically have much higher compression ratios (15:1 to 23:1) compared to gasoline engines (8:1 to 12:1) because they rely on compression heat to ignite the fuel.'
);

-- ============================================================================
-- CREATE ASSESSMENTS (Quizzes and Exams)
-- ============================================================================

-- Practice Quiz for AUT-120 Module 1
INSERT INTO assessments (
    course_id,
    module_id,
    title,
    description,
    assessment_type,
    total_points,
    passing_score,
    time_limit_minutes,
    max_attempts,
    shuffle_questions,
    shuffle_answers,
    show_feedback_immediately,
    show_correct_answers,
    weight_in_course
) VALUES (
    (SELECT id FROM courses WHERE code = 'AUT-120'),
    (SELECT id FROM course_modules WHERE course_id = (SELECT id FROM courses WHERE code = 'AUT-120') AND sequence_number = 1),
    'Module 1 Practice Quiz: Brake Safety & Hydraulics',
    'Practice quiz covering brake safety procedures and hydraulic principles. Unlimited attempts with immediate feedback.',
    'practice',
    7,  -- Total points from questions
    70,  -- 70% passing
    15,  -- 15 minutes
    NULL,  -- Unlimited attempts
    true,  -- Shuffle questions
    true,  -- Shuffle answers
    true,  -- Show feedback immediately
    true,  -- Show correct answers
    0  -- Practice doesn't count toward grade
);

-- Link questions to practice quiz
INSERT INTO assessment_questions (assessment_id, question_id, sequence_number, points_override)
SELECT 
    (SELECT id FROM assessments WHERE title = 'Module 1 Practice Quiz: Brake Safety & Hydraulics'),
    id,
    ROW_NUMBER() OVER (ORDER BY id),
    points
FROM questions
WHERE module_id = (SELECT id FROM course_modules WHERE course_id = (SELECT id FROM courses WHERE code = 'AUT-120') AND sequence_number = 1)
ORDER BY id
LIMIT 5;

-- Module 1 Graded Quiz for AUT-120
INSERT INTO assessments (
    course_id,
    module_id,
    title,
    description,
    assessment_type,
    total_points,
    passing_score,
    time_limit_minutes,
    max_attempts,
    shuffle_questions,
    shuffle_answers,
    show_feedback_immediately,
    show_correct_answers,
    weight_in_course
) VALUES (
    (SELECT id FROM courses WHERE code = 'AUT-120'),
    (SELECT id FROM course_modules WHERE code = 'AUT-120') AND sequence_number = 1),
    'Module 1 Quiz: Brake Safety & Hydraulics',
    'Graded quiz covering all Module 1 content. 2 attempts allowed. Counts toward 20% quizzes portion of final grade.',
    'quiz',
    10,
    75,  -- 75% passing
    20,  -- 20 minutes
    2,  -- 2 attempts
    true,
    true,
    false,  -- Don't show feedback until after submission
    true,
    5.0  -- 5% of final grade (20% quizzes / 4 modules)
);

-- AUT-120 Midterm Exam
INSERT INTO assessments (
    course_id,
    title,
    description,
    assessment_type,
    total_points,
    passing_score,
    time_limit_minutes,
    max_attempts,
    shuffle_questions,
    shuffle_answers,
    show_feedback_immediately,
    show_correct_answers,
    allow_review,
    weight_in_course
) VALUES (
    (SELECT id FROM courses WHERE code = 'AUT-120'),
    'AUT-120 Midterm Exam',
    'Comprehensive midterm covering Modules 1-2. One attempt only. Covers brake safety, hydraulics, and disc brake service.',
    'midterm',
    50,
    75,  -- 75% passing
    60,  -- 60 minutes
    1,  -- One attempt only
    true,
    true,
    false,  -- No immediate feedback
    false,  -- Don't show correct answers until all students complete
    true,  -- Allow review after grading
    15.0  -- 15% of final grade
);

-- AUT-120 Final Exam
INSERT INTO assessments (
    course_id,
    title,
    description,
    assessment_type,
    total_points,
    passing_score,
    time_limit_minutes,
    max_attempts,
    shuffle_questions,
    shuffle_answers,
    show_feedback_immediately,
    show_correct_answers,
    allow_review,
    require_proctor,
    one_question_at_time,
    prevent_backtrack,
    weight_in_course
) VALUES (
    (SELECT id FROM courses WHERE code = 'AUT-120'),
    'AUT-120 Final Exam',
    'Comprehensive final exam covering all course content (Modules 1-4). Proctored exam, one attempt, no backtracking.',
    'final',
    100,
    70,  -- 70% passing
    120,  -- 2 hours
    1,  -- One attempt only
    true,
    true,
    false,  -- No immediate feedback
    false,  -- Don't show answers
    true,  -- Allow review after grading
    true,  -- Requires proctor
    true,  -- One question at a time
    true,  -- Cannot go back
    20.0  -- 20% of final grade
);

-- EV-150 High Voltage Safety Quiz
INSERT INTO assessments (
    course_id,
    module_id,
    title,
    description,
    assessment_type,
    total_points,
    passing_score,
    time_limit_minutes,
    max_attempts,
    shuffle_questions,
    show_feedback_immediately,
    weight_in_course
) VALUES (
    (SELECT id FROM courses WHERE code = 'EV-150'),
    (SELECT id FROM course_modules WHERE course_id = (SELECT id FROM courses WHERE code = 'EV-150') AND sequence_number = 1),
    'High Voltage Safety Certification Quiz',
    'Safety certification quiz - must score 100% to work on high-voltage systems. Unlimited attempts.',
    'quiz',
    10,
    100,  -- Must score 100% for safety certification
    30,
    NULL,  -- Unlimited attempts until 100% achieved
    false,  -- Don't shuffle - safety sequence matters
    true,  -- Show feedback immediately
    5.0
);

-- ============================================================================
-- QUESTION TAGS FOR ORGANIZATION
-- ============================================================================

INSERT INTO question_tags (name, description, category) VALUES
('hydraulics', 'Questions about hydraulic principles and systems', 'topic'),
('safety', 'Safety procedures and equipment', 'topic'),
('measurement', 'Using measurement tools and instruments', 'skill'),
('diagnosis', 'Diagnostic procedures and troubleshooting', 'skill'),
('ase_a5', 'ASE A5 Brake Systems certification area', 'certification'),
('calculations', 'Mathematical calculations and formulas', 'skill'),
('high_voltage', 'High voltage systems and safety', 'topic'),
('ev_components', 'Electric vehicle component identification', 'topic'),
('diesel_combustion', 'Diesel combustion process', 'topic');

-- Link questions to tags (sample)
INSERT INTO question_tag_mappings (question_id, tag_id)
SELECT q.id, t.id
FROM questions q
CROSS JOIN question_tags t
WHERE 
    (q.topic = 'Hydraulic Principles' AND t.name = 'hydraulics') OR
    (q.topic = 'Shop Safety' AND t.name = 'safety') OR
    (q.ase_standard LIKE 'A5.%' AND t.name = 'ase_a5') OR
    (q.question_type = 'calculation' AND t.name = 'calculations') OR
    (q.topic LIKE '%High Voltage%' AND t.name = 'high_voltage');

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
    v_question_count INTEGER;
    v_assessment_count INTEGER;
    v_bank_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_question_count FROM questions;
    SELECT COUNT(*) INTO v_assessment_count FROM assessments;
    SELECT COUNT(*) INTO v_bank_count FROM question_banks;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SAMPLE ASSESSMENT DATA CREATED';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Question Banks: %', v_bank_count;
    RAISE NOTICE 'Questions: %', v_question_count;
    RAISE NOTICE 'Assessments: %', v_assessment_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Question Types Included:';
    RAISE NOTICE '  • Multiple Choice (6 questions)';
    RAISE NOTICE '  • Multiple Select (2 questions)';
    RAISE NOTICE '  • True/False (2 questions)';
    RAISE NOTICE '  • Fill in the Blank (1 question)';
    RAISE NOTICE '  • Short Answer (1 question)';
    RAISE NOTICE '  • Calculation (2 questions)';
    RAISE NOTICE '  • Ordering (1 question)';
    RAISE NOTICE '  • Matching (1 question)';
    RAISE NOTICE '';
    RAISE NOTICE 'Assessments Created:';
    RAISE NOTICE '  • Practice Quizzes (unlimited attempts)';
    RAISE NOTICE '  • Module Quizzes (2 attempts)';
    RAISE NOTICE '  • Midterm Exam (1 attempt)';
    RAISE NOTICE '  • Final Exam (proctored)';
    RAISE NOTICE '  • Safety Certification (100% required)';
    RAISE NOTICE '';
END $$;
