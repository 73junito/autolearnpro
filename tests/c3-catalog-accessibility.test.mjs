// C3-R37H remediation R5 (findings B14, B19, B20) — catalog accessibility contract tests (static).
//
// These assertions are the machine-checkable half of the R5 acceptance criteria: semantics, labels, focus
// rules, Escape behavior wiring, focus restoration, reduced-motion support, tab order and status
// announcements. The behavioral half (real key events in a real browser) is in
// tests/c3-catalog-keyboard.test.mjs; the cross-browser matrix is exercised in CI.
//
// Run with: node --test tests/c3-catalog-accessibility.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, '..', 'apps', 'catalog');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(APP, 'src', 'main.js'), 'utf8');

const ids = new Set([...html.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map((match) => match[1]));

test('1. document language, title and landmark structure are declared', () => {
  assert.match(html, /<html\s+lang="en">/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<main\b/);
});

test('2. heading hierarchy: exactly one h1 and no skipped levels', () => {
  const levels = [...html.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  assert.equal(levels.filter((level) => level === 1).length, 1, 'exactly one h1');
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(levels[index] - levels[index - 1] <= 1, `heading level skipped at index ${index}: ${levels[index - 1]} -> ${levels[index]}`);
  }
});

test('3. status regions are exposed to assistive technology', () => {
  assert.match(html, /id="boot-status"\s+role="status"/);
  assert.match(html, /id="about-live"\s+role="status"/);
});

test('4. the dismissible dialog has correct semantics and an accessible name', () => {
  const dialog = html.match(/<div\s+id="about-panel"([^>]*)>/);
  assert.ok(dialog, 'the dialog panel exists');
  const attrs = dialog[1];
  assert.match(attrs, /role="dialog"/);
  assert.match(attrs, /aria-modal="true"/);
  const labelledBy = attrs.match(/aria-labelledby="([^"]+)"/);
  assert.ok(labelledBy, 'aria-labelledby is declared');
  assert.ok(ids.has(labelledBy[1]), `aria-labelledby target ${labelledBy[1]} exists`);
  assert.match(attrs, /\bhidden\b/, 'the dialog starts dismissed');
});

test('5. interactive controls are native buttons with accessible names and state wiring', () => {
  const open = html.match(/<button\s+type="button"\s+id="about-open"([^>]*)>([\s\S]*?)<\/button>/);
  assert.ok(open, 'the trigger is a native button with type=button');
  assert.match(open[1], /aria-expanded="false"/);
  const controls = open[1].match(/aria-controls="([^"]+)"/);
  assert.ok(controls && ids.has(controls[1]), 'aria-controls resolves to the dialog id');
  assert.ok(open[2].trim().length > 0, 'the trigger has a non-empty accessible name');
  const close = html.match(/<button\s+type="button"\s+id="about-close">([\s\S]*?)<\/button>/);
  assert.ok(close, 'the dismiss control is a native button');
  assert.ok(close[1].trim().length > 0, 'the dismiss control has a non-empty accessible name');
});

test('6. Escape dismissal and focus restoration are wired in the entry module', () => {
  assert.match(main, /event\.key === 'Escape'/, 'Escape dismisses the overlay');
  assert.match(main, /\(opener \?\? aboutOpen\)\.focus\(\)/, 'focus returns to the control that opened the overlay');
  assert.match(main, /aboutClose\.focus\(\)/, 'focus enters the overlay on open');
  assert.match(main, /setAttribute\('aria-expanded'/, 'expanded state is kept in sync for assistive technology');
});

test('7. visible focus indicators and reduced-motion support are declared', () => {
  assert.match(html, /:focus-visible\s*\{[^}]*outline\s*:/s, 'a :focus-visible outline rule exists');
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'reduced-motion is respected');
});

test('8. no keyboard traps: nothing takes positive tabindex and nothing uses accesskey', () => {
  for (const match of html.matchAll(/tabindex\s*=\s*"([^"]+)"/g)) {
    assert.ok(Number(match[1]) <= 0, `tabindex must not be positive, saw ${match[1]}`);
  }
  assert.equal(/accesskey\s*=/i.test(html), false);
});

test('9. tab order is DOM order — every interactive control appears in source order without reordering hints', () => {
  const order = [...html.matchAll(/<(button|a)\b[^>]*\bid="([^"]+)"/g)].map((match) => match[2]);
  assert.deepEqual(order, ['about-open', 'about-close'], 'controls are in logical reading order');
  assert.equal(/tabindex\s*=\s*"\d+"/.test(html), false);
});

test('10. all text reaches the page safely (no markup injection paths)', () => {
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(main), false);
  assert.match(main, /textContent\s*=/, 'text is written with textContent');
});
