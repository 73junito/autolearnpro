#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const indexPath = process.argv[2] || path.join(process.cwd(), 'outputs', 'html_pages.txt');
const outPath = process.argv[3] || path.join(process.cwd(), 'outputs', 'mapping_suggestions.json');

if (!fs.existsSync(indexPath)) {
  console.error('Index file not found:', indexPath);
  process.exit(2);
}

const raw = fs.readFileSync(indexPath, 'utf8');
const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);

function classify(p) {
  const lp = p.toLowerCase();
  if (lp.endsWith('site/index.html')) return 'course_home';
  if (lp.endsWith('/index.html') && lp.match(/content\\|content\//)) return 'course_home';
  if (lp.includes(path.sep + 'modules' + path.sep) && lp.endsWith('overview.html')) return 'module_overview';
  if (lp.endsWith('lecture.html') || lp.includes(path.sep + 'lessons' + path.sep)) return 'lesson';
  if (lp.endsWith('activities.html') || lp.includes('activity')) return 'activity';
  if (lp.endsWith('knowledge-check.html') || lp.includes('practice-test') || lp.includes('quiz')) return 'knowledge_check';
  if (lp.endsWith('final-exam.html') || lp.endsWith('assessment.html')) return 'assessment';
  if (lp.includes('/site/') && lp.endsWith('.html')) return 'site_page';
  return 'other';
}

const suggestions = [];
const counts = {};

for (const rawLine of lines) {
  if (!/\.html$/i.test(rawLine)) continue;
  // normalize path separators
  const p = rawLine.replace(/\\\\|\\/g, path.sep);
  const type = classify(p);
  counts[type] = (counts[type] || 0) + 1;

  // build suggested relative target path
  const baseName = path.basename(p);
  let suggested = '';
  switch(type) {
    case 'course_home':
      suggested = path.join('site', 'index.html');
      break;
    case 'module_overview':
      suggested = path.join('site', 'modules', path.basename(path.dirname(p)), 'overview.html');
      break;
    case 'lesson':
      suggested = path.join('site', 'lessons', baseName);
      break;
    case 'activity':
      suggested = path.join('site', 'activities', baseName);
      break;
    case 'knowledge_check':
      suggested = path.join('site', 'assessments', baseName);
      break;
    case 'assessment':
      suggested = path.join('site', 'assessments', baseName);
      break;
    case 'site_page':
      suggested = path.relative(path.resolve(process.cwd()), p);
      break;
    default:
      suggested = path.relative(path.resolve(process.cwd()), p);
  }

  suggestions.push({ source: p, type, suggested });
}

fs.writeFileSync(outPath, JSON.stringify({ generatedAt:new Date().toISOString(), counts, suggestions }, null, 2));
console.log('Wrote mapping suggestions to', outPath);
console.log('Counts:', counts);
