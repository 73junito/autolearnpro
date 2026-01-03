# Stakeholder Questionnaire — Frontend Discovery

Purpose: prepare focused 15–30 minute interviews to capture product goals, constraints, and API needs for the initial UI iteration.

Attendee details
- Name:
- Role (product/backend/design):
- Email / Slack handle:

Core questions (Product)
1. What are the top 3 user problems this UI should solve in the first iteration?
2. Which screens/flows are critical for MVP? (rank order)
3. What metrics define success for the UI (engagement, load time, conversions)?
4. Any privacy, legal, or content restrictions we must follow?

Core questions (Backend)
1. Which existing APIs will the frontend use for catalog, course, lesson, and assessment data?
2. Are there any pagination, filter, or search semantics we must match?
3. Auth method and token lifecycle (JWT, session cookie, TTL, refresh)?
4. Expected size/shape of typical responses (sample JSONs are helpful).
5. Rate limits, quota, or other performance constraints we should know about.

Core questions (Design)
1. Are there brand guidelines, color palettes, or a design system to follow?
2. Any preferred breakpoints or layout rules for responsive behavior?
3. Example screens or competitor references we should emulate or avoid?
4. Accessibility priorities (WCAG level targets, keyboard-first, screen-reader flows).

Edge cases & non-functional requirements
- Offline behavior expectations
- Error-handling preferences (toasts, inline messages, modals)
- Target browsers / minimum supported versions
- Mobile vs desktop priority

Deliverables requested from stakeholders
- Sample JSON responses for key endpoints
- Any existing Figma/Sketch files or component libraries
- List of required user roles and permission matrix
- Priority list of features for first 2 sprints

Notes / follow-ups
- (space to capture action items during interview)
