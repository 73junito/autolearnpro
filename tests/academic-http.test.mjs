import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../apps/web/src/server.mjs";
import { createAcademic } from "../apps/web/src/academic.mjs";

const instructor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const student = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const courseId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makePool(rowsBySql) {
  const statements = [];
  const pool = {
    connect: async () => ({
      query: async (sql, params) => {
        statements.push({ sql, params });
        for (const [pattern, result] of rowsBySql) {
          if (sql.includes(pattern)) return result;
        }
        return { rows: [] };
      },
      release: () => {}
    }),
    end: async () => {},
    _statements: statements
  };
  return pool;
}

function authFetch(actorId) {
  return async () => ({ ok: true, json: async () => ({ id: actorId }) });
}

function authFetchFail() {
  return async () => ({ ok: false });
}

test("academic HTTP: student can enroll in published course", async (t) => {
  const pool = makePool([
    ["consume_academic_quota", { rows: [{ allowed: true }] }],
    ["alp_courses", { rows: [{ id: courseId, is_published: true }] }],
    ["alp_enrollments", { rows: [] }],
    ["INSERT INTO public.alp_enrollments", { rows: [{ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", student_id: student, course_id: courseId }] }]
  ]);
  const approval = createAcademic({
    authUrl: "http://127.0.0.1:1",
    publishableKey: "public-test-key",
    pool,
    fetchImpl: authFetch(student)
  });
  const server = makeServer({ approval, academic: approval });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/academic/enrollments`, {
    method: "POST",
    headers: { authorization: `Bearer valid-token`, "content-type": "application/json" },
    body: JSON.stringify({ courseId })
  });
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.enrollment.student_id, student);
  assert.equal(json.enrollment.course_id, courseId);
});

test("academic HTTP: cannot enroll in unpublished course", async (t) => {
  const pool = makePool([
    ["consume_academic_quota", { rows: [{ allowed: true }] }],
    ["alp_courses", { rows: [{ id: courseId, is_published: false }] }]
  ]);
  const approval = createAcademic({
    authUrl: "http://127.0.0.1:1",
    publishableKey: "public-test-key",
    pool,
    fetchImpl: authFetch(student)
  });
  const server = makeServer({ approval, academic: approval });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/academic/enrollments`, {
    method: "POST",
    headers: { authorization: `Bearer valid-token`, "content-type": "application/json" },
    body: JSON.stringify({ courseId })
  });
  assert.equal(res.status, 403);
});

test("academic HTTP: rate limit blocks seventh request", async (t) => {
  let consumed = 0;
  const pool = {
    connect: async () => ({
      query: async (sql) => {
        if (sql.includes("consume_academic_quota")) return { rows: [{ allowed: ++consumed <= 60 }] };
        return { rows: [] };
      },
      release() {}
    }),
    async end() {}
  };
  const approval = createAcademic({
    authUrl: "http://127.0.0.1:1",
    publishableKey: "public-test-key",
    pool,
    fetchImpl: authFetch(student)
  });
  const server = makeServer({ approval, academic: approval });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${base}/api/academic/courses`, {
      method: "GET",
      headers: { authorization: `Bearer valid-token` }
    });
    assert.equal(res.status, 200);
  }
  const seventh = await fetch(`${base}/api/academic/courses`, {
    method: "GET",
    headers: { authorization: `Bearer valid-token` }
  });
  assert.equal(seventh.status, 429);
  assert.equal(seventh.headers.get("retry-after"), "60");
});
test("academic HTTP: instructor can create course, student cannot", async (t) => {
  const pool = makePool([
    ["consume_academic_quota", { rows: [{ allowed: true }] }],
    ["alp_role_assignments", { rows: [{ user_id: instructor, role_name: "instructor" }] }],
    ["alp_courses", { rows: [{ id: courseId }] }]
  ]);
  const approval = createAcademic({
    authUrl: "http://127.0.0.1:1",
    publishableKey: "public-test-key",
    pool,
    fetchImpl: authFetch(instructor)
  });
  const server = makeServer({ approval, academic: approval });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/academic/courses`, {
    method: "POST",
    headers: { authorization: `Bearer valid-token`, "content-type": "application/json" },
    body: JSON.stringify({ title: "Introduction to Algebra", description: "A beginner course", is_published: true })
  });
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.ok(json.course);
  assert.equal(json.course.title, "Introduction to Algebra");
  const createStmt = pool._statements.find(s => s.sql.includes("INSERT INTO public.alp_courses"));
  assert.ok(createStmt);
  assert.deepEqual(createStmt.params, [instructor, "Introduction to Algebra", "A beginner course", true]);
});

test("academic HTTP: non-instructor cannot create course", async (t) => {
  const pool = makePool([
    ["consume_academic_quota", { rows: [{ allowed: true }] }],
    ["alp_role_assignments", { rows: [] }]
  ]);
  const approval = createAcademic({
    authUrl: "http://127.0.0.1:1",
    publishableKey: "public-test-key",
    pool,
    fetchImpl: authFetch(student)
  });
  const server = makeServer({ approval, academic: approval });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/academic/courses`, {
    method: "POST",
    headers: { authorization: `Bearer valid-token`, "content-type": "application/json" },
    body: JSON.stringify({ title: "Unauthorized Course" })
  });
  assert.equal(res.status, 403);
});

test("academic HTTP: missing bearer token is rejected", async (t) => {
  const pool = makePool([]);
  const approval = createAcademic({
    authUrl: "http://127.0.0.1:1",
    publishableKey: "public-test-key",
    pool,
    fetchImpl: authFetchFail()
  });
  const server = makeServer({ approval, academic: approval });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/academic/courses`, {
    method: "GET",
    headers: { "content-type": "application/json" }
  });
  assert.equal(res.status, 401);
});

test("academic HTTP: invalid actor UUID is rejected", async (t) => {
  const pool = makePool([]);
  const approval = createAcademic({
    authUrl: "http://127.0.0.1:1",
    publishableKey: "public-test-key",
    pool,
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: "not-a-uuid" }) })
  });
  const server = makeServer({ approval, academic: approval });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/academic/courses`, {
    method: "GET",
    headers: { authorization: `Bearer token`, "content-type": "application/json" }
  });
  assert.equal(res.status, 401);
});
