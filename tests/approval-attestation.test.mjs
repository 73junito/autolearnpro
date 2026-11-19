import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  validApprovalKey,
  signApprovalOperation
} from "../apps/web/src/approval-attestation.mjs";

const KEY = "a".repeat(64);
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("D02-D: approval attestation fails closed without a 256-bit key", () => {
  for (const key of [undefined, null, "", "abc", "g".repeat(64)]) {
    assert.equal(validApprovalKey(key), false);
    assert.throws(() => signApprovalOperation(key, "submit", ACTOR), /not configured/);
  }
});

test("D02-D: signed operation binds actor, payload, issue time and nonce", () => {
  const reason = "Identity-bound test | includes delimiter and é";
  const args = [TARGET, "instructor", reason];
  const [issued, nonce, signature] = signApprovalOperation(KEY, "submit", ACTOR, args);
  assert.ok(Number.isInteger(issued));
  assert.match(nonce, /^[0-9a-f-]{36}$/);
  assert.match(signature, /^[0-9a-f]{64}$/);
  const parts = ["submit", ACTOR, ...args, String(issued), nonce];
  const bytes = parts.map(v => `${Buffer.byteLength(v, "utf8")}:${v}`).join("|");
  const expected = createHmac("sha256", Buffer.from(KEY, "hex"))
    .update(bytes, "utf8").digest("hex");
  assert.equal(signature, expected);
});

test("D02-D: separate attestation calls use distinct single-use nonces", () => {
  const first = signApprovalOperation(KEY, "quota", ACTOR);
  const second = signApprovalOperation(KEY, "quota", ACTOR);
  assert.notEqual(first[1], second[1]);
  assert.notEqual(first[2], second[2]);
});
