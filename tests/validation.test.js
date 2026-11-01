import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";

// Checks for Spine #4: required fields can't be left blank, with a friendly message.
const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const app = createApp(pool, { sessionSecret: "test-secret" });
const email = `validation-${Date.now()}@example.com`;
const agent = request.agent(app);
let claimId;

beforeAll(async () => {
  await migrate(pool);
  await agent.post("/signup").type("form").send({ email, password: "validation-pass" });
  const res = await agent.post("/claims").type("form").send({ claim_text: "Validation claim" });
  claimId = Number(res.headers.location.split("/").pop());
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
  await pool.end();
});

describe("validation", () => {
  it("refuses a blank claim with a friendly message and keeps what was typed", async () => {
    const res = await agent.post("/claims").type("form").send({ claim_text: "   ", hook: "$12 billion" });
    expect(res.status).toBe(400);
    expect(res.text).toContain("Enter the claim you want to trace.");
    expect(res.text).toContain('value="$12 billion"');
  });

  it("refuses blanking out a claim when editing it", async () => {
    const res = await agent.post(`/claims/${claimId}`).type("form").send({ claim_text: "" });
    expect(res.status).toBe(400);
    expect(res.text).toContain("Enter the claim you want to trace.");
    const { rows } = await pool.query("SELECT claim_text FROM claims WHERE id = $1", [claimId]);
    expect(rows[0].claim_text).toBe("Validation claim");
  });

  it("refuses an observation with no location", async () => {
    const res = await agent.post(`/claims/${claimId}/observations`).type("form").send({
      location: "",
      poster: "@someone",
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain("Enter where you saw it");
    expect(res.text).toContain('value="@someone"');
    const { rows } = await pool.query("SELECT 1 FROM observations WHERE claim_id = $1", [claimId]);
    expect(rows).toHaveLength(0);
  });

  it("explains a bad link and text that's too long", async () => {
    const res = await agent.post(`/claims/${claimId}/observations`).type("form").send({
      location: "X",
      url: "javascript:alert(1)",
      post_text: "a".repeat(2001),
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain("Enter a full link starting with https://");
    expect(res.text).toContain("2,000 characters or fewer");
  });

  it("saves a valid observation with only a location", async () => {
    const res = await agent.post(`/claims/${claimId}/observations`).type("form").send({ location: "Telegram" });
    expect(res.status).toBe(302);
  });
});
