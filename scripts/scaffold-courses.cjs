#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const COURSES_DIR = path.join(ROOT, 'content', 'courses')

function safeWrite(filePath, content) {
  if (fs.existsSync(filePath)) return false
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
  return true
}

function mdTemplateOverview(courseTitle, weekNum, weekTopic) {
  return `# Week ${weekNum.toString().padStart(2,'0')}: ${weekTopic}

## Learning Objectives
By the end of this week, learners will be able to:
- (list objectives for ${courseTitle})

## Required Materials
- Lecture
- Slides
- Activities

## Estimated Time
3–5 hours
`
}

function mdTemplateLecture(weekTopic) {
  return `# Lecture: ${weekTopic}

## Topics Covered
- (topic list)

## Key Concepts
- (key concepts)

## Instructor Notes
(Optional instructor-only guidance)
`
}

function mdTemplateActivities() {
  return `# Weekly Activities

## Activity 1: System Identification
- (instructions)

## Activity 2: Virtual Lab
- (instructions)
`
}

function mdTemplateKnowledgeCheck(weekNum) {
  return `# Knowledge Check – Week ${weekNum.toString().padStart(2,'0')}

1. (Question 1)
2. (Question 2)
3. (Question 3)

*Ungraded • Unlimited attempts*
`
}

function practiceTestTemplate() {
  return `# Practice Test

## Purpose
Prepare learners for the final exam.

- Format: Multiple choice
- Attempts: Unlimited
- Time limit: None
- Grading: Ungraded

## Coverage
- All weekly modules
`
}

function finalExamTemplate() {
  return `# Final Exam

## Exam Details
- Format: Multiple choice / scenario-based
- Time limit: 90 minutes
- Attempts: 1
- Passing score: 70%

## Coverage
- Weeks 01–12
- Emphasis on diagnostics and safety
`
}

function ensureCourseBaseline(coursePath, metadata) {
  const title = metadata.title || 'Course'
  const templates = [
    { file: 'syllabus.md', content: `# ${title} — Syllabus\n\n(Outline)` },
    { file: 'assessment.md', content: `# ${title} — Assessment Plan\n\n(Assessment details)` },
    { file: 'practice-test.md', content: practiceTestTemplate() },
    { file: 'final-exam.md', content: finalExamTemplate() }
  ]

  templates.forEach(t => {
    safeWrite(path.join(coursePath, t.file), t.content)
  })

  const modulesDir = path.join(coursePath, 'modules')
  if (!fs.existsSync(modulesDir)) fs.mkdirSync(modulesDir, { recursive: true })

  // create 6 weeks by default
  const weeks = [
    'introduction',
    'fundamentals',
    'components',
    'diagnostics',
    'service-procedures',
    'review'
  ]

  weeks.forEach((topic, idx) => {
    const weekNum = idx + 1
    const weekSlug = `week-${String(weekNum).padStart(2, '0')}-${topic}`
    const weekDir = path.join(modulesDir, weekSlug)
    if (!fs.existsSync(weekDir)) fs.mkdirSync(weekDir, { recursive: true })

    safeWrite(path.join(weekDir, 'overview.md'), mdTemplateOverview(title, weekNum, topic.replace(/-/g,' ')))
    safeWrite(path.join(weekDir, 'lecture.md'), mdTemplateLecture(topic.replace(/-/g,' ')))
    // create an empty slides.pdf placeholder if not exists
    const slidesPath = path.join(weekDir, 'slides.pdf')
    if (!fs.existsSync(slidesPath)) fs.writeFileSync(slidesPath, '')
    safeWrite(path.join(weekDir, 'activities.md'), mdTemplateActivities())
    safeWrite(path.join(weekDir, 'knowledge-check.md'), mdTemplateKnowledgeCheck(weekNum))
  })
}

async function main() {
  if (!fs.existsSync(COURSES_DIR)) {
    console.error('Courses directory not found:', COURSES_DIR)
    process.exit(2)
  }

  const entries = fs.readdirSync(COURSES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(d => d.name)

  let created = 0
  for (const dir of entries) {
    const coursePath = path.join(COURSES_DIR, dir)
    const metaPath = path.join(coursePath, 'metadata.json')
    if (!fs.existsSync(metaPath)) {
      console.warn('Skipping (no metadata.json):', dir)
      continue
    }
    let metadata = {}
    try {
      metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch (err) {
      console.warn('Invalid metadata.json for', dir)
      continue
    }

    ensureCourseBaseline(coursePath, metadata)
    created++
    console.log('Ensured baseline for', dir)
  }

  console.log(`Processed ${created} course(s).`)
}

main().catch(err => { console.error(err); process.exit(1) })
