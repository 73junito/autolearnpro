// C3-R28 Phase A: library target authorization policy.
//
// This module answers exactly one question: may this caller read/generate against these paths, in this tier?
// It is the single place that decides, and it refuses to authorise any tier except temporary scratch.
//
// TIER SEPARATION (see docs/c3-r28/C3-R28-TARGET-POLICY-DECISION.md):
//   temporary  - issuable now    - root must resolve inside the OS temp directory
//   staging    - NOT issuable    - R28_STAGING_NOT_AUTHORIZED (needs a separate, recorded decision)
//   production - NOT issuable    - R28_PRODUCTION_NOT_AUTHORIZED (no such authorization mechanism exists)
//
// The structural control is containment, not a denylist: because the root must live inside os.tmpdir(), a
// production or staging destination cannot be expressed at all. A path-name blocklist would be weaker.
//
// NODE-ONLY. Never import from the Cloudflare Worker, a request handler, or a route.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertTargetsApproved } from './library-pair-recovery.mjs';
import { assertDistinctTargets } from './library-pair-reader.mjs';

export const TARGET_TIERS = Object.freeze({
  TEMPORARY: 'temporary',
  STAGING: 'staging',
  PRODUCTION: 'production',
});

const inside = (parent, child) => child.toLowerCase().startsWith((parent + path.sep).toLowerCase());
const withinOrEqual = (parent, child) => child.toLowerCase() === parent.toLowerCase() || inside(parent, child);

// Re-derives every invariant from the VALUES in the object. A caller can hand-craft an object literal that
// looks like a policy, so nothing here trusts the shape, the tier string, or a `publicationAuthorized` flag:
// all of them are re-computed. This is why assertPolicy exists separately from createTargetPolicy.
export function assertPolicy(policy) {
  if (!policy || typeof policy !== 'object') throw Error('R28_POLICY_REQUIRED');
  if (policy.tier !== TARGET_TIERS.TEMPORARY) {
    if (policy.tier === TARGET_TIERS.STAGING) throw Error('R28_STAGING_NOT_AUTHORIZED');
    if (policy.tier === TARGET_TIERS.PRODUCTION) throw Error('R28_PRODUCTION_NOT_AUTHORIZED');
    throw Error('R28_POLICY_TIER_UNKNOWN');
  }
  if (policy.publicationAuthorized !== false) throw Error('R28_PUBLICATION_FLAG_INVALID');
  if (typeof policy.rootDir !== 'string') throw Error('R28_ROOT_REQUIRED');
  const targets = assertDistinctTargets(assertTargetsApproved(policy.targets));
  let root;
  let temp;
  try {
    root = fs.realpathSync(policy.rootDir);
    temp = fs.realpathSync(os.tmpdir());
  } catch {
    throw Error('R28_ROOT_UNAVAILABLE');
  }
  if (!inside(temp, root)) throw Error('R28_ROOT_NOT_TEMPORARY');
  return Object.freeze({
    tier: TARGET_TIERS.TEMPORARY,
    rootDir: root,
    targets,
    publicationAuthorized: false,
  });
}

export function createTargetPolicy({ tier, rootDir, targets } = {}) {
  if (!Object.values(TARGET_TIERS).includes(tier)) throw Error('R28_POLICY_TIER_UNKNOWN');
  // Refused before any filesystem access: no staging or production policy can be constructed in C3-R28.
  if (tier === TARGET_TIERS.STAGING) throw Error('R28_STAGING_NOT_AUTHORIZED');
  if (tier === TARGET_TIERS.PRODUCTION) throw Error('R28_PRODUCTION_NOT_AUTHORIZED');
  return assertPolicy({ tier, rootDir, targets, publicationAuthorized: false });
}

// Used by write-capable callers: confirms the destination is inside the authorised root.
export function assertDestinationInsidePolicy(policy, destination) {
  const authorised = assertPolicy(policy);
  if (typeof destination !== 'string') throw Error('R28_DESTINATION_REQUIRED');
  let resolved;
  try {
    resolved = fs.realpathSync(destination);
  } catch {
    throw Error('R28_DESTINATION_UNAVAILABLE');
  }
  if (!withinOrEqual(authorised.rootDir, resolved)) throw Error('R28_DESTINATION_OUTSIDE_POLICY');
  return resolved;
}
