import pg from "pg";
const { Pool } = pg;
const maxBody = 8192;

// Authenticates with the Supabase user endpoint first. Transaction-local claims
// are applied only AFTER successful verification; never accept a caller-supplied
// actor id from request JSON or headers.
async function bindVerifiedActor(client, actor, verifyLogin) {
  if (verifyLogin) {
    // A privileged session login can bypass the intended R1 trust boundary.
    // Do not accept postgres/service_role/superuser/BYPASSRLS credentials.
    const identity = await client.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = session_user",
    );
    if (
      identity.rows.length !== 1 ||
      identity.rows[0].rolsuper !== false ||
      identity.rows[0].rolbypassrls !== false
    ) {
      throw new Error("academic database login must be non-privileged");
    }
  }
  await client.query("SET LOCAL ROLE alp_academic_executor");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [actor]);
}

const validUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export function createAcademic({
  authUrl = process.env.ALP_SUPABASE_URL,
  publishableKey = process.env.ALP_SUPABASE_PUBLISHABLE_KEY,
  databaseUrl = process.env.ALP_ACADEMIC_DATABASE_URL,
  fetchImpl = fetch,
  pool: injectedPool,
} = {}) {
  const enabled = Boolean(authUrl && publishableKey && (databaseUrl || injectedPool));
  const pool =
    injectedPool ??
    (databaseUrl
      ? new Pool({
          connectionString: databaseUrl,
          max: 3,
          connectionTimeoutMillis: 5000,
          statement_timeout: 5000,
        })
      : null);

  async function verifyActor(req) {
    const auth = req.headers.authorization;
    if (typeof auth !== "string" || !/^Bearer \S+$/.test(auth))
      return { ok: false, status: 401, error: "unauthorized" };
    const result = await fetchImpl(new URL("/auth/v1/user", authUrl), {
      headers: { authorization: auth, apikey: publishableKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!result.ok) return { ok: false, status: 401, error: "unauthorized" };
    const user = await result.json();
    const actor = user.id;
    if (typeof actor !== "string" || !validUuid(actor))
      return { ok: false, status: 401, error: "unauthorized" };
    return { ok: true, actor };
  }

  async function hasRole(client, actor, roleName) {
    const res = await client.query(
      "SELECT 1 FROM alp_private.alp_role_assignments WHERE user_id = $1 AND role_name = $2 LIMIT 1",
      [actor, roleName],
    );
    return (res.rowCount ?? res.rows.length) > 0;
  }

  async function isEnrolled(client, studentId, courseId) {
    const res = await client.query(
      "SELECT 1 FROM public.alp_enrollments WHERE student_id = $1 AND course_id = $2 LIMIT 1",
      [studentId, courseId],
    );
    return (res.rowCount ?? res.rows.length) > 0;
  }

  async function handleCourses(req, res, send, actor, pool) {
    if (req.method === "GET" && req.url === "/api/academic/courses") {
      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        await bindVerifiedActor(client, actor, !injectedPool);
        const isInstructor = await hasRole(client, actor, "instructor");
        let result;
        if (isInstructor) {
          result = await client.query(
            "SELECT id, instructor_id, title, description, is_published, created_at, updated_at FROM public.alp_courses WHERE instructor_id = $1 OR is_published = true ORDER BY created_at DESC",
            [actor],
          );
        } else {
          result = await client.query(
            "SELECT id, instructor_id, title, description, is_published, created_at, updated_at FROM public.alp_courses WHERE is_published = true ORDER BY created_at DESC",
          );
        }
        await client.query("COMMIT");
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify({ courses: result.rows }));
      } catch {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch {}
        }
        return send(503, "academic_unavailable");
      } finally {
        client?.release();
      }
      return true;
    }
    return false;
  }
  async function process(req, res) {
    const send = (status, error) => {
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ error }));
      return true;
    };
    const path = new URL(req.url, "http://localhost").pathname;
    if (!path.startsWith("/api/academic/")) return send(404, "not_found");
    if (!enabled) return send(503, "academic_service_unconfigured");
    let authResult;
    try {
      authResult = await verifyActor(req);
    } catch {
      return send(503, "academic_auth_unavailable");
    }
    if (!authResult.ok) return send(authResult.status, authResult.error);
    const { actor } = authResult;
    const isWrite = req.method !== "GET";
    const readLimit = 60;
    const writeLimit = 10;
    let quotaClient;
    let readAllowed = false;
    let writeAllowed = true;
    try {
      // Single connection and single transaction: a second pool.connect() here
      // would leak the first client, because the finally block can only
      // release the last assigned reference.
      quotaClient = await pool.connect();
      await quotaClient.query("BEGIN");
      await bindVerifiedActor(quotaClient, actor, !injectedPool);
      const readQuota = await quotaClient.query(
        "SELECT alp_private.consume_academic_quota($1, 'read', $2) AS allowed",
        [actor, readLimit],
      );
      readAllowed = readQuota.rows[0]?.allowed === true;
      if (isWrite && readAllowed) {
        const writeQuota = await quotaClient.query(
          "SELECT alp_private.consume_academic_quota($1, 'write', $2) AS allowed",
          [actor, writeLimit],
        );
        writeAllowed = writeQuota.rows[0]?.allowed === true;
      }
      await quotaClient.query("COMMIT");
    } catch {
      if (quotaClient) {
        try {
          await quotaClient.query("ROLLBACK");
        } catch {}
      }
      return send(503, "academic_unavailable");
    } finally {
      quotaClient?.release();
    }
    if (!readAllowed || (isWrite && !writeAllowed)) {
      res.setHeader("retry-after", "60");
      return send(429, "rate_limited");
    }
    if (await handleCourses(req, res, send, actor, pool)) return;
    if (await handleCreateCourse(req, res, send, actor, pool)) return;
    if (await handleGetCourse(req, res, send, actor, pool)) return;
    if (await handleEnrollments(req, res, send, actor, pool)) return;
    if (await handleLessons(req, res, send, actor, pool)) return;
    if (await handlePathways(req, res, send, actor, pool)) return;
    if (await handlePathwayDetail(req, res, send, actor, pool)) return;
    if (await handleProgress(req, res, send, actor, pool)) return;
    if (await handleUpdateProgress(req, res, send, actor, pool)) return;
    return send(404, "not_found");
  }
  async function handleCreateCourse(req, res, send, actor, pool) {
    if (req.method !== "POST" || req.url !== "/api/academic/courses") return false;
    let bodyText = "";
    try {
      for await (const chunk of req) {
        bodyText += chunk.toString();
        if (Buffer.byteLength(bodyText) > maxBody) return send(413, "request_too_large");
      }
    } catch {
      return send(400, "invalid_body");
    }
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return send(400, "invalid_json");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return send(400, "invalid_fields");
    const { title, description, is_published } = body;
    const unknownFields = Object.keys(body).filter(
      (k) => !["title", "description", "is_published"].includes(k),
    );
    if (unknownFields.length > 0) return send(400, "invalid_fields");
    if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 200)
      return send(400, "invalid_title");
    if (description !== undefined && (typeof description !== "string" || description.length > 2000))
      return send(400, "invalid_description");
    if (is_published !== undefined && typeof is_published !== "boolean")
      return send(400, "invalid_published");
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await bindVerifiedActor(client, actor, !injectedPool);
      const isInstructor = await hasRole(client, actor, "instructor");
      if (!isInstructor) {
        await client.query("ROLLBACK");
        await client.query("BEGIN");
        await bindVerifiedActor(client, actor, !injectedPool);
        await client.query("SELECT alp_private.record_approval_security_event($1, $2)", [
          actor,
          "approval_denied",
        ]);
        await client.query("COMMIT");
        return send(403, "forbidden");
      }
      const result = await client.query(
        "INSERT INTO public.alp_courses (instructor_id, title, description, is_published) VALUES ($1, $2, $3, $4) RETURNING id, title, description, is_published, created_at",
        [actor, title.trim(), description ?? "", is_published === true],
      );
      await client.query("COMMIT");
      const row = result.rows[0] || {};
      res.writeHead(201, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(
        JSON.stringify({
          course: {
            id: row.id,
            title: title.trim(),
            description: description ?? "",
            is_published: is_published === true,
            created_at: row.created_at,
          },
        }),
      );
    } catch {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {}
      }
      return send(503, "academic_unavailable");
    } finally {
      client?.release();
    }
    return true;
  }
  async function handleGetCourse(req, res, send, actor, pool) {
    const match = req.url.match(/^\/api\/academic\/courses\/([0-9a-f-]+)$/);
    if (req.method !== "GET" || !match) return false;
    const courseId = match[1];
    if (!validUuid(courseId)) return send(400, "invalid_course_id");
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await bindVerifiedActor(client, actor, !injectedPool);
      const result = await client.query(
        "SELECT id, instructor_id, title, description, is_published, created_at, updated_at FROM public.alp_courses WHERE id = $1",
        [courseId],
      );
      if ((result.rowCount ?? result.rows.length) === 0) {
        await client.query("ROLLBACK");
        return send(404, "course_not_found");
      }
      const course = result.rows[0];
      const isInstructor = await hasRole(client, actor, "instructor");
      if (!course.is_published && !(isInstructor && course.instructor_id === actor)) {
        await client.query("ROLLBACK");
        return send(403, "forbidden");
      }
      await client.query("COMMIT");
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ course }));
    } catch {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {}
      }
      return send(503, "academic_unavailable");
    } finally {
      client?.release();
    }
    return true;
  }
  async function handleEnrollments(req, res, send, actor, pool) {
    if (req.method === "GET" && req.url === "/api/academic/enrollments") {
      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        await bindVerifiedActor(client, actor, !injectedPool);
        const isInstructor = await hasRole(client, actor, "instructor");
        let result;
        if (isInstructor) {
          result = await client.query(
            "SELECT e.id, e.student_id, e.course_id, e.enrolled_at, c.title AS course_title FROM public.alp_enrollments e JOIN public.alp_courses c ON c.id = e.course_id WHERE c.instructor_id = $1 ORDER BY e.enrolled_at DESC",
            [actor],
          );
        } else {
          result = await client.query(
            "SELECT id, student_id, course_id, enrolled_at FROM public.alp_enrollments WHERE student_id = $1 ORDER BY enrolled_at DESC",
            [actor],
          );
        }
        await client.query("COMMIT");
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify({ enrollments: result.rows }));
      } catch {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch {}
        }
        return send(503, "academic_unavailable");
      } finally {
        client?.release();
      }
      return true;
    }
    if (req.method === "POST" && req.url === "/api/academic/enrollments") {
      let bodyText = "";
      try {
        for await (const chunk of req) {
          bodyText += chunk.toString();
          if (Buffer.byteLength(bodyText) > maxBody) return send(413, "request_too_large");
        }
      } catch {
        return send(400, "invalid_body");
      }
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return send(400, "invalid_json");
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return send(400, "invalid_fields");
      const { courseId } = body;
      const unknownFields = Object.keys(body).filter((k) => k !== "courseId");
      if (unknownFields.length > 0) return send(400, "invalid_fields");
      if (!validUuid(courseId)) return send(400, "invalid_course_id");
      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        await bindVerifiedActor(client, actor, !injectedPool);
        const course = await client.query(
          "SELECT id, is_published FROM public.alp_courses WHERE id = $1",
          [courseId],
        );
        if ((course.rowCount ?? course.rows.length) === 0) {
          await client.query("ROLLBACK");
          return send(404, "course_not_found");
        }
        if (!course.rows[0].is_published) {
          await client.query("ROLLBACK");
          return send(403, "course_not_published");
        }
        const already = await isEnrolled(client, actor, courseId);
        if (already) {
          await client.query("ROLLBACK");
          return send(409, "already_enrolled");
        }
        await client.query(
          "INSERT INTO public.alp_enrollments (student_id, course_id) VALUES ($1, $2)",
          [actor, courseId],
        );
        await client.query("COMMIT");
        res.writeHead(201, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify({ enrollment: { student_id: actor, course_id: courseId } }));
      } catch {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch {}
        }
        return send(503, "academic_unavailable");
      } finally {
        client?.release();
      }
      return true;
    }
    return false;
  }
  async function handleLessons(req, res, send, actor, pool) {
    const match = req.url.match(/^\/api\/academic\/lessons\/([0-9a-f-]+)$/);
    if (req.method !== "GET" || !match) return false;
    const lessonId = match[1];
    if (!validUuid(lessonId)) return send(400, "invalid_lesson_id");
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await bindVerifiedActor(client, actor, !injectedPool);
      const result = await client.query(
        "SELECT l.id, l.course_id, l.instructor_id, l.title, l.content, l.sort_order, l.created_at, l.updated_at, c.title AS course_title, c.is_published FROM public.alp_lessons l JOIN public.alp_courses c ON c.id = l.course_id WHERE l.id = $1",
        [lessonId],
      );
      if ((result.rowCount ?? result.rows.length) === 0) {
        await client.query("ROLLBACK");
        return send(404, "lesson_not_found");
      }
      const lesson = result.rows[0];
      const isInstructor = await hasRole(client, actor, "instructor");
      const enrolled = await isEnrolled(client, actor, lesson.course_id);
      if (!lesson.is_published && !(isInstructor && lesson.instructor_id === actor) && !enrolled) {
        await client.query("ROLLBACK");
        return send(403, "forbidden");
      }
      await client.query("COMMIT");
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ lesson }));
    } catch {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {}
      }
      return send(503, "academic_unavailable");
    } finally {
      client?.release();
    }
    return true;
  }
  async function handlePathways(req, res, send, actor, pool) {
    if (req.method === "GET" && req.url === "/api/academic/pathways") {
      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        await bindVerifiedActor(client, actor, !injectedPool);
        const isInstructor = await hasRole(client, actor, "instructor");
        let result;
        if (isInstructor) {
          result = await client.query(
            "SELECT id, instructor_id, title, description, is_published, created_at, updated_at FROM public.alp_learning_pathways WHERE instructor_id = $1 OR is_published = true ORDER BY created_at DESC",
            [actor],
          );
        } else {
          result = await client.query(
            "SELECT id, instructor_id, title, description, is_published, created_at, updated_at FROM public.alp_learning_pathways WHERE is_published = true ORDER BY created_at DESC",
          );
        }
        await client.query("COMMIT");
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify({ pathways: result.rows }));
      } catch {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch {}
        }
        return send(503, "academic_unavailable");
      } finally {
        client?.release();
      }
      return true;
    }
    return false;
  }

  async function handlePathwayDetail(req, res, send, actor, pool) {
    const match = req.url.match(/^\/api\/academic\/pathways\/([0-9a-f-]+)$/);
    if (req.method !== "GET" || !match) return false;
    const pathwayId = match[1];
    if (!validUuid(pathwayId)) return send(400, "invalid_pathway_id");
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await bindVerifiedActor(client, actor, !injectedPool);
      const pathway = await client.query(
        "SELECT * FROM public.alp_learning_pathways WHERE id = $1",
        [pathwayId],
      );
      if ((pathway.rowCount ?? pathway.rows.length) === 0) {
        await client.query("ROLLBACK");
        return send(404, "pathway_not_found");
      }
      const p = pathway.rows[0];
      const isInstructor = await hasRole(client, actor, "instructor");
      if (!p.is_published && !(isInstructor && p.instructor_id === actor)) {
        await client.query("ROLLBACK");
        return send(403, "forbidden");
      }
      const courses = await client.query(
        "SELECT c.id, c.title, c.description, c.is_published, pc.sort_order FROM public.alp_pathway_courses pc JOIN public.alp_courses c ON c.id = pc.course_id WHERE pc.pathway_id = $1 ORDER BY pc.sort_order",
        [pathwayId],
      );
      await client.query("COMMIT");
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ pathway: { ...p, courses: courses.rows } }));
    } catch {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {}
      }
      return send(503, "academic_unavailable");
    } finally {
      client?.release();
    }
    return true;
  }
  async function handleProgress(req, res, send, actor, pool) {
    if (req.method === "GET" && req.url === "/api/academic/progress") {
      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        await bindVerifiedActor(client, actor, !injectedPool);
        const isInstructor = await hasRole(client, actor, "instructor");
        let result;
        if (isInstructor) {
          result = await client.query(
            "SELECT ap.id, ap.student_id, ap.lesson_id, ap.course_id, ap.status, ap.completed_at, ap.updated_at, l.title AS lesson_title, c.title AS course_title FROM public.alp_academic_progress ap JOIN public.alp_lessons l ON l.id = ap.lesson_id JOIN public.alp_courses c ON c.id = ap.course_id WHERE c.instructor_id = $1 ORDER BY ap.updated_at DESC",
            [actor],
          );
        } else {
          result = await client.query(
            "SELECT id, student_id, lesson_id, course_id, status, completed_at, updated_at FROM public.alp_academic_progress WHERE student_id = $1 ORDER BY updated_at DESC",
            [actor],
          );
        }
        await client.query("COMMIT");
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify({ progress: result.rows }));
      } catch {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch {}
        }
        return send(503, "academic_unavailable");
      } finally {
        client?.release();
      }
      return true;
    }
    return false;
  }

  async function handleUpdateProgress(req, res, send, actor, pool) {
    const match = req.url.match(/^\/api\/academic\/progress\/([0-9a-f-]+)$/);
    if (req.method !== "PUT" || !match) return false;
    const progressId = match[1];
    if (!validUuid(progressId)) return send(400, "invalid_progress_id");
    let bodyText = "";
    try {
      for await (const chunk of req) {
        bodyText += chunk.toString();
        if (Buffer.byteLength(bodyText) > maxBody) return send(413, "request_too_large");
      }
    } catch {
      return send(400, "invalid_body");
    }
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return send(400, "invalid_json");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return send(400, "invalid_fields");
    const { status } = body;
    const unknownFields = Object.keys(body).filter((k) => k !== "status");
    if (unknownFields.length > 0) return send(400, "invalid_fields");
    if (!["started", "in_progress", "completed"].includes(status))
      return send(400, "invalid_status");
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await bindVerifiedActor(client, actor, !injectedPool);
      const existing = await client.query(
        "SELECT id, student_id FROM public.alp_academic_progress WHERE id = $1",
        [progressId],
      );
      if ((existing.rowCount ?? existing.rows.length) === 0) {
        await client.query("ROLLBACK");
        return send(404, "progress_not_found");
      }
      if (existing.rows[0].student_id !== actor) {
        await client.query("ROLLBACK");
        return send(403, "forbidden");
      }
      await client.query(
        "UPDATE public.alp_academic_progress SET status = $1, completed_at = CASE WHEN $1 = 'completed' THEN now() ELSE NULL END, updated_at = now() WHERE id = $2",
        [status, progressId],
      );
      await client.query("COMMIT");
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ progress: { id: progressId, status } }));
    } catch {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {}
      }
      return send(503, "academic_unavailable");
    } finally {
      client?.release();
    }
    return true;
  }

  return { process, close: () => pool?.end() };
}
