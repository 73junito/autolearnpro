import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import pg from "pg";
import { makeServer } from "../apps/web/src/server.mjs";
import { createAcademic } from "../apps/web/src/academic.mjs";

const ADMIN = process.env.ALP_R1_DATABASE_URL;
const APP = process.env.ALP_R1_APP_DATABASE_URL;
const MARKER = process.env.ALP_R1_EXPECTED_MARKER;
const REQUIRED = process.env.ALP_R1_REQUIRE === "1";
const instructor = "55555555-5555-4555-8555-555555555555";
const student = "66666666-6666-4666-8666-666666666666";

function validateLocal(url) {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) ||
      ["5432", "54322", "55322", "55622"].includes(parsed.port) ||
      /foundation|replay|disposable/i.test(parsed.pathname)) {
    throw new Error("R1 live test requires a scratch-only loopback database");
  }
  return parsed;
}
if (REQUIRED && (!ADMIN || !APP || !MARKER)) {
  throw new Error("R1 live verification required, but scratch connection/marker settings are absent");
}
if (ADMIN || APP) {
  if (!ADMIN || !APP || !MARKER) throw new Error("R1 scratch connections must be paired with a marker");
  const a = validateLocal(ADMIN), b = validateLocal(APP);
  if (a.hostname !== b.hostname || a.port !== b.port || a.pathname !== b.pathname) {
    throw new Error("admin and app connections must target the same marked scratch database");
  }
}

test("R1 restricted application HTTP and privileged-login rejection", { skip: !ADMIN, timeout: 30000 }, async (t) => {
  const admin = new pg.Pool({ connectionString: ADMIN, max: 2 });
  let courseId = null;
  let server = null;
  let privileged = null;
  try {
    const marker = await admin.query("SELECT token FROM alp_verification.marker");
    assert.equal(marker.rows[0]?.token, MARKER, "scratch marker must match before fixture writes");
  } catch (error) {
    await admin.end();
    throw error;
  }
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (privileged) await privileged.close();
    if (courseId) {
      await admin.query("DELETE FROM public.alp_enrollments WHERE course_id = $1", [courseId]);
      await admin.query("DELETE FROM public.alp_courses WHERE id = $1", [courseId]);
    }
    await admin.query("DELETE FROM alp_private.alp_academic_rate_limits WHERE actor_id = ANY($1)", [[instructor, student]]);
    await admin.query("DELETE FROM alp_private.alp_security_events WHERE actor_id = ANY($1)", [[instructor, student]]);
    await admin.query("DELETE FROM alp_private.alp_role_assignments WHERE user_id = ANY($1)", [[instructor, student]]);
    await admin.query("DELETE FROM auth.users WHERE id = ANY($1)", [[instructor, student]]);
    await admin.end();
  });
  await admin.query("INSERT INTO auth.users(id,email) VALUES ($1,$2),($3,$4) ON CONFLICT(id) DO NOTHING",
    [instructor, "r1-http-instructor@example.test", student, "r1-http-student@example.test"]);
  await admin.query("INSERT INTO alp_private.alp_role_assignments(user_id,role_name) VALUES ($1,'instructor') ON CONFLICT DO NOTHING", [instructor]);

  const fetchImpl = async (_url, opts) => {
    const token = opts.headers.authorization;
    const id = token === "Bearer instructor-token" ? instructor :
      token === "Bearer student-token" ? student : null;
    return id ? { ok: true, json: async () => ({ id }) } : { ok: false };
  };
  const academic = createAcademic({
    authUrl: "http://127.0.0.1:1", publishableKey: "scratch-publishable",
    databaseUrl: APP, fetchImpl
  });
  server = makeServer({ academic });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (endpoint, token, options={}) => fetch(base+endpoint, {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }
  });

  const created = await request("/api/academic/courses", "instructor-token", {
    method: "POST", body: JSON.stringify({ title: "R1 scratch course", is_published: true })
  });
  assert.equal(created.status, 201, "instructor course creation uses restricted RLS");
  courseId = (await created.json()).course.id;

  const list = await request("/api/academic/courses", "student-token");
  assert.equal(list.status, 200);
  assert.ok((await list.json()).courses.some((course) => course.id === courseId));

  const enrolled = await request("/api/academic/enrollments", "student-token", {
    method: "POST", body: JSON.stringify({ courseId })
  });
  assert.equal(enrolled.status, 201);

  const forbidden = await request("/api/academic/courses", "student-token", {
    method: "POST", body: JSON.stringify({ title: "Unauthorized" })
  });
  assert.equal(forbidden.status, 403);
  const denied = await admin.query(
    "SELECT 1 FROM alp_private.alp_security_events WHERE actor_id=$1 AND event_name='approval_denied'",
    [student]
  );
  assert.ok(denied.rowCount > 0, "restricted audit insert records denied course action");

  privileged = createAcademic({
    authUrl: "http://127.0.0.1:1", publishableKey: "scratch-publishable",
    databaseUrl: ADMIN, fetchImpl
  });
  const fakeReq = {url: "/api/academic/courses", method:"GET", headers:{authorization:"Bearer student-token"}};
  let rejectedStatus = null;
  const fakeRes = {writeHead:(n)=>{rejectedStatus=n;}, end:()=>{}, setHeader:()=>{}};
  await privileged.process(fakeReq,fakeRes);
  assert.equal(rejectedStatus,503,"privileged database logins are refused");
});
