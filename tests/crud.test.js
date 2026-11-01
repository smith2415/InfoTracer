import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";

// Checks for Spine #3: create, read, update and delete claims and observations.
const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const app = createApp(pool, { sessionSecret: "test-secret" });
const emails = [`crud-a-${Date.now()}@example.com`, `crud-b-${Date.now()}@example.com`];
const agentA = request.agent(app);
const agentB = request.agent(app);

function idFrom(location, prefix) {
  return Number(location.replace(prefix, "").split(/[/#]/)[0]);
}

beforeAll(async () => {
  await migrate(pool);
  await agentA.post("/signup").type("form").send({ email: emails[0], password: "password-a-123" });
  await agentB.post("/signup").type("form").send({ email: emails[1], password: "password-b-123" });
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
  await pool.end();
});

describe("claims and observations pages", () => {
  let claimId;
  let firstObs;
  let secondObs;

  it("creates a claim and shows it in the list and on its detail page", async () => {
    const res = await agentA.post("/claims").type("form").send({
      claim_text: "$12 billion was stolen from the bank",
      hook: "$12 billion",
      status: "tracing",
      notes: "Seen in a group chat screenshot.",
    });
    expect(res.status).toBe(302);
    claimId = idFrom(res.headers.location, "/claims/");

    const list = await agentA.get("/claims");
    expect(list.text).toContain("$12 billion was stolen from the bank");

    const detail = await agentA.get(`/claims/${claimId}`);
    expect(detail.status).toBe(200);
    expect(detail.text).toContain("hook: $12 billion");
    expect(detail.text).toContain("No observations yet");
  });

  it("adds observations, shows blanks as '-', and lists them oldest first", async () => {
    const later = await agentA.post(`/claims/${claimId}/observations`).type("form").send({
      observed_at: "2026-03-06T12:00",
      location: "X",
      poster: "@NewsPatriotHub",
      post_text: "BREAKING: $12 billion stolen...",
      url: "https://example.com/post/1",
    });
    secondObs = Number(later.headers.location.split("#observation-")[1]);

    const earlier = await agentA.post(`/claims/${claimId}/observations`).type("form").send({
      observed_at: "2026-03-02T09:00",
      location: "Bluesky",
      poster: "",
    });
    firstObs = Number(earlier.headers.location.split("#observation-")[1]);

    const detail = await agentA.get(`/claims/${claimId}`);
    expect(detail.text.indexOf("Bluesky")).toBeLessThan(detail.text.indexOf("@NewsPatriotHub"));
    expect(detail.text).toContain("Mar 2, 2026, 09:00 UTC");
    expect(detail.text).toContain("post text: -");
  });

  it("marks one observation as the seed", async () => {
    await agentA.post(`/observations/${firstObs}/seed`);
    await agentA.post(`/observations/${secondObs}/seed`);
    const { rows } = await pool.query(
      "SELECT id FROM observations WHERE claim_id = $1 AND is_seed",
      [claimId]
    );
    expect(rows.map((r) => r.id)).toEqual([secondObs]);
  });

  it("edits a claim and an observation", async () => {
    await agentA.post(`/claims/${claimId}`).type("form").send({
      claim_text: "$12 billion was stolen from the central bank",
      hook: "$12 billion",
      status: "traced",
      notes: "",
    });
    await agentA.post(`/observations/${firstObs}`).type("form").send({
      observed_at: "2026-03-02T09:00",
      location: "Bluesky",
      poster: "@anon48213",
    });

    const detail = await agentA.get(`/claims/${claimId}`);
    expect(detail.text).toContain("central bank");
    expect(detail.text).toContain("badge-traced");
    expect(detail.text).toContain("@anon48213");
  });

  it("only lets the owner see or change a claim", async () => {
    expect((await agentB.get(`/claims/${claimId}`)).status).toBe(404);
    expect((await agentB.get(`/claims/${claimId}/edit`)).status).toBe(404);
    expect((await agentB.post(`/claims/${claimId}/delete`)).status).toBe(404);
    expect((await agentB.post(`/observations/${firstObs}/delete`)).status).toBe(404);
  });

  it("asks 'are you sure?' before deleting, then deletes", async () => {
    const confirmObs = await agentA.get(`/observations/${firstObs}/delete`);
    expect(confirmObs.text).toContain("Delete this observation?");
    await agentA.post(`/observations/${firstObs}/delete`);
    expect((await agentA.get(`/observations/${firstObs}/edit`)).status).toBe(404);

    const confirmClaim = await agentA.get(`/claims/${claimId}/delete`);
    expect(confirmClaim.text).toContain("Delete this claim?");
    const res = await agentA.post(`/claims/${claimId}/delete`);
    expect(res.headers.location).toBe("/claims");
    expect((await agentA.get(`/claims/${claimId}`)).status).toBe(404);
  });
});
