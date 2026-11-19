import test from "node:test";
import assert from "node:assert/strict";
import { verifiedBearerSession } from "../apps/web/src/approval-session-claims.mjs";
import { signWorkerApproval } from "../apps/web/src/approval-attestation-worker.mjs";

const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const now = 1800000000;
function token(claim) {
  return [
    "eyJhbGciOiJIUzI1NiJ9",
    Buffer.from(JSON.stringify(claim)).toString("base64url"),
    "synthetic",
  ].join(".");
}
const claims = { sub: ACTOR, session_id: SESSION, exp: now + 60, iat: now - 20 };

test("R3 extracts session only after a separately GoTrue-verified actor is supplied", () => {
  assert.deepEqual(verifiedBearerSession(token(claims), ACTOR, now), {
    actor: ACTOR,
    sessionId: SESSION,
  });
  assert.equal(verifiedBearerSession(token(claims), OTHER, now), null);
});

test("R3 rejects expired or future-issued session claims", () => {
  assert.equal(verifiedBearerSession(token({ ...claims, exp: now }), ACTOR, now), null);
  assert.equal(verifiedBearerSession(token({ ...claims, iat: now + 16 }), ACTOR, now), null);
  assert.equal(verifiedBearerSession(token({ ...claims, exp: "farfuture" }), ACTOR, now), null);
});

test("R3 rejects missing, invalid or altered session and actor IDs", () => {
  for (const c of [
    { ...claims, session_id: null },
    { ...claims, session_id: "not-a-uuid" },
    { ...claims, sub: OTHER },
    { ...claims, sub: undefined },
  ])
    assert.equal(verifiedBearerSession(token(c), ACTOR, now), null);
});

test("R3 rejects malformed, oversized or non-JSON token payloads", () => {
  for (const t of [
    "",
    "abc",
    "a.b",
    "a.b.c.d",
    "a.@@.c",
    "a." + "a".repeat(5000) + ".c",
    "a.bm90LWpzb24.c",
  ]) {
    assert.equal(verifiedBearerSession(t, ACTOR, now), null);
  }
});

test("R3 WebCrypto signatures are bound to exact operation, actor and payload", async () => {
  const key = "ab".repeat(32);
  const options = { issuedAt: now, nonce: SESSION };
  const original = await signWorkerApproval(
    key,
    "submit",
    ACTOR,
    [OTHER, "instructor", "text"],
    options,
  );
  const variants = [
    await signWorkerApproval(key, "submit", OTHER, [OTHER, "instructor", "text"], options),
    await signWorkerApproval(key, "decide", ACTOR, [OTHER, "instructor", "text"], options),
    await signWorkerApproval(key, "submit", ACTOR, [OTHER, "student", "text"], options),
    await signWorkerApproval(
      "cd".repeat(32),
      "submit",
      ACTOR,
      [OTHER, "instructor", "text"],
      options,
    ),
    await signWorkerApproval(key, "submit", ACTOR, [OTHER, "instructor", "text"], {
      ...options,
      nonce: ACTOR,
    }),
  ];
  for (const variant of variants) assert.notEqual(original[2], variant[2]);
});
