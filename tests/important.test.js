import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { buildTimeline } from "../src/timeline.js";

// Checks for marking observations as important: a highlight that's separate
// from seed and weed.

describe("Important observations", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const app = createApp(pool, { sessionSecret: "test-secret", sources: [] });
  const stamp = Date.now();
  const emails = [`important-a-${stamp}@example.com`, `important-b-${stamp}@example.com`];
  const owner = request.agent(app);
  const other = request.agent(app);
  let claimId;
  let obsId;

  const isImportant = async () =>
    (await pool.query("SELECT is_important FROM observations WHERE id = $1", [obsId])).rows[0].is_important;

  beforeAll(async () => {
    await migrate(pool);
    await owner.post("/signup").type("form").send({ email: emails[0], password: "important-a-pass" });
    await other.post("/signup").type("form").send({ email: emails[1], password: "important-b-pass" });
    const claim = await owner.post("/claims").type("form").send({ claim_text: "Important claim" });
    claimId = Number(claim.headers.location.split("/").pop());
    const obs = await owner
      .post(`/claims/${claimId}/observations`)
      .type("form")
      .send({ location: "X", poster: "@amplifier", observed_at: "2026-03-02T09:00" });
    obsId = Number(obs.headers.location.split("-").pop());
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
    await pool.end();
  });

  it("starts unmarked", async () => {
    expect(await isImportant()).toBe(false);
    const page = await owner.get(`/claims/${claimId}`);
    expect(page.text).toContain("Mark important");
    expect(page.text).not.toContain("flag-important");
  });

  it("marks and unmarks an observation, separately from seed and weed", async () => {
    const res = await owner.post(`/observations/${obsId}/important`).type("form").send({});
    expect(res.headers.location).toBe(`/claims/${claimId}#observation-${obsId}`);
    expect(await isImportant()).toBe(true);

    const page = await owner.get(`/claims/${claimId}`);
    expect(page.text).toContain('class="flag flag-important">important');
    expect(page.text).toContain("Remove important");
    expect(page.text).toContain('class="important-ring"');
    expect(page.text).not.toContain('class="flag flag-seed"');
    expect(page.text).not.toContain('class="flag flag-weed"');

    await owner.post(`/observations/${obsId}/unimportant`).type("form").send({});
    expect(await isImportant()).toBe(false);
  });

  it("can't be changed by another user", async () => {
    const res = await other.post(`/observations/${obsId}/important`).type("form").send({});
    expect(res.status).toBe(404);
    expect(await isImportant()).toBe(false);
  });

  it("works from the Weeds page and sends you back there", async () => {
    await owner.post(`/observations/${obsId}/weed`).type("form").send({});
    const res = await owner.post(`/observations/${obsId}/important`).type("form").send({ return_to: "weeds" });
    expect(res.headers.location).toBe("/weeds");
    const weeds = await owner.get("/weeds");
    expect(weeds.text).toContain("flag-important");
    expect(weeds.text).toContain("Remove important");
  });

  it("stays marked when the observation is edited", async () => {
    await owner.post(`/observations/${obsId}`).type("form").send({ location: "X", poster: "@amplifier", notes: "Edited" });
    expect(await isImportant()).toBe(true);
  });

  it("is passed to the timeline", () => {
    const t = buildTimeline([
      { id: 1, observed_at: "2026-03-01T00:00:00Z", location: "X", is_important: true },
      { id: 2, observed_at: "2026-03-02T00:00:00Z", location: "X" },
    ]);
    expect(t.points.map((p) => p.isImportant)).toEqual([true, false]);
  });
});
