// C3-R30: root and output validation for future build evidence (C3-R22 readiness).
//
// THIS IS NOT THE R22 PORT. It imports no build tool, runs no build, writes nothing. It exists so the two
// decisions R22 currently gets wrong can be made and tested before any bundler is involved:
//
//   1. R22 derives its root from the module location:  HERE = fileURLToPath(new URL('../../', import.meta.url))
//      and then refuses any root that is not exactly HERE (`root!==HERE`). Moving the module changes the
//      directory depth and the guard silently rejects the real repository. The replacement below takes an
//      EXPLICIT root and validates it against an authorised temporary policy - it does not delete the guard,
//      it re-expresses it in terms that survive relocation.
//   2. R22 checks `inside(temp,out)` and `inside(root,out)` but never asks whether the destination is one it
//      is authorised to write to at all. These helpers require the R28 policy for that.
//
// Dependency-free on purpose: importing this file must never require the build toolchain to be installed.
import fs from 'node:fs';
import path from 'node:path';
import { assertPolicy } from '../library/target-policy.mjs';

const inside = (parent, child) => child.toLowerCase().startsWith((parent + path.sep).toLowerCase());

// Inputs R22's sourceSnapshot() demands. Listed so a future build can fail early and clearly instead of
// throwing R22_SOURCE_MISSING for one file at a time.
export const REQUIRED_BUILD_INPUTS = Object.freeze([
  'package.json',
  'package-lock.json',
  'vite.config.js',
  'catalog.html',
  'index.html',
  'cloudflare/api/wrangler.jsonc',
]);
export const REQUIRED_BUILD_INPUT_DIRS = Object.freeze(['src', 'cloudflare/api/src', 'lib/assets']);

// Validates an explicit repository root against an authorised temporary policy.
// Refuses: absent root, unresolvable root, staging/production policy tier, root outside the policy.
export function assertBuildRoot(policy, rootDir) {
  const authorised = assertPolicy(policy);
  if (typeof rootDir !== 'string') throw Error('R30_ROOT_REQUIRED');
  let root;
  try {
    root = fs.realpathSync(rootDir);
  } catch {
    throw Error('R30_ROOT_UNAVAILABLE');
  }
  if (!inside(authorised.rootDir, root)) throw Error('R30_ROOT_OUTSIDE_POLICY');
  return root;
}

// Validates a build output destination: inside the policy, inside the OS temp tree (assertPolicy enforces
// that for the policy root), not equal to the source root, and empty so evidence cannot be mixed with debris.
export function assertBuildOutput(policy, rootDir, outputRoot) {
  const root = assertBuildRoot(policy, rootDir);
  const authorised = assertPolicy(policy);
  if (typeof outputRoot !== 'string') throw Error('R30_OUTPUT_REQUIRED');
  let out;
  try {
    out = fs.realpathSync(outputRoot);
  } catch {
    throw Error('R30_OUTPUT_UNAVAILABLE');
  }
  if (!inside(authorised.rootDir, out)) throw Error('R30_OUTPUT_OUTSIDE_POLICY');
  if (out.toLowerCase() === root.toLowerCase()) throw Error('R30_OUTPUT_IS_SOURCE_ROOT');
  if (inside(root, out)) throw Error('R30_OUTPUT_INSIDE_SOURCE_ROOT');
  if (fs.readdirSync(out).length) throw Error('R30_OUTPUT_NOT_EMPTY');
  return out;
}

// Reports which inputs required by the R22 snapshot contract are absent. Read-only; never creates anything.
export function inspectBuildInputs(rootDir) {
  let root;
  try {
    root = fs.realpathSync(rootDir);
  } catch {
    return { ok: false, reason: 'R30_ROOT_UNAVAILABLE', missing: [] };
  }
  const missing = [];
  for (const name of REQUIRED_BUILD_INPUTS) {
    if (!fs.existsSync(path.join(root, name))) missing.push(name);
  }
  for (const dir of REQUIRED_BUILD_INPUT_DIRS) {
    if (!fs.existsSync(path.join(root, dir))) missing.push(dir + '/');
  }
  return { ok: missing.length === 0, reason: missing.length ? 'R30_BUILD_INPUTS_MISSING' : null, missing };
}
