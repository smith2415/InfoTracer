import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";

// Checks for Spine #5: weeds (my version of stars) live in one junction
// table, where each row means "this user marked this observation as a weed."
const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const app = createApp(pool, { sessionSecret: "test-secret" });
const emails = [`weeds-a-${Date.now()}@example.com`, `weeds-b-${Date.now()}@example.com`];
const agentA = request.agent(app);
const agentB = request.agent(app);
let claimId;
let obsId;

beforeAll(async () => {
  await migrate(pool);
  await agentA.post("/signup").type("form").send({ email: emails[0], password: "weeds-pass-a" });
  await agentB.post("/signup").type("form").send({ email: emails[1], password: "weeds-pass-b" });
  const claim = await agentA.post("/claims").type("form").send({ claim_text: "$12 billion was stolen" });
  claimId = Number(claim.headers.location.split("/").pop());
  const obs = await agentA.post(`/claims/${claimId}/observations`).type("form").send({
    location: "X",
    poster: "@NewsPatriotHub",
  });
  obsId = Number(obs.headers.location.split("#observation-")[1]);
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
  await pool.end();
});

describe("weeds", () => {
  it("starts with an empty Weeds view", async () => {
    const res = await agentA.get("/weeds");
    expect(res.status).toBe(200);
    expect(res.text).toContain("No weeds yet");
  });

  it("marks an observation as a weed and shows it in the Weeds view", async () => {
    await agentA.post(`/observations/${obsId}/weed`);
    await agentA.post(`/observations/${obsId}/weed`); // a second click doesn't duplicate it

    const { rows } = await pool.query("SELECT user_id FROM weeds WHERE observation_id = $1", [obsId]);
    expect(rows).toHaveLength(1);

    const weeds = await agentA.get("/weeds");
    expect(weeds.text).toContain("@NewsPatriotHub");
    expect(weeds.text).toContain("$12 billion was stolen");

    const claim = await agentA.get(`/claims/${claimId}`);
    expect(claim.text).toContain("flag-weed");
    expect(claim.text).toContain("Remove weed");
  });

  it("keeps weeds private and stops other users weeding your observations", async () => {
    expect((await agentB.get("/weeds")).text).toContain("No weeds yet");
    expect((await agentB.post(`/observations/${obsId}/weed`)).status).toBe(404);
    const { rows } = await pool.query("SELECT 1 FROM weeds WHERE observation_id = $1", [obsId]);
    expect(rows).toHaveLength(1);
  });

  it("removes a weed and returns to the Weeds view when asked", async () => {
    const res = await agentA.post(`/observations/${obsId}/unweed`).type("form").send({ return_to: "weeds" });
    expect(res.headers.location).toBe("/weeds");
    expect((await agentA.get("/weeds")).text).toContain("No weeds yet");
  });

  it("deletes a weed along with its observation", async () => {
    await agentA.post(`/observations/${obsId}/weed`);
    await agentA.post(`/observations/${obsId}/delete`);
    const { rows } = await pool.query("SELECT 1 FROM weeds WHERE observation_id = $1", [obsId]);
    expect(rows).toHaveLength(0);
  });
});
