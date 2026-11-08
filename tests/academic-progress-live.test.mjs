import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import pg from "pg";
import { createAcademic } from "../apps/web/src/academic.mjs";
import { makeServer } from "../apps/web/src/server.mjs";

const ADMIN = process.env.ALP_R1_DATABASE_URL;
const APP = process.env.ALP_R1_APP_DATABASE_URL;
const MARKER = process.env.ALP_R1_EXPECTED_MARKER;
const required = process.env.ALP_R1_REQUIRE === "1";
const owner = "77777777-7777-4777-8777-777777777777";
const stranger = "88888888-8888-4888-8888-888888888888";

if (required && (!ADMIN || !APP || !MARKER))
  throw new Error("R1 progress live verification requires admin URL, app URL, and scratch marker");
if (ADMIN || APP) {
  if (!ADMIN || !APP || !MARKER) throw new Error("paired scratch database URLs and marker required");
  const a = new URL(ADMIN), b = new URL(APP);
  for (const u of [a,b]) {
    if (!["localhost","127.0.0.1"].includes(u.hostname) ||
        ["5432","54322","55322","55622"].includes(u.port) ||
        /foundation|replay|disposable/i.test(u.pathname))
      throw new Error("restricted progress test must target loopback scratch PostgreSQL");
  }
  if (a.host !== b.host || a.pathname !== b.pathname)
    throw new Error("scratch admin and app URLs must point to the same database");
}

test("R1 academic progress writes only the owning student's permitted columns",
  {skip: !ADMIN, timeout:30000}, async (t) => {
  const admin = new pg.Pool({connectionString:ADMIN,max:2});
  let server;
  const course = randomUUID(), lesson = randomUUID(), progress = randomUUID();
  try {
    const marker = await admin.query("SELECT token FROM alp_verification.marker");
    assert.equal(marker.rows[0]?.token,MARKER,"scratch marker must match before writes");
  } catch(e) { await admin.end(); throw e; }
  t.after(async () => {
    if (server) await new Promise(resolve=>server.close(resolve));
    await admin.query("DELETE FROM public.alp_academic_progress WHERE id=$1",[progress]);
    await admin.query("DELETE FROM public.alp_lessons WHERE id=$1",[lesson]);
    await admin.query("DELETE FROM public.alp_enrollments WHERE course_id=$1",[course]);
    await admin.query("DELETE FROM public.alp_courses WHERE id=$1",[course]);
    await admin.query("DELETE FROM alp_private.alp_academic_rate_limits WHERE actor_id = ANY($1)",[[owner,stranger]]);
    await admin.query("DELETE FROM auth.users WHERE id=ANY($1)",[[owner,stranger]]);
    await admin.end();
  });
  await admin.query("INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4) ON CONFLICT(id) DO NOTHING",
    [owner,"r1-progress-owner@example.test",stranger,"r1-progress-stranger@example.test"]);
  await admin.query("INSERT INTO public.alp_courses(id,instructor_id,title,is_published) VALUES($1,$2,$3,true)",
    [course,owner,"R1 progress fixture"]);
  await admin.query("INSERT INTO public.alp_lessons(id,course_id,instructor_id,title) VALUES($1,$2,$3,$4)",
    [lesson,course,owner,"Progress fixture lesson"]);
  await admin.query("INSERT INTO public.alp_academic_progress(id,student_id,lesson_id,course_id,status) VALUES($1,$2,$3,$4,'started')",
    [progress,owner,lesson,course]);

  const academic = createAcademic({
    authUrl:"http://127.0.0.1:1", publishableKey:"scratch-test",
    databaseUrl:APP,
    fetchImpl:async (_url,options) => {
      const id = options.headers.authorization === "Bearer owner-token" ? owner : stranger;
      return {ok:true,json:async()=>({id})};
    },
  });
  server=makeServer({academic});
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  const url=`http://127.0.0.1:${server.address().port}/api/academic/progress/${progress}`;
  const call=(token,status)=>fetch(url,{method:"PUT",headers:{
      authorization:`Bearer ${token}`,"content-type":"application/json"
    },body:JSON.stringify({status})});
  let response=await call("owner-token","completed");
  assert.equal(response.status,200,"owner must be able to complete progress");
  const completed=await admin.query("SELECT status,completed_at,updated_at FROM public.alp_academic_progress WHERE id=$1",[progress]);
  assert.equal(completed.rows[0].status,"completed");
  assert.ok(completed.rows[0].completed_at,"completion timestamp is saved");
  response=await call("stranger-token","started");
  assert.ok([403,404].includes(response.status),"stranger cannot update another student's progress");
  response=await call("owner-token","not_started");
  assert.equal(response.status,400,"API must reject schema-invalid status");
  response=await call("owner-token","started");
  assert.equal(response.status,200);
  const reset=await admin.query("SELECT status,completed_at FROM public.alp_academic_progress WHERE id=$1",[progress]);
  assert.equal(reset.rows[0].status,"started");
  assert.equal(reset.rows[0].completed_at,null);
});
