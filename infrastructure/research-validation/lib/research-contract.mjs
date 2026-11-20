/**
 * Research reference contract.
 *
 * Pure validation and lifecycle rules shared by the Worker, the tooling and the
 * tests.
 *
 * Two boundaries are enforced here rather than documented elsewhere:
 *
 * 1. Only an allow-listed projection of upstream metadata may leave the system.
 *    Semantic Scholar returns much more than is needed for citation discovery;
 *    abstracts, full text, figures and open-access links are deliberately not
 *    carried, because retrieving metadata is not permission to republish it.
 * 2. A reference can only become `accepted` when a human reviewer has recorded
 *    relevance, permitted use and a citation. Accepting a reference never
 *    generates a competency, a lesson or an assessment item.
 */

export const RESEARCH_SCHEMA_VERSION = '1.0.0';

/** Review states, in workflow order. */
export const RESEARCH_STATES = Object.freeze([
  'discovered', 'screened', 'rights_checked', 'reviewed', 'accepted', 'rejected'
]);

export const PERMITTED_USE = Object.freeze([
  'citation_only', 'metadata_display', 'internal_reference', 'not_permitted'
]);

export const REVIEWER_ROLES = Object.freeze(['curriculum-developer', 'curriculum-reviewer', 'research-reviewer']);

export const PROVIDERS = Object.freeze(['semantic-scholar']);

/**
 * The only upstream fields this platform may retain or display. Anything else is
 * dropped by `projectMetadata`, including abstracts and access links.
 */
export const APPROVED_METADATA_FIELDS = Object.freeze([
  'paperId', 'title', 'authors', 'year', 'doi', 'venue', 'url', 'citationCount'
]);

/** Fields that are explicitly never stored, even if upstream returns them. */
export const WITHHELD_FIELDS = Object.freeze([
  'abstract', 'tldr', 'openAccessPdf', 'references', 'citations', 'embedding', 'fieldsOfStudy'
]);

/**
 * Allowed transitions. `rejected` is reachable from any pre-accepted state; an
 * accepted reference is terminal because it is already published evidence.
 */
export const TRANSITIONS = Object.freeze({
  'discovered->screened': { roles: ['curriculum-developer', 'research-reviewer'], toolingAllowed: true },
  'discovered->rejected': { roles: ['curriculum-developer', 'research-reviewer'], toolingAllowed: false },
  'screened->rights_checked': { roles: ['curriculum-developer', 'research-reviewer'], toolingAllowed: false },
  'screened->rejected': { roles: ['curriculum-developer', 'research-reviewer'], toolingAllowed: false },
  'rights_checked->reviewed': { roles: ['research-reviewer'], toolingAllowed: false },
  'rights_checked->rejected': { roles: ['research-reviewer'], toolingAllowed: false },
  'reviewed->accepted': { roles: ['research-reviewer'], toolingAllowed: false },
  'reviewed->rejected': { roles: ['research-reviewer'], toolingAllowed: false }
});

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const PAPER_ID_PATTERN = /^[a-f0-9]{40}$|^[A-Za-z0-9._:-]{2,120}$/;

/**
 * Project an upstream paper onto the approved metadata fields.
 *
 * Unknown and withheld fields never reach the caller, so no route can leak an
 * abstract by accident.
 *
 * @param {object} paper
 * @returns {object|null}
 */
export function projectMetadata(paper) {
  if (!isPlainObject(paper)) return null;
  const authors = Array.isArray(paper.authors)
    ? paper.authors
      .map((author) => (typeof author === 'string' ? author : author?.name))
      .filter((name) => typeof name === 'string' && name.trim().length > 0)
      .map((name) => name.trim())
    : [];

  const doi = paper.externalIds?.DOI ?? paper.doi ?? null;
  return {
    paperId: typeof paper.paperId === 'string' ? paper.paperId : null,
    title: typeof paper.title === 'string' ? paper.title.trim() : null,
    authors,
    year: Number.isInteger(paper.year) ? paper.year : null,
    doi: typeof doi === 'string' ? doi : null,
    venue: typeof paper.venue === 'string' && paper.venue.trim().length > 0 ? paper.venue.trim() : null,
    url: typeof paper.url === 'string' ? paper.url : null,
    citationCount: Number.isInteger(paper.citationCount) ? paper.citationCount : null
  };
}

/** Keys that a projection must never contain. */
export function withheldKeysPresent(projected) {
  if (!isPlainObject(projected)) return [...WITHHELD_FIELDS];
  const present = [];
  for (const key of WITHHELD_FIELDS) if (Object.hasOwn(projected, key)) present.push(key);
  for (const key of Object.keys(projected)) {
    if (!APPROVED_METADATA_FIELDS.includes(key)) present.push(key);
  }
  return [...new Set(present)];
}

/**
 * Validate a stored reference.
 *
 * @param {object} reference
 * @returns {{valid: boolean, issues: string[]}}
 */
export function validateReference(reference) {
  const issues = [];
  if (!isPlainObject(reference)) return { valid: false, issues: ['invalid_reference'] };

  if (reference.provider !== 'semantic-scholar') issues.push(`unsupported_provider:${reference.provider}`);
  if (typeof reference.paperId !== 'string' || !PAPER_ID_PATTERN.test(reference.paperId)) issues.push('invalid_paper_id');
  if (typeof reference.title !== 'string' || reference.title.trim().length === 0) issues.push('missing_title');
  if (!Array.isArray(reference.authors)) issues.push('invalid_authors');
  if (reference.year !== null && !Number.isInteger(reference.year)) issues.push('invalid_year');
  if (Number.isInteger(reference.year) && (reference.year < 1500 || reference.year > 2200)) {
    issues.push('implausible_year');
  }
  if (!RESEARCH_STATES.includes(reference.reviewState)) issues.push(`invalid_review_state:${reference.reviewState}`);
  if (!PERMITTED_USE.includes(reference.permittedUse)) issues.push(`invalid_permitted_use:${reference.permittedUse}`);

  for (const key of Object.keys(reference)) {
    if (WITHHELD_FIELDS.includes(key)) issues.push(`withheld_field_present:${key}`);
  }

  if (reference.reviewState === 'accepted') {
    if (typeof reference.reviewer !== 'string' || reference.reviewer.length === 0) issues.push('accepted_without_reviewer');
    if (typeof reference.reviewedAt !== 'string' || reference.reviewedAt.length === 0) issues.push('accepted_without_review_date');
    if (typeof reference.relevance !== 'string' || reference.relevance.trim().length === 0) issues.push('accepted_without_relevance');
    if (typeof reference.citation !== 'string' || reference.citation.trim().length === 0) issues.push('accepted_without_citation');
    if (reference.permittedUse === 'not_permitted') issues.push('accepted_without_permission');
  }
  if (reference.reviewState === 'rejected' && typeof reference.reviewer !== 'string') {
    issues.push('rejected_without_reviewer');
  }

  const retrievedAt = reference.retrievedAt;
  if (typeof retrievedAt !== 'string' || Number.isNaN(Date.parse(retrievedAt))) issues.push('missing_retrieval_date');
  return { valid: issues.length === 0, issues };
}

/**
 * Decide whether a transition is permitted.
 *
 * @param {string} from
 * @param {string} to
 * @param {{actorId?: string, actorKind?: string, roles?: string[]}} actor
 */
export function canAdvance(from, to, actor = {}) {
  const rule = TRANSITIONS[`${from}->${to}`];
  if (!rule) return { allowed: false, reason: `transition_not_permitted:${from}->${to}` };
  const { actorId = null, actorKind = null, roles = [] } = actor;
  if (!actorId) return { allowed: false, reason: 'actor_required' };
  if (actorKind !== 'human' && actorKind !== 'tool') return { allowed: false, reason: 'actor_kind_required' };
  if (actorKind === 'tool' && rule.toolingAllowed !== true) return { allowed: false, reason: 'human_actor_required' };
  if (!Array.isArray(roles) || roles.length === 0) return { allowed: false, reason: 'roles_required' };
  const authorised = roles.some((role) => REVIEWER_ROLES.includes(role) && rule.roles.includes(role));
  if (!authorised) return { allowed: false, reason: `role_not_authorised:${roles.join('|')}` };
  return { allowed: true, reason: null };
}

/** Issues that prevent a reference from being shown alongside a course. */
export function displayIssues(reference) {
  const issues = [];
  if (!isPlainObject(reference)) return ['invalid_reference'];
  if (reference.reviewState !== 'accepted') issues.push(`not_accepted:${reference.reviewState}`);
  if (reference.permittedUse === 'not_permitted') issues.push('permitted_use_not_granted');
  if (!reference.citation) issues.push('missing_citation');
  return issues;
}
