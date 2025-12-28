#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const COURSES_DIR = path.join(ROOT, 'content', 'courses')
let MODEL = 'deepseek-r1:1.5b'

function safeMkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function buildPrompt(metadata) {
  const title = metadata.title || metadata.code || 'Untitled Course'
  return `You are an instructional designer. Produce a detailed JSON object for the course titled "${title}". Output ONLY valid JSON with the following keys: "syllabus" (string), "learningObjectives" (array of strings), "weeks" (array of 6 objects with keys "weekNumber" (1-6), "title" (string), "summary" (2-4 sentences), "objectives" (array of 3-6 short objectives)), "practiceTest" (short description), "finalExam" (short description). Keep language concise, professional, and industry-specific to automotive/diesel trade education.

Return the JSON only (no commentary).` }

function runModel(prompt) {
  try {
    // some Ollama CLI versions accept prompt via stdin rather than a --prompt flag
    const out = execFileSync('ollama', ['run', MODEL], { input: prompt, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    return out
  } catch (err) {
    throw new Error(`Model run failed: ${err.message}`)
  }
}

async function runHosted(prompt) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not set')
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500
    })
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`Hosted API error: ${JSON.stringify(j)}`)
  const content = j.choices && j.choices[0] && (j.choices[0].message?.content || j.choices[0].text)
  if (!content) throw new Error('Hosted API returned empty content')
  return content
}

const ARGS = process.argv.slice(2)
const SINGLE = ARGS.includes('--single')
const VERBOSE = ARGS.includes('--verbose')
const FORCE_HOSTED = ARGS.includes('--use-hosted')
// allow overriding model from CLI: --model qwen3:latest
let CLI_MODEL = null
for (let i = 0; i < ARGS.length; i++) {
  if (ARGS[i] === '--model' && ARGS[i+1]) {
    CLI_MODEL = ARGS[i+1]
    break
  }
}

;(async function main() {
  if (!fs.existsSync(COURSES_DIR)) {
    console.error('Courses directory not found:', COURSES_DIR)
    process.exit(2)
  }

  const entries = fs.readdirSync(COURSES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(d => d.name)

  let processed = 0
  // detect available models and fallback if configured MODEL is not available
  try {
    const listOut = execFileSync('ollama', ['list'], { encoding: 'utf8' })
    const names = listOut.split(/\r?\n/).slice(1).map(l => l.split(/\s+/)[0]).filter(Boolean)
    if (CLI_MODEL) {
      MODEL = CLI_MODEL
      if (VERBOSE) console.log('Using CLI model override:', MODEL)
    } else if (!names.includes(MODEL) && names.length > 0) {
      console.warn('Configured model', MODEL, 'not found. Falling back to', names[0])
      MODEL = names[0]
    }
  } catch (err) {
    if (CLI_MODEL) {
      MODEL = CLI_MODEL
      if (VERBOSE) console.warn('Could not list Ollama models, but using CLI override:', MODEL)
    } else {
      console.warn('Could not list Ollama models:', err.message)
    }
  }

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

    const prompt = buildPrompt(metadata)
    if (VERBOSE) console.log('Running model for', dir)
    let out
    try {
      if (FORCE_HOSTED) throw new Error('force hosted')
      out = runModel(prompt)
    } catch (err) {
      if (VERBOSE) console.error('Failed model run for', dir, err.message)
      if (process.env.OPENAI_API_KEY) {
        try {
          console.log('Falling back to hosted API for', dir)
          out = await runHosted(prompt)
          if (VERBOSE) console.log('Hosted API response length:', out.length)
        } catch (hostErr) {
          console.error('Hosted fallback failed for', dir, hostErr.message)
          continue
        }
      } else {
        continue
      }
    }

    if (VERBOSE) console.log('Raw model output (first 1000 chars):', out && out.toString ? out.toString().slice(0, 1000) : out)

    // try to parse JSON only: trim to first/last brace
    const first = out.indexOf('{')
    const last = out.lastIndexOf('}')
    if (first === -1 || last === -1 || last <= first) {
      console.error('Model output not JSON for', dir)
      continue
    }
    const jsonText = out.slice(first, last + 1)

    // validate JSON
    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch (err) {
      console.error('Model returned invalid JSON for', dir, err.message)
      // still write raw for inspection
      safeMkdir(path.join(coursePath, 'generated'))
      fs.writeFileSync(path.join(coursePath, 'generated', 'raw-output.txt'), out, 'utf8')
      continue
    }

    safeMkdir(path.join(coursePath, 'generated'))
    fs.writeFileSync(path.join(coursePath, 'generated', 'generated.json'), JSON.stringify(parsed, null, 2), 'utf8')
    processed++
    console.log('Wrote generated content for', dir)
  }

  console.log(`Processed ${processed} course(s).`)
})()
