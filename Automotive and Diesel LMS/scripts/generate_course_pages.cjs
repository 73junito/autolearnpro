const fs = require('fs').promises;
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'docs', 'course_pages', 'templates');
const DATA_DIR = path.join(__dirname, '..', 'docs', 'course_pages', 'data');
const OUT_DIR = path.join(__dirname, '..', 'docs', 'course_pages', 'generated');

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function generateOne(template, data, outPath) {
  const tpl = await fs.readFile(template, 'utf8');
  const levelLabel = data.level || 'Course';
  const outcomes = Array.isArray(data.outcomes) ? data.outcomes : [];
  const outcomes_list = outcomes.map(o => `                <li>${esc(o)}</li>`).join('\n');
  const html = tpl
    .replace(/{{courseCode}}/g, esc(data.courseCode))
    .replace(/{{title}}/g, esc(data.title))
    .replace(/{{credits}}/g, esc(data.credits))
    .replace(/{{hours}}/g, esc(data.hours))
    .replace(/{{level}}/g, esc(data.level))
    .replace(/{{description}}/g, esc(data.description))
    .replace(/{{levelLabel}}/g, esc(levelLabel))
    .replace(/{{outcomes_list}}/g, outcomes_list);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, html, 'utf8');
}

async function main() {
  const template = path.join(TEMPLATES_DIR, 'course.html');
  try {
    await fs.access(template);
  } catch (e) {
    console.error('Template not found:', template);
    process.exit(2);
  }

  const files = await fs.readdir(DATA_DIR).catch(() => []);
  if (!files.length) {
    console.error('No data files found in', DATA_DIR);
    process.exit(1);
  }

  for (const f of files) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    const p = path.join(DATA_DIR, f);
    const raw = await fs.readFile(p, 'utf8');
    const data = JSON.parse(raw);
    const outName = `${data.courseCode || path.basename(f, '.json')}.html`;
    const outPath = path.join(OUT_DIR, outName);
    await generateOne(template, data, outPath);
    console.log('Generated', outPath);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
