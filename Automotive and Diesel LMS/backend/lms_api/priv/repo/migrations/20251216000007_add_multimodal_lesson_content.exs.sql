-- Migration: Add multimedia and interactive content fields to module_lessons
-- This enables rich learning experiences with multiple modalities

-- Add new columns for enhanced lesson content
ALTER TABLE module_lessons 
ADD COLUMN IF NOT EXISTS visual_diagrams jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS written_steps text,
ADD COLUMN IF NOT EXISTS audio_script text,
ADD COLUMN IF NOT EXISTS audio_url varchar(500),
ADD COLUMN IF NOT EXISTS interactive_elements jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS practice_activities jsonb DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN module_lessons.visual_diagrams IS 'Array of diagram objects with URLs, captions, and descriptions';
COMMENT ON COLUMN module_lessons.written_steps IS 'Step-by-step written instructions in markdown format';
COMMENT ON COLUMN module_lessons.audio_script IS 'Script for audio narration/explanation';
COMMENT ON COLUMN module_lessons.audio_url IS 'URL to audio narration file';
COMMENT ON COLUMN module_lessons.interactive_elements IS 'Interactive components like hotspots, quizzes, simulations';
COMMENT ON COLUMN module_lessons.practice_activities IS 'Hands-on practice exercises and scenarios';

-- Create index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_lessons_visual_diagrams ON module_lessons USING GIN (visual_diagrams);
CREATE INDEX IF NOT EXISTS idx_lessons_interactive_elements ON module_lessons USING GIN (interactive_elements);
CREATE INDEX IF NOT EXISTS idx_lessons_practice_activities ON module_lessons USING GIN (practice_activities);

-- Example data structure for reference:
/*
visual_diagrams: [
  {
    "id": "diagram-1",
    "type": "system_overview|component_detail|flowchart|circuit_diagram",
    "title": "Brake System Hydraulic Circuit",
    "image_url": "/images/diagrams/brake-hydraulic-circuit.png",
    "caption": "Complete hydraulic brake system showing master cylinder, brake lines, and calipers",
    "annotations": [
      {"x": 100, "y": 50, "label": "Master Cylinder", "description": "Converts pedal force to hydraulic pressure"}
    ]
  }
]

written_steps: "## Step 1: Safety Preparation\n- Wear safety glasses\n- Ensure vehicle is secure..."

audio_script: "Welcome to this lesson on brake systems. Today we'll learn how hydraulic pressure..."

interactive_elements: [
  {
    "type": "hotspot|quiz|simulation|drag_drop|3d_model",
    "title": "Identify Brake Components",
    "description": "Click on each component to learn its function",
    "data": {...}
  }
]

practice_activities: [
  {
    "type": "scenario|troubleshooting|calculation|identification",
    "title": "Brake Fluid Level Check",
    "difficulty": "beginner|intermediate|advanced",
    "estimated_time": 15,
    "instructions": "...",
    "success_criteria": "...",
    "feedback": "..."
  }
]
*/

SELECT 'Enhanced lesson content structure created successfully!' as status;
