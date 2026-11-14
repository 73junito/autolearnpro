import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import pg from "pg";
import { makeServer } from "../apps/web/src/server.mjs";
import { createAcademic } from "../apps/web/src/academic.mjs";

test("live academic: enrollment, isolation, and instructor ownership", { timeout: 120000, skip: !process.env.ALP_LOCAL_INTEGRATION }, async () => {
  const supabaseUrl = process.env.ALP_SUPABASE_URL;
  const publicKey = process.env.ALP_SUPABASE_PUBLISHABLE_KEY;
  const databaseUrl = process.env.ALP_DATABASE_URL;
  assert.ok(supabaseUrl?.startsWith("http://127.0.0.1:"));
  assert.ok(publicKey && databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ids = [];
  const academic = createAcademic({ authUrl: supabaseUrl, publishableKey: publicKey, pool });
  const server = makeServer({ academic });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const runId = crypto.randomUUID().replaceAll("-", "");
  const password = "Local-Test-7!" + crypto.randomUUID();
  const signup = async (label) => {
    const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: "POST", headers: { apikey: publicKey, "content-type": "application/json" },
      body: JSON.stringify({ email: `acad-${label}-${runId}@example.test`, password })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.user?.id && data.access_token);
    ids.push(data.user.id);
    return { id: data.user.id, token: data.access_token };
  };
  const post = (path, token, body) => fetch(base + path, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const get = (path, token) => fetch(base + path, {
    headers: { authorization: `Bearer ${token}` }
  });
  const put = (path, token, body) => fetch(base + path, {
    method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  try {
    const studentA = await signup("studentA");
    const studentB = await signup("studentB");
    const instructorA = await signup("instructorA");
    const instructorB = await signup("instructorB");

    // Test fixture: instructor role bootstrap is a trusted database-owner action.
    await pool.query("INSERT INTO alp_private.alp_role_assignments(user_id, role_name) VALUES ($1, 'instructor')", [instructorA.id]);
    await pool.query("INSERT INTO alp_private.alp_role_assignments(user_id, role_name) VALUES ($1, 'instructor')", [instructorB.id]);

    let res = await post("/api/academic/courses", instructorA.token, { title: "Course A", description: "Test course", is_published: true });
    assert.equal(res.status, 201);
    const courseA = (await res.json()).course;
    assert.ok(courseA.id);

    res = await post("/api/academic/courses", instructorB.token, { title: "Course B", description: "Test course B", is_published: true });
    assert.equal(res.status, 201);
    const courseB = (await res.json()).course;
    assert.ok(courseB.id);

    // A student cannot create an instructor-owned course.
    res = await post("/api/academic/courses", studentA.token, { title: "Unauthorized" });
    assert.equal(res.status, 403);

    res = await post("/api/academic/courses", instructorA.token, { title: "Unpublished A", is_published: false });
    assert.equal(res.status, 201);
    const unpublishedA = (await res.json()).course;

    // Unpublished content is denied to students and to unrelated instructors.
    res = await get(`/api/academic/courses/${unpublishedA.id}`, studentA.token);
    assert.equal(res.status, 403);

    res = await get(`/api/academic/courses/${unpublishedA.id}`, instructorB.token);
    assert.equal(res.status, 403);

    res = await get(`/api/academic/courses/${unpublishedA.id}`, instructorA.token);
    assert.equal(res.status, 200);

    // --- Enrollment ---
    res = await post("/api/academic/enrollments", studentA.token, { courseId: courseA.id });
    assert.equal(res.status, 201);
    const enrolled = (await res.json()).enrollment;
    assert.equal(enrolled.student_id, studentA.id);
    assert.equal(enrolled.course_id, courseA.id);

    // Duplicate enrollment is rejected.
    res = await post("/api/academic/enrollments", studentA.token, { courseId: courseA.id });
    assert.equal(res.status, 409);

    // Cannot enroll in an unpublished course.
    res = await post("/api/academic/enrollments", studentA.token, { courseId: unpublishedA.id });
    assert.equal(res.status, 403);

    // Student sees own enrollment.
    res = await get("/api/academic/enrollments", studentA.token);
    assert.equal(res.status, 200);
    const enrollmentsA = (await res.json()).enrollments;
    assert.ok(enrollmentsA.some(e => e.course_id === courseA.id));

    // Cross-student isolation: student B sees none of student A enrollments.
    res = await get("/api/academic/enrollments", studentB.token);
    assert.equal(res.status, 200);
    const enrollmentsB = (await res.json()).enrollments;
    assert.ok(!enrollmentsB.some(e => e.student_id === studentA.id));
    assert.ok(!enrollmentsB.some(e => e.course_id === courseA.id));

    // Instructor A sees enrollments in own course.
    res = await get("/api/academic/enrollments", instructorA.token);
    assert.equal(res.status, 200);
    const instrEnrollments = (await res.json()).enrollments;
    assert.ok(instrEnrollments.some(e => e.course_id === courseA.id));

    // Cross-instructor isolation: instructor B sees nothing from course A.
    res = await get("/api/academic/enrollments", instructorB.token);
    assert.equal(res.status, 200);
    const instrBEnrollments = (await res.json()).enrollments;
    assert.ok(!instrBEnrollments.some(e => e.course_id === courseA.id));

    // --- Lessons and progress ---
    // Stage 2 has no create-lesson endpoint, so the lesson fixture is inserted
    // with database-owner rights.
    const lessonRes = await pool.query(
      "INSERT INTO public.alp_lessons (course_id, instructor_id, title, content) VALUES ($1, $2, $3, $4) RETURNING id",
      [courseA.id, instructorA.id, "Lesson 1", "Content"]
    );
    const lessonId = lessonRes.rows[0].id;

    const progressInsert = await pool.query(
      "INSERT INTO public.alp_academic_progress (student_id, lesson_id, course_id, status) VALUES ($1, $2, $3, $4) RETURNING id",
      [studentA.id, lessonId, courseA.id, "started"]
    );
    const progressId = progressInsert.rows[0].id;

    res = await get("/api/academic/progress", studentA.token);
    assert.equal(res.status, 200);
    const progressA = (await res.json()).progress;
    assert.ok(progressA.some(p => p.id === progressId));

    // Cross-student isolation: student B cannot see student A progress.
    res = await get("/api/academic/progress", studentB.token);
    assert.equal(res.status, 200);
    const progressB = (await res.json()).progress;
    assert.ok(!progressB.some(p => p.id === progressId));

    // Owner may update own progress.
    res = await put(`/api/academic/progress/${progressId}`, studentA.token, { status: "completed" });
    assert.equal(res.status, 200);

    // Cross-student write is denied.
    res = await put(`/api/academic/progress/${progressId}`, studentB.token, { status: "in_progress" });
    assert.equal(res.status, 403);

    // --- Authentication negatives ---
    res = await get("/api/academic/courses", studentA.token + "tampered");
    assert.equal(res.status, 401);

    const revokedUser = await signup("revoked");
    const revokedToken = revokedUser.token;
    await pool.query("DELETE FROM auth.users WHERE id = $1", [revokedUser.id]);
    const revokedIdx = ids.indexOf(revokedUser.id);
    if (revokedIdx !== -1) ids.splice(revokedIdx, 1);
    res = await get("/api/academic/courses", revokedToken);
    assert.equal(res.status, 401);
  } finally {
    for (const id of ids.reverse()) {
      await pool.query("DELETE FROM public.alp_academic_progress WHERE student_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM public.alp_enrollments WHERE student_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM public.alp_lessons WHERE instructor_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM public.alp_courses WHERE instructor_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM public.alp_learning_pathways WHERE instructor_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM alp_private.alp_academic_rate_limits WHERE actor_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM alp_private.alp_role_assignments WHERE user_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM auth.users WHERE id = $1", [id]).catch(() => {});
    }
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    if (!pool.ended && !pool.ending) {
      await new Promise(resolve => pool.end(resolve));
    }
  }
});
