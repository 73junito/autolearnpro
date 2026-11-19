import test from "node:test";
import assert from "node:assert/strict";
import { createApprovalSessionBroker } from "../apps/web/src/worker-approval-session-broker.mjs";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function fakeDb(values = [true]) {
  const queries = [];
  const db = {
    async withTransaction(callback) {
      return callback({
        async query(statement, params) {
          queries.push({ statement, params });
          const state = values.shift();
          if (state instanceof Error) throw state;
          return { rows: state === "malformed" ? [] : [{ active: state }] };
        },
      });
    },
  };
  return { db, queries };
}

test("R3B refuses to start without restricted transactions", () => {
  assert.throws(() => createApprovalSessionBroker(), /restricted database/);
  assert.throws(() => createApprovalSessionBroker({ db: {} }), /restricted database/);
});

test("R3B checks the active session using parameterized actor and session IDs", async () => {
  const { db, queries } = fakeDb([true]);
  assert.equal(await createApprovalSessionBroker({ db })({ actor: A, sessionId: S }), true);
  assert.deepEqual(queries, [
    {
      statement: "SELECT alp_private.approval_session_active($1::uuid,$2::uuid) AS active",
      params: [A, S],
    },
  ]);
});

test("R3B revoked session denies and never caches a prior success", async () => {
  const { db, queries } = fakeDb([true, false]);
  const check = createApprovalSessionBroker({ db });
  assert.equal(await check({ actor: A, sessionId: S }), true);
  assert.equal(await check({ actor: A, sessionId: S }), false);
  assert.equal(queries.length, 2);
});

test("R3B rejects malformed identities before database access", async () => {
  const { db, queries } = fakeDb();
  const check = createApprovalSessionBroker({ db });
  for (const identity of [
    {},
    { actor: A },
    { sessionId: S },
    { actor: "not-uuid", sessionId: S },
    { actor: A, sessionId: "invalid" },
    { actor: { toString: () => A }, sessionId: S },
  ])
    assert.equal(await check(identity), false);
  assert.equal(queries.length, 0);
});

test("R3B missing or malformed database result fails closed", async () => {
  for (const answer of ["malformed", "true", null]) {
    const { db } = fakeDb([answer]);
    await assert.rejects(
      createApprovalSessionBroker({ db })({ actor: A, sessionId: S }),
      /invalid response/,
    );
  }
});

test("R3B query failure propagates to outer handler as unavailable", async () => {
  const { db } = fakeDb([new Error("synthetic connection failure")]);
  await assert.rejects(
    createApprovalSessionBroker({ db })({ actor: A, sessionId: S }),
    /connection failure/,
  );
});
