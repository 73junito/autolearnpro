-- Migration: Add Source Verification and Credibility Tracking to Questions
-- Purpose: Track question sources for 10,000+ student population with verified credible content
-- Date: 2025-12-16

-- Add source verification columns to questions table
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS source_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS source_reference VARCHAR(500),
ADD COLUMN IF NOT EXISTS source_isbn VARCHAR(50),
ADD COLUMN IF NOT EXISTS verified_by VARCHAR(100),
ADD COLUMN IF NOT EXISTS verification_date DATE,
ADD COLUMN IF NOT EXISTS last_reviewed DATE,
ADD COLUMN IF NOT EXISTS copyright_holder VARCHAR(255),
ADD COLUMN IF NOT EXISTS license_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Create index for source type queries
CREATE INDEX IF NOT EXISTS idx_questions_source_type ON questions(source_type);
CREATE INDEX IF NOT EXISTS idx_questions_verification_date ON questions(verification_date);
CREATE INDEX IF NOT EXISTS idx_questions_quality_score ON questions(quality_score);

-- Add comments for documentation
COMMENT ON COLUMN questions.source_type IS 'Type of credible source: ASE, OEM_TSB, Textbook_Cengage, Textbook_Pearson, NATEF, SAE, EVITP, Custom';
COMMENT ON COLUMN questions.source_reference IS 'Specific reference: ASE task ID, TSB number, textbook chapter/page, standard number';
COMMENT ON COLUMN questions.source_isbn IS 'ISBN for textbook sources';
COMMENT ON COLUMN questions.verified_by IS 'Name/ID of ASE Master Technician or SME who verified accuracy';
COMMENT ON COLUMN questions.verification_date IS 'Date question was verified by SME';
COMMENT ON COLUMN questions.last_reviewed IS 'Date of most recent content review (should be quarterly)';
COMMENT ON COLUMN questions.copyright_holder IS 'Copyright owner for licensing compliance';
COMMENT ON COLUMN questions.license_type IS 'License type: Educational, Commercial, Custom Agreement';
COMMENT ON COLUMN questions.quality_score IS 'Quality rating 0-100 based on student performance and SME review';
COMMENT ON COLUMN questions.usage_count IS 'Number of times question has been used in assessments';
COMMENT ON COLUMN questions.version IS 'Version number for question updates/revisions';

-- Create source verification tracking table
CREATE TABLE IF NOT EXISTS question_sources (
    id SERIAL PRIMARY KEY,
    source_type VARCHAR(50) NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    publisher VARCHAR(255),
    copyright_year INTEGER,
    license_agreement_file VARCHAR(500),
    contact_email VARCHAR(255),
    renewal_date DATE,
    cost_annual DECIMAL(10,2),
    question_count INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    notes TEXT,
    inserted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on source type
CREATE INDEX IF NOT EXISTS idx_question_sources_type ON question_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_question_sources_active ON question_sources(active);

-- Insert credible source registry
INSERT INTO question_sources (source_type, source_name, publisher, license_agreement_file, notes) VALUES
('ASE', 'ASE Test Specifications A1-A8', 'National Institute for Automotive Service Excellence', NULL, 'Primary source for automotive certification questions'),
('ASE', 'ASE Practice Tests', 'National Institute for Automotive Service Excellence', NULL, 'Official ASE practice test banks'),
('Textbook_Cengage', 'Automotive Technology: Principles, Diagnosis, and Service', 'Cengage Learning', NULL, 'Comprehensive automotive textbook series by James D. Halderman'),
('Textbook_Pearson', 'Automotive Excellence Technical Applications', 'Pearson Education', NULL, 'Industry-standard automotive training materials'),
('Textbook_Jones', 'Modern Diesel Technology', 'Jones & Bartlett Learning', NULL, 'Diesel engine and heavy equipment technology'),
('OEM_TSB', 'Technical Service Bulletins - Multi-OEM', 'Various OEMs', NULL, 'Real-world diagnostic scenarios from manufacturer TSBs'),
('NATEF', 'NATEF Standards and Task Lists', 'National Automotive Technicians Education Foundation', NULL, 'Industry training standards'),
('SAE', 'SAE Standards and Recommended Practices', 'Society of Automotive Engineers', NULL, 'Engineering standards and specifications'),
('EVITP', 'Electric Vehicle Infrastructure Training Program', 'EVITP', NULL, 'EV safety and installation certification'),
('OSHA', 'OSHA Electrical Safety Standards', 'Occupational Safety and Health Administration', NULL, 'High voltage safety requirements')
ON CONFLICT DO NOTHING;

-- Create question review tracking table
CREATE TABLE IF NOT EXISTS question_reviews (
    id SERIAL PRIMARY KEY,
    question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
    reviewer_name VARCHAR(100) NOT NULL,
    reviewer_credentials VARCHAR(255),
    review_date DATE NOT NULL,
    technical_accuracy INTEGER CHECK (technical_accuracy BETWEEN 1 AND 5),
    clarity INTEGER CHECK (clarity BETWEEN 1 AND 5),
    relevance INTEGER CHECK (relevance BETWEEN 1 AND 5),
    difficulty_appropriate BOOLEAN,
    recommended_changes TEXT,
    approved BOOLEAN DEFAULT false,
    notes TEXT,
    inserted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_question_reviews_question ON question_reviews(question_id);
CREATE INDEX IF NOT EXISTS idx_question_reviews_approved ON question_reviews(approved);

-- Create view for question credibility report
CREATE OR REPLACE VIEW question_credibility_report AS
SELECT 
    q.id,
    q.question_type,
    LEFT(q.question_text, 80) as question_preview,
    q.source_type,
    q.source_reference,
    q.verified_by,
    q.verification_date,
    q.last_reviewed,
    CASE 
        WHEN q.last_reviewed IS NULL THEN 'Never Reviewed'
        WHEN q.last_reviewed < CURRENT_DATE - INTERVAL '6 months' THEN 'Review Overdue'
        WHEN q.last_reviewed < CURRENT_DATE - INTERVAL '3 months' THEN 'Review Soon'
        ELSE 'Current'
    END as review_status,
    q.quality_score,
    q.usage_count,
    qs.source_name,
    qs.publisher,
    COUNT(qr.id) as review_count,
    AVG(qr.technical_accuracy) as avg_technical_accuracy
FROM questions q
LEFT JOIN question_sources qs ON q.source_type = qs.source_type
LEFT JOIN question_reviews qr ON q.id = qr.question_id
GROUP BY q.id, q.question_type, q.question_text, q.source_type, q.source_reference,
         q.verified_by, q.verification_date, q.last_reviewed, q.quality_score,
         q.usage_count, qs.source_name, qs.publisher;

-- Create view for source coverage analysis
CREATE OR REPLACE VIEW source_coverage_analysis AS
SELECT 
    qs.source_type,
    qs.source_name,
    COUNT(q.id) as question_count,
    COUNT(CASE WHEN q.verified_by IS NOT NULL THEN 1 END) as verified_count,
    COUNT(CASE WHEN q.last_reviewed > CURRENT_DATE - INTERVAL '6 months' THEN 1 END) as recently_reviewed,
    AVG(q.quality_score) as avg_quality_score,
    SUM(q.usage_count) as total_usage,
    qs.active as source_active
FROM question_sources qs
LEFT JOIN questions q ON qs.source_type = q.source_type
GROUP BY qs.id, qs.source_type, qs.source_name, qs.active
ORDER BY question_count DESC;

-- Function to update question quality score based on performance
CREATE OR REPLACE FUNCTION update_question_quality_score(p_question_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_success_rate NUMERIC;
    v_review_score NUMERIC;
    v_quality_score INTEGER;
BEGIN
    -- Calculate success rate from assessment attempts
    SELECT AVG(CASE WHEN is_correct THEN 100 ELSE 0 END)
    INTO v_success_rate
    FROM assessment_attempts aa
    JOIN assessment_questions aq ON aa.assessment_id = aq.assessment_id
    WHERE aq.question_id = p_question_id
    AND aa.submitted_at > CURRENT_DATE - INTERVAL '90 days';
    
    -- Calculate average review score
    SELECT AVG((technical_accuracy + clarity + relevance) / 3.0 * 20)
    INTO v_review_score
    FROM question_reviews
    WHERE question_id = p_question_id
    AND approved = true;
    
    -- Combined quality score (50% performance, 50% review)
    v_quality_score := COALESCE(
        (COALESCE(v_success_rate, 70) * 0.5 + COALESCE(v_review_score, 70) * 0.5)::INTEGER,
        0
    );
    
    -- Update the question
    UPDATE questions
    SET quality_score = v_quality_score,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_question_id;
    
    RETURN v_quality_score;
END;
$$ LANGUAGE plpgsql;

-- Function to identify questions needing review
CREATE OR REPLACE FUNCTION get_questions_needing_review()
RETURNS TABLE(
    question_id INTEGER,
    question_text TEXT,
    last_reviewed DATE,
    days_since_review INTEGER,
    usage_count INTEGER,
    quality_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        q.id,
        LEFT(q.question_text, 100)::TEXT,
        q.last_reviewed,
        COALESCE(CURRENT_DATE - q.last_reviewed, 9999) as days_since_review,
        q.usage_count,
        q.quality_score
    FROM questions q
    WHERE q.active = true
    AND (
        q.last_reviewed IS NULL
        OR q.last_reviewed < CURRENT_DATE - INTERVAL '6 months'
        OR q.quality_score < 60
        OR q.usage_count > 1000
    )
    ORDER BY days_since_review DESC, usage_count DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update usage count
CREATE OR REPLACE FUNCTION increment_question_usage()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE questions
    SET usage_count = usage_count + 1
    WHERE id = NEW.question_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_question_usage
AFTER INSERT ON assessment_questions
FOR EACH ROW
EXECUTE FUNCTION increment_question_usage();

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'QUESTION SOURCE VERIFICATION SYSTEM CREATED';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Tables Created:';
    RAISE NOTICE '  - question_sources (10 credible sources registered)';
    RAISE NOTICE '  - question_reviews (SME review tracking)';
    RAISE NOTICE 'Columns Added to questions:';
    RAISE NOTICE '  - source_type, source_reference, source_isbn';
    RAISE NOTICE '  - verified_by, verification_date, last_reviewed';
    RAISE NOTICE '  - copyright_holder, license_type';
    RAISE NOTICE '  - quality_score, usage_count, version';
    RAISE NOTICE 'Views Created:';
    RAISE NOTICE '  - question_credibility_report';
    RAISE NOTICE '  - source_coverage_analysis';
    RAISE NOTICE 'Functions Created:';
    RAISE NOTICE '  - update_question_quality_score()';
    RAISE NOTICE '  - get_questions_needing_review()';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Ready for 10,000+ student population';
    RAISE NOTICE 'Target: 60,000 verified questions';
    RAISE NOTICE '===========================================';
END $$;
