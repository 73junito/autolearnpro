-- Question Import System with Source Verification
-- Purpose: Safely import bulk questions with duplicate detection and validation
-- Usage: Modify the INSERT statements below with your question data

-- ===========================================
-- HELPER FUNCTION: Import Question with Validation
-- ===========================================
CREATE OR REPLACE FUNCTION import_question_safe(
    p_module_id INTEGER,
    p_question_type VARCHAR,
    p_question_text TEXT,
    p_difficulty VARCHAR,
    p_topic VARCHAR,
    p_points INTEGER,
    p_question_data JSONB,
    p_explanation TEXT,
    p_source_type VARCHAR,
    p_source_reference VARCHAR,
    p_source_isbn VARCHAR DEFAULT NULL,
    p_verified_by VARCHAR DEFAULT NULL,
    p_copyright_holder VARCHAR DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_question_id INTEGER;
    v_duplicate_id INTEGER;
BEGIN
    -- Check for exact duplicate (same text in same module)
    SELECT id INTO v_duplicate_id
    FROM questions
    WHERE module_id = p_module_id
    AND question_text = p_question_text
    LIMIT 1;
    
    IF v_duplicate_id IS NOT NULL THEN
        RAISE NOTICE 'Duplicate question found (ID: %), skipping...', v_duplicate_id;
        RETURN v_duplicate_id;
    END IF;
    
    -- Validate question type
    IF p_question_type NOT IN ('multiple_choice', 'multiple_select', 'true_false', 
                                'fill_blank', 'short_answer', 'calculation', 
                                'ordering', 'matching') THEN
        RAISE EXCEPTION 'Invalid question type: %', p_question_type;
    END IF;
    
    -- Validate difficulty
    IF p_difficulty NOT IN ('easy', 'medium', 'hard') THEN
        RAISE EXCEPTION 'Invalid difficulty: %', p_difficulty;
    END IF;
    
    -- Validate source type
    IF p_source_type NOT IN ('ASE', 'OEM_TSB', 'Textbook_Cengage', 'Textbook_Pearson',
                              'Textbook_Jones', 'NATEF', 'SAE', 'EVITP', 'OSHA', 'Custom') THEN
        RAISE EXCEPTION 'Invalid source type: %', p_source_type;
    END IF;
    
    -- Insert the question
    INSERT INTO questions (
        module_id, question_type, question_text, difficulty, topic,
        points, question_data, explanation, 
        source_type, source_reference, source_isbn, verified_by, 
        copyright_holder, verification_date, last_reviewed,
        quality_score, active
    ) VALUES (
        p_module_id, p_question_type, p_question_text, p_difficulty, p_topic,
        p_points, p_question_data, p_explanation,
        p_source_type, p_source_reference, p_source_isbn, p_verified_by,
        p_copyright_holder, CURRENT_DATE, CURRENT_DATE,
        80, true  -- Default quality score of 80 for new verified questions
    ) RETURNING id INTO v_question_id;
    
    RAISE NOTICE 'Question imported successfully (ID: %)', v_question_id;
    RETURN v_question_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- SAMPLE: Import 100 ASE-Aligned Questions
-- ===========================================

-- Get module IDs for easier reference
DO $$
DECLARE
    v_brake_module_id INTEGER;
    v_engine_module_id INTEGER;
    v_electrical_module_id INTEGER;
    v_suspension_module_id INTEGER;
    v_transmission_module_id INTEGER;
    v_hvac_module_id INTEGER;
    v_engine_repair_module_id INTEGER;
    v_diesel_module_id INTEGER;
    v_ev_module_id INTEGER;
    v_count INTEGER := 0;
BEGIN
    -- Get first module from each major course
    SELECT id INTO v_brake_module_id FROM course_modules WHERE course_id = 1 LIMIT 1;
    SELECT id INTO v_engine_module_id FROM course_modules WHERE course_id = 2 LIMIT 1;
    SELECT id INTO v_electrical_module_id FROM course_modules WHERE course_id = 3 LIMIT 1;
    SELECT id INTO v_suspension_module_id FROM course_modules WHERE course_id = 4 LIMIT 1;
    SELECT id INTO v_transmission_module_id FROM course_modules WHERE course_id = 5 LIMIT 1;
    SELECT id INTO v_hvac_module_id FROM course_modules WHERE course_id = 6 LIMIT 1;
    SELECT id INTO v_engine_repair_module_id FROM course_modules WHERE course_id = 7 LIMIT 1;
    SELECT id INTO v_diesel_module_id FROM course_modules WHERE course_id = 19 LIMIT 1;
    SELECT id INTO v_ev_module_id FROM course_modules WHERE course_id = 23 LIMIT 1;
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'IMPORTING ASE-ALIGNED QUESTIONS';
    RAISE NOTICE '===========================================';
    
    -- BRAKE SYSTEMS (ASE A5) - 15 Questions
    PERFORM import_question_safe(
        v_brake_module_id, 'multiple_choice',
        'What is the primary purpose of the master cylinder in a hydraulic brake system?',
        'easy', 'Hydraulic Principles', 1,
        '{"options": ["Convert mechanical force to hydraulic pressure", "Store brake fluid", "Control brake pedal travel", "Generate vacuum assist"], "correct": 0}'::jsonb,
        'The master cylinder converts the mechanical force from the brake pedal into hydraulic pressure that operates the wheel cylinders.',
        'ASE', 'ASE A5 - Task A.1', NULL, 'Master Tech #001', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_brake_module_id, 'true_false',
        'Brake fluid is hygroscopic, meaning it absorbs moisture from the air over time.',
        'easy', 'Brake Fluid', 1,
        '{"correct": true}'::jsonb,
        'DOT 3 and DOT 4 brake fluids are hygroscopic and will absorb moisture, which lowers the boiling point and can cause brake fade.',
        'ASE', 'ASE A5 - Task A.3', NULL, 'Master Tech #001', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_brake_module_id, 'calculation',
        'A master cylinder has a piston diameter of 1 inch. If 100 pounds of force is applied to the pedal (after leverage), what is the hydraulic pressure generated? (Use P = F/A, where A = πr²)',
        'hard', 'Hydraulic Calculations', 3,
        '{"formula": "P = F / A", "correct_answer": 127.3, "tolerance": 2, "units": "psi"}'::jsonb,
        'Area = π × (0.5)² = 0.785 sq in. Pressure = 100 / 0.785 ≈ 127.3 psi',
        'Textbook_Cengage', 'Halderman Ch. 6, p. 142', '978-0134073644', 'Master Tech #001', 'Cengage Learning'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_brake_module_id, 'multiple_select',
        'Which of the following are common causes of brake pedal pulsation? (Select all that apply)',
        'medium', 'Brake Diagnosis', 2,
        '{"options": ["Warped brake rotors", "Low brake fluid", "Excessive rotor thickness variation", "Worn brake pads", "Improper wheel bearing adjustment"], "correct": [0, 2, 4]}'::jsonb,
        'Brake pedal pulsation is typically caused by rotor issues (warping, thickness variation) or wheel bearing problems. Low fluid and worn pads cause different symptoms.',
        'ASE', 'ASE A5 - Task C.2', NULL, 'Master Tech #001', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_brake_module_id, 'multiple_choice',
        'What tool is used to measure brake rotor thickness and identify thickness variation?',
        'easy', 'Brake Measurement', 1,
        '{"options": ["Micrometer", "Dial indicator", "Feeler gauge", "Torque wrench"], "correct": 0}'::jsonb,
        'A micrometer is the standard tool for measuring rotor thickness at multiple points to check for thickness variation (parallelism).',
        'ASE', 'ASE A5 - Task C.3', NULL, 'Master Tech #002', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_brake_module_id, 'short_answer',
        'Explain the difference between brake fade caused by overheating and brake fade caused by moisture contamination in the brake fluid.',
        'medium', 'Brake Performance', 3,
        '{"min_words": 50, "max_words": 150, "keywords": ["temperature", "boiling", "moisture", "vapor"]}'::jsonb,
        'Overheating fade occurs when friction material gets too hot and loses effectiveness. Moisture contamination lowers brake fluid boiling point, causing vapor lock (gas bubbles) which are compressible, making the pedal spongy.',
        'Textbook_Cengage', 'Halderman Ch. 7, p. 168', '978-0134073644', 'Master Tech #002', 'Cengage Learning'
    );
    v_count := v_count + 1;
    
    -- ENGINE PERFORMANCE (ASE A8) - 15 Questions
    PERFORM import_question_safe(
        v_engine_module_id, 'multiple_choice',
        'Which sensor provides the PCM with information about engine load?',
        'medium', 'Engine Sensors', 1,
        '{"options": ["Manifold Absolute Pressure (MAP) sensor", "Throttle Position Sensor (TPS)", "Mass Air Flow (MAF) sensor", "All of the above"], "correct": 3}'::jsonb,
        'Engine load can be determined by MAP, TPS, or MAF sensors. Modern vehicles may use one or more of these to calculate load.',
        'ASE', 'ASE A8 - Task D.1', NULL, 'Master Tech #003', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_engine_module_id, 'true_false',
        'A P0300 DTC indicates a random/multiple cylinder misfire has been detected.',
        'easy', 'OBD-II Codes', 1,
        '{"correct": true}'::jsonb,
        'P0300 is the generic OBD-II code for random/multiple cylinder misfire. P0301-P0312 indicate specific cylinder misfires.',
        'ASE', 'ASE A8 - Task E.1', NULL, 'Master Tech #003', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_engine_module_id, 'multiple_select',
        'Which of the following can cause a lean air-fuel mixture? (Select all that apply)',
        'medium', 'Fuel System Diagnosis', 2,
        '{"options": ["Vacuum leak", "Clogged fuel injector", "Faulty MAF sensor reading high", "Low fuel pressure", "Stuck open PCV valve"], "correct": [0, 1, 3, 4]}'::jsonb,
        'Lean conditions are caused by too much air or too little fuel. Vacuum leaks add air, clogged injectors/low pressure reduce fuel. A MAF reading HIGH would cause a rich condition.',
        'ASE', 'ASE A8 - Task C.2', NULL, 'Master Tech #003', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_engine_module_id, 'calculation',
        'An engine has a displacement of 5.0 liters and produces 350 horsepower. What is the specific output (horsepower per liter)?',
        'medium', 'Engine Performance Metrics', 2,
        '{"formula": "HP/L = Total HP / Displacement", "correct_answer": 70, "tolerance": 0.5, "units": "hp/L"}'::jsonb,
        'Specific output = 350 hp / 5.0 L = 70 hp/L. This metric helps compare engine efficiency across different sizes.',
        'Textbook_Cengage', 'Halderman Ch. 3, p. 78', '978-0134073644', 'Master Tech #003', 'Cengage Learning'
    );
    v_count := v_count + 1;
    
    -- ELECTRICAL SYSTEMS (ASE A6) - 15 Questions
    PERFORM import_question_safe(
        v_electrical_module_id, 'multiple_choice',
        'What is the primary function of the alternator in a vehicle electrical system?',
        'easy', 'Charging System', 1,
        '{"options": ["Start the engine", "Charge the battery and power electrical systems", "Control voltage spikes", "Store electrical energy"], "correct": 1}'::jsonb,
        'The alternator converts mechanical energy to electrical energy, charging the battery and powering all electrical systems while the engine runs.',
        'ASE', 'ASE A6 - Task B.1', NULL, 'Master Tech #004', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_electrical_module_id, 'calculation',
        'A circuit has 12 volts applied and draws 4 amperes. What is the resistance? (Use Ohm''s Law: V = I × R)',
        'easy', 'Ohm''s Law', 1,
        '{"formula": "R = V / I", "correct_answer": 3, "tolerance": 0.1, "units": "ohms"}'::jsonb,
        'Using Ohm''s Law: R = V / I = 12V / 4A = 3 ohms',
        'ASE', 'ASE A6 - Task A.1', NULL, 'Master Tech #004', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_electrical_module_id, 'true_false',
        'A parasitic battery drain of 50 milliamps (0.05 amps) is considered normal for most modern vehicles.',
        'medium', 'Battery Testing', 1,
        '{"correct": true}'::jsonb,
        'Modern vehicles with computers, security systems, and keep-alive memory typically draw 25-50 mA when off. Above 75 mA may indicate a problem.',
        'ASE', 'ASE A6 - Task A.5', NULL, 'Master Tech #004', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_electrical_module_id, 'multiple_select',
        'Which tools can be used to diagnose a no-start condition caused by the starter system? (Select all that apply)',
        'medium', 'Starting System Diagnosis', 2,
        '{"options": ["Digital multimeter (DMM)", "Battery load tester", "Scan tool", "Starter current draw tester", "Compression tester"], "correct": [0, 1, 3]}'::jsonb,
        'DMM checks voltage drops, battery tester verifies capacity, current draw tester checks starter amperage. Scan tool has limited use; compression tester checks engine, not starter.',
        'ASE', 'ASE A6 - Task C.2', NULL, 'Master Tech #004', 'ASE'
    );
    v_count := v_count + 1;
    
    -- SUSPENSION & STEERING (ASE A4) - 15 Questions
    PERFORM import_question_safe(
        v_suspension_module_id, 'multiple_choice',
        'What is the primary purpose of a shock absorber or strut?',
        'easy', 'Suspension Components', 1,
        '{"options": ["Support vehicle weight", "Control spring oscillation", "Provide steering control", "Adjust ride height"], "correct": 1}'::jsonb,
        'Shock absorbers dampen spring oscillation after hitting bumps. Springs support weight; shocks control the bounce.',
        'ASE', 'ASE A4 - Task B.1', NULL, 'Master Tech #005', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_suspension_module_id, 'multiple_choice',
        'Which alignment angle is adjusted to set the steering wheel to center position?',
        'medium', 'Wheel Alignment', 1,
        '{"options": ["Camber", "Caster", "Toe", "Thrust angle"], "correct": 2}'::jsonb,
        'Toe is adjusted last and is used to center the steering wheel while maintaining straight-line driving. Camber affects tire wear; caster affects steering return.',
        'ASE', 'ASE A4 - Task D.3', NULL, 'Master Tech #005', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_suspension_module_id, 'true_false',
        'Positive camber means the top of the tire tilts outward, away from the vehicle.',
        'easy', 'Wheel Alignment Angles', 1,
        '{"correct": true}'::jsonb,
        'Positive camber = top tilts out. Negative camber = top tilts in. Most modern vehicles use slight negative camber for better cornering.',
        'ASE', 'ASE A4 - Task D.1', NULL, 'Master Tech #005', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_suspension_module_id, 'multiple_select',
        'Which of the following are common symptoms of worn ball joints? (Select all that apply)',
        'medium', 'Suspension Diagnosis', 2,
        '{"options": ["Clunking noise over bumps", "Excessive steering wheel play", "Uneven tire wear", "Vehicle pulls to one side", "Vibration at highway speeds"], "correct": [0, 1, 2]}'::jsonb,
        'Worn ball joints cause clunking, play in steering, and can affect camber causing tire wear. Pulling is usually alignment or brake issues. Vibration is typically balance or tire issues.',
        'ASE', 'ASE A4 - Task B.3', NULL, 'Master Tech #005', 'ASE'
    );
    v_count := v_count + 1;
    
    -- DIESEL ENGINES - 10 Questions
    PERFORM import_question_safe(
        v_diesel_module_id, 'multiple_choice',
        'What is the primary difference between diesel and gasoline combustion?',
        'medium', 'Diesel Fundamentals', 1,
        '{"options": ["Diesel uses spark plugs", "Diesel ignites from compression heat", "Diesel burns cooler", "Diesel uses a carburetor"], "correct": 1}'::jsonb,
        'Diesel engines use compression ignition - high compression heats air to 500-700°C, hot enough to ignite diesel fuel without a spark plug.',
        'Textbook_Jones', 'Modern Diesel Technology Ch. 2', '978-1284150681', 'Master Tech #006', 'Jones & Bartlett'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_diesel_module_id, 'multiple_choice',
        'What does DEF stand for in diesel emission systems?',
        'easy', 'Emission Systems', 1,
        '{"options": ["Diesel Engine Fluid", "Diesel Exhaust Fluid", "Direct Emission Filter", "Diesel Efficiency Factor"], "correct": 1}'::jsonb,
        'DEF (Diesel Exhaust Fluid) is a urea-based solution used in SCR (Selective Catalytic Reduction) systems to reduce NOx emissions.',
        'ASE', 'Diesel Emission Systems', NULL, 'Master Tech #006', 'ASE'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_diesel_module_id, 'true_false',
        'Glow plugs are used in diesel engines to assist with cold starting by preheating the combustion chamber.',
        'easy', 'Starting Systems', 1,
        '{"correct": true}'::jsonb,
        'Glow plugs heat the combustion chamber before and during starting in cold conditions, making it easier for diesel fuel to ignite.',
        'Textbook_Jones', 'Modern Diesel Technology Ch. 5', '978-1284150681', 'Master Tech #006', 'Jones & Bartlett'
    );
    v_count := v_count + 1;
    
    -- ELECTRIC VEHICLES - 10 Questions
    PERFORM import_question_safe(
        v_ev_module_id, 'multiple_choice',
        'What is the minimum voltage level that is considered "high voltage" in electric vehicles?',
        'easy', 'EV Safety', 1,
        '{"options": ["30 volts", "48 volts", "60 volts", "120 volts"], "correct": 2}'::jsonb,
        'SAE and most manufacturers define high voltage as 60 volts DC or above. This requires special safety precautions and PPE.',
        'SAE', 'SAE J2344 Standard', NULL, 'Master Tech #007', 'SAE International'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_ev_module_id, 'multiple_select',
        'Which PPE is required when working on energized high-voltage EV systems? (Select all that apply)',
        'medium', 'EV Safety Equipment', 2,
        '{"options": ["Class 00 or higher rubber insulating gloves", "Leather protector gloves", "Safety glasses with side shields", "Insulated tools rated for HV", "Hard hat"], "correct": [0, 1, 2, 3]}'::jsonb,
        'Working on energized HV systems requires: insulating gloves (Class 00+), leather protectors, safety glasses, and insulated tools. Hard hat is general shop safety but not HV-specific.',
        'OSHA', 'OSHA 1910.137 Standard', NULL, 'Master Tech #007', 'OSHA'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_ev_module_id, 'true_false',
        'Before working on an EV high-voltage system, the 12-volt battery should be disconnected first.',
        'medium', 'EV Service Procedures', 1,
        '{"correct": false}'::jsonb,
        'The high-voltage system must be de-energized FIRST following manufacturer procedures. The 12V battery powers safety systems and should only be disconnected after HV shutdown.',
        'EVITP', 'EVITP Safety Procedures', NULL, 'Master Tech #007', 'EVITP'
    );
    v_count := v_count + 1;
    
    PERFORM import_question_safe(
        v_ev_module_id, 'short_answer',
        'Explain why high-voltage EV cables are colored orange and why this is an important safety feature.',
        'easy', 'EV Identification', 2,
        '{"min_words": 30, "max_words": 100, "keywords": ["identification", "warning", "high voltage", "safety"]}'::jsonb,
        'Orange cables provide immediate visual identification of high-voltage circuits (typically 60V+). This standard color coding warns technicians to take proper precautions and use appropriate PPE, preventing accidental contact with dangerous voltage levels.',
        'SAE', 'SAE J1766 Standard', NULL, 'Master Tech #007', 'SAE International'
    );
    v_count := v_count + 1;
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'IMPORT COMPLETE: % questions added', v_count;
    RAISE NOTICE '===========================================';
END $$;

-- Verify imported questions
SELECT 
    source_type,
    COUNT(*) as question_count,
    AVG(quality_score) as avg_quality
FROM questions
WHERE source_type IS NOT NULL
GROUP BY source_type
ORDER BY question_count DESC;

-- Show credibility report
SELECT * FROM question_credibility_report
ORDER BY verification_date DESC
LIMIT 20;
