-- SQL script to generate robust course content for all catalog courses
-- Part 1: Create syllabi for all courses

DO $$
DECLARE
    course_rec RECORD;
    syllabus_id INTEGER;
    module_id INTEGER;
    lesson_id INTEGER;
    seq INTEGER;
BEGIN
    RAISE NOTICE 'Starting course content generation...';
    
    -- Loop through all courses
    FOR course_rec IN SELECT * FROM courses ORDER BY code LOOP
        RAISE NOTICE '% Processing: % - %', LPAD(course_rec.id::TEXT, 2, '0'), course_rec.code, course_rec.title;
        
        -- Create syllabus if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM course_syllabus WHERE course_id = course_rec.id) THEN
            INSERT INTO course_syllabus (
                course_id,
                learning_outcomes,
                assessment_methods,
                grading_breakdown,
                prerequisites,
                required_materials,
                course_policies,
                inserted_at,
                updated_at
            ) VALUES (
                course_rec.id,
                ARRAY[
                    'Demonstrate professional shop safety practices and proper tool usage',
                    'Apply systematic diagnostic procedures to identify system issues',
                    'Perform service and repair procedures effectively',
                    'Interpret technical service information accurately',
                    'Use diagnostic equipment properly'
                ],
                ARRAY[
                    'Hands-on practical assessments',
                    'Written quizzes and module exams',
                    'Lab performance evaluations',
                    'Virtual simulation exercises',
                    'Project-based assessments'
                ],
                jsonb_build_object('labs', 35, 'quizzes', 20, 'midterm', 15, 'final_exam', 20, 'participation', 10),
                ARRAY['Basic automotive knowledge recommended'],
                'Safety glasses, course textbook, lab manual, diagnostic tools (provided)',
                'Attendance required for lab sessions. Safety violations result in immediate dismissal from class.',
                NOW(),
                NOW()
            )
            RETURNING id INTO syllabus_id;
            RAISE NOTICE '  ✓ Created syllabus';
        END IF;
        
        -- Create 4 modules per course
        FOR seq IN 1..4 LOOP
            IF NOT EXISTS (
                SELECT 1 FROM course_modules 
                WHERE course_id = course_rec.id AND sequence_number = seq
            ) THEN
                INSERT INTO course_modules (
                    course_id,
                    title,
                    description,
                    sequence_number,
                    duration_weeks,
                    objectives,
                    active,
                    inserted_at,
                    updated_at
                ) VALUES (
                    course_rec.id,
                    course_rec.title || ' - Module ' || seq,
                    'Comprehensive coverage of key concepts and skills for Module ' || seq,
                    seq,
                    2,
                    ARRAY[
                        'Understand key concepts for this module',
                        'Apply learned procedures correctly',
                        'Demonstrate proficiency in lab activities'
                    ],
                    true,
                    NOW(),
                    NOW()
                )
                RETURNING id INTO module_id;
                
                -- Create 3 lessons per module (2 lessons + 1 lab)
                FOR lesson_seq IN 1..3 LOOP
                    INSERT INTO module_lessons (
                        module_id,
                        title,
                        sequence_number,
                        lesson_type,
                        duration_minutes,
                        content,
                        written_steps,
                        audio_script,
                        practice_activities,
                        active,
                        inserted_at,
                        updated_at
                    ) VALUES (
                        module_id,
                        course_rec.title || ' - Module ' || seq || ' - Lesson ' || lesson_seq,
                        lesson_seq,
                        CASE WHEN lesson_seq = 3 THEN 'lab' ELSE 'lesson' END,
                        CASE WHEN lesson_seq = 3 THEN 90 ELSE 45 END,
                        E'# ' || course_rec.title || E'\n\n## Learning Objectives\n- Master fundamental concepts\n- Apply safety procedures\n- Complete hands-on exercises\n\n## Safety First\nAlways wear appropriate PPE and follow shop safety protocols.\n\n## Procedure\n1. Review lesson materials\n2. Watch demonstration\n3. Practice skills in lab\n4. Complete assessment\n\n## Assessment\nDemonstrate proficiency through practical application.',
                        E'## Safety Precautions\n- Wear safety glasses\n- Follow lockout/tagout procedures\n- Use tools properly\n\n## Required Tools\n- Standard hand tools\n- Diagnostic equipment\n- Safety equipment\n\n## Step-by-Step Procedure\n\n### Step 1: Preparation\nGather all required tools and safety equipment before beginning work.\n\n### Step 2: Visual Inspection\nPerform a thorough visual inspection of the system.\n\n### Step 3: Testing\nUse appropriate diagnostic tools to test system operation.\n\n### Step 4: Analysis\nInterpret test results and determine required actions.\n\n### Step 5: Service/Repair\nPerform necessary service or repairs following manufacturer specifications.\n\n### Step 6: Verification\nTest system operation to verify repair success.\n\n## Common Mistakes\n- Skipping safety procedures\n- Not following torque specifications\n- Failing to verify repairs\n\n## Verification Checklist\n✓ All safety protocols followed\n✓ Specifications met\n✓ System operates correctly\n✓ Workspace cleaned',
                        E'Welcome to this lesson on ' || course_rec.title || E'.\n\nIn this module, you''ll learn essential skills and concepts that are critical for success in automotive technology. We''ll start with safety procedures, which are the foundation of everything we do in the shop.\n\nNext, we''ll explore the key systems and components you''ll be working with. Understanding how these systems function is crucial before attempting any service or repair work.\n\nYou''ll then learn systematic diagnostic procedures. A methodical approach to troubleshooting will save you time and help you identify problems accurately.\n\nFinally, you''ll practice hands-on skills in our lab environment. This practical experience is where theory meets reality, and you''ll develop the muscle memory and confidence needed in the field.\n\nRemember, becoming proficient takes practice and patience. Don''t hesitate to ask questions, and always prioritize safety.\n\nNow, let''s get started with the fundamentals.',
                        jsonb_build_array(
                            jsonb_build_object(
                                'type', 'scenario',
                                'title', 'Diagnostic Challenge',
                                'description', 'Apply your knowledge to solve a real-world problem',
                                'scenario', 'A customer reports an issue with their vehicle. Use systematic diagnostic procedures to identify and resolve the problem.',
                                'questions', jsonb_build_array(
                                    jsonb_build_object(
                                        'question', 'What is the first step in diagnosing this issue?',
                                        'options', jsonb_build_array(
                                            'Visual inspection',
                                            'Replace parts',
                                            'Use scan tool',
                                            'Ask customer for more details'
                                        ),
                                        'correct', 0,
                                        'explanation', 'Always start with a thorough visual inspection before using diagnostic tools or replacing parts.'
                                    ),
                                    jsonb_build_object(
                                        'question', 'After identifying the problem, what should you do next?',
                                        'options', jsonb_build_array(
                                            'Order parts immediately',
                                            'Verify the diagnosis with additional tests',
                                            'Give customer an estimate',
                                            'Start repairs'
                                        ),
                                        'correct', 1,
                                        'explanation', 'Always verify your diagnosis with additional testing to ensure accuracy before proceeding.'
                                    )
                                )
                            )
                        ),
                        true,
                        NOW(),
                        NOW()
                    );
                END LOOP;
                
                RAISE NOTICE '  ✓ Created Module % with 3 lessons', seq;
            END IF;
        END LOOP;
        
    END LOOP;
    
    RAISE NOTICE 'Content generation complete!';
END $$;

-- Summary query
SELECT 
    (SELECT COUNT(*) FROM courses) as total_courses,
    (SELECT COUNT(*) FROM course_syllabus) as total_syllabi,
    (SELECT COUNT(*) FROM course_modules) as total_modules,
    (SELECT COUNT(*) FROM module_lessons) as total_lessons,
    (SELECT COUNT(*) FROM module_lessons WHERE lesson_type = 'lab') as lab_lessons,
    (SELECT COUNT(*) FROM module_lessons WHERE lesson_type = 'lesson') as regular_lessons;
