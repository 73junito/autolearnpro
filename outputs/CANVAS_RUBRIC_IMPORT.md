Canvas Rubric Import — Quick Guide

Files:
- outputs/canvas_rubrics.csv — consolidated export (master)
- outputs/canvas_by_course/*.csv — per-course CSVs generated for import

Notes:
- Canvas does not provide a universal rubric CSV import format across all installs; many admins import rubrics by creating a rubric inside a course and copying cells, or by using LMS integrations.
- The per-course CSVs here follow this structure:
  rubric_title,course,module,criterion,level4_name,level4_points,level4_description,level3_name,level3_points,level3_description,level2_name,level2_points,level2_description,level1_name,level1_points,level1_description

Recommended import workflow (manual):
1. Log into Canvas and open the target course.
2. Go to 'Outcomes' (or 'Grades' → 'Rubrics' depending on your Canvas instance).
3. Create a new rubric and use the CSV file as a reference:
   - Open the per-course CSV in a spreadsheet app (Excel/Sheets).
   - For each rubric criterion row, copy the criterion title and the level names/descriptions into the Canvas rubric editor.
   - Set point values according to the `level*_points` columns (if present).
4. Save the rubric and attach it to assignments as needed.

Automated import (advanced):
- Some institutions use Canvas APIs or third-party tools to programmatically create rubrics. If you want a fully automated import, I can produce a script that uses the Canvas API to create rubrics (requires an API token and course IDs).

If you want, I can:
- Produce one CSV per course packaged in a ZIP ready for distribution.
- Build a small Canvas API script to push rubrics automatically (you'll need to supply tokens and course IDs).

