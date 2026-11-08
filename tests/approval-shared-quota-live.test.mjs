import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

test("persistent quota shares counts across independent database connections", { skip: !process.env.ALP_LOCAL_INTEGRATION, timeout: 30000 }, async () => {
  const uri = process.env.ALP_DATABASE_URL;
  assert.ok(uri && uri.includes("127.0.0.1"));
  const first = new pg.Client({ connectionString: uri });
  const second = new pg.Client({ connectionString: uri });
  const actor = crypto.randomUUID();
  await Promise.all([first.connect(), second.connect()]);
  const consume = async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE service_role");
      const out = await client.query("SELECT alp_private.consume_approval_quota($1) AS allowed", [actor]);
      await client.query("COMMIT");
      return out.rows[0].allowed;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  };
  try {
    for (let i = 0; i < 6; i++) assert.equal(await consume(i % 2 ? second : first), true);
    assert.equal(await consume(second), false);
    const count = await first.query("SELECT attempts FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1", [actor]);
    assert.equal(count.rows[0].attempts, 7);
  } finally {
    await first.query("DELETE FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1", [actor]);
    await Promise.all([first.end(), second.end()]);
  }
});
