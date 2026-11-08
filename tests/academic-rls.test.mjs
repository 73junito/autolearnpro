import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

// Direct-database authorization tests for R1.
// Proves PostgreSQL row level security isolates academic data when queries run
// as the restricted alp_academic_executor role, independently of any
// application-level ownership check.
//
// Actor binding MUST match auth.uid() in the academic policies.
// The API binds verified request.jwt.claim.sub, transaction-locally.

const DB = process.env.ALP_R1_DATABASE_URL;
const REQUIRE = process.env.ALP_R1_REQUIRE === "1";

// Ports of databases that must never receive fixture writes.
const FORBIDDEN_PORTS = new Set(["5432", "54322", "55322", "55622"]);
const FORBIDDEN_HINTS = ["foundation", "replay", "disposable"];

function assertSafeTarget(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("ALP_R1_DATABASE_URL is not a valid URL"); }
  const host = u.hostname;
  const port = u.port;
  const dbName = (u.pathname || "").replace(/^\//, "");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error(`refusing to run against non-loopback host: ${host}`);
  }
  if (FORBIDDEN_PORTS.has(port)) {
    throw new Error(`refusing to run against protected/reserved port: ${port}`);
  }
  for (const hint of FORBIDDEN_HINTS) {
    if (dbName.toLowerCase().includes(hint)) {
      throw new Error(`refusing to run against protected database name: ${dbName}`);
    }
  }
}

if (!DB && REQUIRE) {
  throw new Error("ALP_R1_REQUIRE=1 but ALP_R1_DATABASE_URL is not set; refusing to report a skip as success");
}
if (DB) assertSafeTarget(DB);

// A port or URL guard cannot prove WHICH database is on the other end: a
// protected database could be reachable through another port or an SSH tunnel.
// So the harness also requires an explicit marker written by sql/mark-database.sql.
const EXPECTED_MARKER = process.env.ALP_R1_EXPECTED_MARKER;
if (DB && !EXPECTED_MARKER) {
  throw new Error(
    "ALP_R1_EXPECTED_MARKER is required when ALP_R1_DATABASE_URL is set; " +
    "mark the target with sql/mark-database.sql first"
  );
}

async function assertMarkedDatabase(admin) {
  let token;
  try {
    const res = await admin.query("SELECT token FROM alp_verification.marker");
    token = res.rows[0] && res.rows[0].token;
  } catch (e) {
    throw new Error(
      "target database is not marked (" + (e.code || e.message) + "); refusing to create " +
      "fixtures. Run sql/mark-database.sql against the verification database."
    );
  }
  if (token !== EXPECTED_MARKER) {
    throw new Error(
      "target database marker does not match ALP_R1_EXPECTED_MARKER; refusing to " +
      "create fixtures. This is not the intended disposable database."
    );
  }
}

const skip = !DB;
const IDS = {
  instructorA: "11111111-1111-4111-8111-111111111111",
  instructorB: "22222222-2222-4222-8222-222222222222",
  studentA: "33333333-3333-4333-8333-333333333333",
  studentB: "44444444-4444-4444-8444-444444444444"
};
const COURSES = {
  publishedA: "aaaa0001-0000-4000-8000-000000000001",
  unpublishedA: "aaaa0001-0000-4000-8000-000000000002",
  publishedB: "bbbb0001-0000-4000-8000-000000000001"
};
const LESSON_A = "11110000-0000-4000-8000-000000000001";
const PROGRESS_A = "99990000-0000-4000-8000-000000000001";

async function setupFixtures(admin) {
  await admin.query(
    "INSERT INTO auth.users (id,email) VALUES ($1,$2),($3,$4),($5,$6),($7,$8) ON CONFLICT (id) DO NOTHING",
    [IDS.instructorA, "r1-ia@example.test", IDS.instructorB, "r1-ib@example.test",
     IDS.studentA, "r1-sa@example.test", IDS.studentB, "r1-sb@example.test"]
  );
  await admin.query(
    "INSERT INTO alp_private.alp_role_assignments(user_id,role_name) VALUES ($1,'instructor'),($2,'instructor') ON CONFLICT DO NOTHING",
    [IDS.instructorA, IDS.instructorB]
  );
  await admin.query(
    "INSERT INTO public.alp_courses (id,instructor_id,title,is_published) VALUES ($1,$2,$3,true),($4,$2,$5,false),($6,$7,$8,true) ON CONFLICT (id) DO NOTHING",
    [COURSES.publishedA, IDS.instructorA, "R1 A published",
     COURSES.unpublishedA, "R1 A unpublished",
     COURSES.publishedB, IDS.instructorB, "R1 B published"]
  );
  await admin.query(
    "INSERT INTO public.alp_enrollments (student_id,course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [IDS.studentA, COURSES.publishedA]
  );
  await admin.query(
    "INSERT INTO public.alp_lessons (id,course_id,instructor_id,title) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
    [LESSON_A, COURSES.publishedA, IDS.instructorA, "R1 lesson"]
  );
  await admin.query(
    "INSERT INTO public.alp_academic_progress (id,student_id,lesson_id,course_id,status) VALUES ($1,$2,$3,$4,'started') ON CONFLICT (id) DO NOTHING",
    [PROGRESS_A, IDS.studentA, LESSON_A, COURSES.publishedA]
  );
}

async function cleanupFixtures(admin) {
  const courses = [COURSES.publishedA, COURSES.unpublishedA, COURSES.publishedB];
  const users = [IDS.instructorA, IDS.instructorB, IDS.studentA, IDS.studentB];
  await admin.query("DELETE FROM public.alp_academic_progress WHERE course_id = ANY($1)", [courses]).catch(() => {});
  await admin.query("DELETE FROM public.alp_lessons WHERE course_id = ANY($1)", [courses]).catch(() => {});
  await admin.query("DELETE FROM public.alp_enrollments WHERE course_id = ANY($1)", [courses]).catch(() => {});
  await admin.query("DELETE FROM public.alp_courses WHERE id = ANY($1)", [courses]).catch(() => {});
  await admin.query("DELETE FROM public.alp_learning_pathways WHERE instructor_id = ANY($1)", [users]).catch(() => {});
  await admin.query("DELETE FROM alp_private.alp_role_assignments WHERE user_id = ANY($1)", [users]).catch(() => {});
  await admin.query("DELETE FROM alp_private.alp_academic_rate_limits WHERE actor_id = ANY($1)", [users]).catch(() => {});
  await admin.query("DELETE FROM auth.users WHERE id = ANY($1)", [users]).catch(() => {});
}

// Runs fn as alp_academic_executor with the actor bound in the SAME GUC the
// policies read: request.jwt.claim.sub through auth.uid(), transaction-local.
async function asActor(pool, actor, fn, { commit = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE alp_academic_executor");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [actor]);
    const result = await fn(client);
    if (commit) await client.query("COMMIT");
    return result;
  } finally {
    try { await client.query("ROLLBACK"); } catch {}
    client.release();
  }
}

test("R1 direct database authorization under alp_academic_executor", { skip, timeout: 60000 }, async (t) => {
  const admin = new pg.Pool({ connectionString: DB, max: 4 });

  // Validate the target BEFORE registering cleanup, so no DELETE is ever issued
  // against a database that has not been explicitly marked for R1.
  try {
    await assertMarkedDatabase(admin);
  } catch (e) {
    try { await admin.end(); } catch {}
    throw e;
  }

  // Cleanup registered next so it also runs when setup or an assertion throws.
  t.after(async () => {
    try { await cleanupFixtures(admin); } catch {}
    try { await admin.end(); } catch {}
  });
  await setupFixtures(admin);

  // --- role integrity ---
  const role = (await admin.query(
    "SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'alp_academic_executor'"
  )).rows[0];
  assert.ok(role, "alp_academic_executor must exist; run the activation migration first");
  assert.equal(role.rolsuper, false);
  assert.equal(role.rolbypassrls, false, "executor must not bypass RLS");
  assert.equal(role.rolcanlogin, false);
  assert.equal(role.rolcreatedb, false);
  assert.equal(role.rolcreaterole, false);

  // --- binding must be visible AND assertions must run as the restricted role ---
  const who = await asActor(admin, IDS.studentA, async (c) => {
    const me = await c.query("SELECT current_user AS u, alp_private.alp_current_actor() AS a");
    return me.rows[0];
  });
  assert.equal(who.u, "alp_academic_executor", "assertions must run as the restricted role");
  assert.equal(who.a, IDS.studentA, "bound actor must resolve through request.jwt.claim.sub");

  // --- student isolation ---
  const aEnroll = await asActor(admin, IDS.studentA, (c) =>
    c.query("SELECT student_id FROM public.alp_enrollments"));
  assert.equal(aEnroll.rowCount, 1, "student A sees exactly their own enrollment");
  assert.equal(aEnroll.rows[0].student_id, IDS.studentA);

  const bEnroll = await asActor(admin, IDS.studentB, (c) =>
    c.query("SELECT student_id FROM public.alp_enrollments"));
  assert.equal(bEnroll.rowCount, 0, "student B sees none of student A enrollments");

  // --- published vs unpublished visibility ---
  const aCourses = await asActor(admin, IDS.studentA, (c) =>
    c.query("SELECT id FROM public.alp_courses"));
  const aCourseIds = aCourses.rows.map((r) => r.id);
  assert.ok(aCourseIds.includes(COURSES.publishedA), "published course visible");
  assert.ok(aCourseIds.includes(COURSES.publishedB), "other published course visible");
  assert.ok(!aCourseIds.includes(COURSES.unpublishedA), "unpublished course hidden from student");

  // --- instructor ownership ---
  const aInstr = await asActor(admin, IDS.instructorA, (c) =>
    c.query("SELECT id FROM public.alp_courses"));
  const aInstrIds = aInstr.rows.map((r) => r.id);
  assert.ok(aInstrIds.includes(COURSES.unpublishedA), "instructor sees own unpublished course (R9)");
  assert.ok(aInstrIds.includes(COURSES.publishedB), "published courses are visible to any authenticated actor");

  const bInstr = await asActor(admin, IDS.instructorB, (c) =>
    c.query("SELECT id FROM public.alp_courses WHERE id = $1", [COURSES.unpublishedA]));
  assert.equal(bInstr.rowCount, 0, "cross-instructor unpublished access denied");

  // --- enrollment visibility for instructors ---
  const aEnrInstr = await asActor(admin, IDS.instructorA, (c) =>
    c.query("SELECT course_id FROM public.alp_enrollments"));
  assert.ok(aEnrInstr.rows.some((r) => r.course_id === COURSES.publishedA), "owner sees own course enrollments");

  const bEnrInstr = await asActor(admin, IDS.instructorB, (c) =>
    c.query("SELECT course_id FROM public.alp_enrollments WHERE course_id = $1", [COURSES.publishedA]));
  assert.equal(bEnrInstr.rowCount, 0, "unrelated instructor sees no enrollments");

  // --- progress isolation ---
  const aProg = await asActor(admin, IDS.studentA, (c) =>
    c.query("SELECT id FROM public.alp_academic_progress"));
  assert.equal(aProg.rowCount, 1, "student A sees own progress");

  const bProg = await asActor(admin, IDS.studentB, (c) =>
    c.query("SELECT id FROM public.alp_academic_progress"));
  assert.equal(bProg.rowCount, 0, "student B sees no progress rows");

  const ownUpdate = await asActor(admin, IDS.studentA, (c) =>
    c.query("UPDATE public.alp_academic_progress SET status = 'in_progress' WHERE id = $1 RETURNING id", [PROGRESS_A]));
  assert.equal(ownUpdate.rowCount, 1, "owner may update own progress");

  const crossUpdate = await asActor(admin, IDS.studentB, (c) =>
    c.query("UPDATE public.alp_academic_progress SET status = 'completed' WHERE id = $1 RETURNING id", [PROGRESS_A]));
  assert.equal(crossUpdate.rowCount, 0, "cross-student progress update blocked by RLS");

  // --- negative writes must fail at the database, not merely in the app ---
  await assert.rejects(
    () => asActor(admin, IDS.studentA, (c) =>
      c.query("INSERT INTO public.alp_courses (instructor_id,title,is_published) VALUES ($1,'hack',true)", [IDS.studentA])),
    /row-level security|violates/i,
    "student cannot insert an instructor course"
  );

  await assert.rejects(
    () => asActor(admin, IDS.studentA, (c) =>
      c.query("INSERT INTO public.alp_enrollments (student_id,course_id) VALUES ($1,$2)", [IDS.studentB, COURSES.publishedA])),
    /row-level security|violates/i,
    "student cannot enroll another student"
  );

  await assert.rejects(
    () => asActor(admin, IDS.studentA, (c) =>
      c.query("DELETE FROM public.alp_academic_progress WHERE id = $1", [PROGRESS_A])),
    /permission denied|cannot delete/i,
    "executor has no DELETE privilege"
  );

  // --- a rejected statement must not poison the connection ---
  const afterFailure = await asActor(admin, IDS.studentA, async (c) => {
    await assert.rejects(
      () => c.query("INSERT INTO public.alp_courses (instructor_id,title,is_published) VALUES ($1,'hack2',true)", [IDS.studentA]),
      /row-level security|violates/i
    );
    await c.query("ROLLBACK");
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE alp_academic_executor");
    await c.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [IDS.studentA]);
    const ok = await c.query("SELECT 1 AS ok");
    return ok.rows[0].ok;
  });
  assert.equal(afterFailure, 1, "connection remains usable after a rejected statement");

  // --- quota binds to the authenticated actor ---
  const quota = await asActor(admin, IDS.studentA, (c) =>
    c.query("SELECT alp_private.consume_academic_quota($1, 'read', 5) AS allowed", [IDS.studentA]), { commit: true });
  assert.equal(quota.rows[0].allowed, true);
  const quotaRows = (await admin.query(
    "SELECT actor_id FROM alp_private.alp_academic_rate_limits WHERE actor_id = ANY($1)", [[IDS.studentA, IDS.studentB]]
  )).rows;
  assert.ok(quotaRows.some((r) => r.actor_id === IDS.studentA), "quota consumed for the bound actor");
  assert.ok(!quotaRows.some((r) => r.actor_id === IDS.studentB), "no quota consumed for another actor");

  // --- connection reuse must not leak actor identity ---
  const reused = await admin.connect();
  try {
    await reused.query("BEGIN");
    await reused.query("SET LOCAL ROLE alp_academic_executor");
    await reused.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [IDS.studentA]);
    const first = await reused.query("SELECT count(*)::int AS n FROM public.alp_enrollments");
    assert.equal(first.rows[0].n, 1, "actor A on the pooled connection sees own enrollment");
    await reused.query("ROLLBACK");

    await reused.query("BEGIN");
    await reused.query("SET LOCAL ROLE alp_academic_executor");
    await reused.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [IDS.studentB]);
    const second = await reused.query("SELECT count(*)::int AS n FROM public.alp_enrollments");
    assert.equal(second.rows[0].n, 0, "actor B on the same connection sees no A data");
    await reused.query("ROLLBACK");

    // Without a bound actor the same connection must see nothing (fail closed).
    await reused.query("BEGIN");
    await reused.query("SET LOCAL ROLE alp_academic_executor");
    const unbound = await reused.query("SELECT count(*)::int AS n FROM public.alp_enrollments");
    assert.equal(unbound.rows[0].n, 0, "no bound actor means no rows (fail closed)");
    await reused.query("ROLLBACK");
  } finally {
    reused.release();
  }
});
