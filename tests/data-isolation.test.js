import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";

// GRADED TEST 1: Data isolation (PLAN.md section 4)
//
// Given User A has created a claim called "$12 billion stolen from the bank"
// with two observations, and User B has a separate account with no claims,
// when User B logs in and opens their claims list, or tries to open User A's
// claim page directly by its link, then User B's list is empty, and the
// direct link is refused instead of showing User A's claim.

const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const app = createApp(pool, { sessionSecret: "test-secret" });
const stamp = Date.now();
const userA = { email: `isolation-a-${stamp}@example.com`, password: "user-a-password" };
const userB = { email: `isolation-b-${stamp}@example.com`, password: "user-b-password" };
const CLAIM = "$12 billion stolen from the bank";
let claimId;

beforeAll(async () => {
  await migrate(pool);

  // Given: User A creates the claim and logs two observations...
  const agentA = request.agent(app);
  await agentA.post("/signup").type("form").send(userA);
  const claim = await agentA.post("/claims").type("form").send({ claim_text: CLAIM, hook: "$12 billion" });
  claimId = Number(claim.headers.location.split("/").pop());
  await agentA.post(`/claims/${claimId}/observations`).type("form").send({ location: "X", poster: "@NewsPatriotHub" });
  await agentA.post(`/claims/${claimId}/observations`).type("form").send({ location: "Bluesky", poster: "@anon48213" });

  // ...and User B signs up separately, with no claims.
  await request(app).post("/signup").type("form").send(userB);
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[userA.email, userB.email]]);
  await pool.end();
});

describe("data isolation: User B cannot see User A's data", () => {
  it("shows User B an empty claims list", async () => {
    // When: User B logs in and opens their claims list.
    const agentB = request.agent(app);
    await agentB.post("/login").type("form").send(userB);
    const list = await agentB.get("/claims");

    // Then: the list is empty, with no trace of User A's claim.
    expect(list.status).toBe(200);
    expect(list.text).toContain("Start your first investigation");
    expect(list.text).not.toContain(CLAIM);
  });

  it("refuses User B's direct link to User A's claim", async () => {
    // When: User B tries to open User A's claim page by its link.
    const agentB = request.agent(app);
    await agentB.post("/login").type("form").send(userB);
    const page = await agentB.get(`/claims/${claimId}`);

    // Then: the link is refused, and none of User A's details appear.
    expect(page.status).toBe(404);
    expect(page.text).not.toContain(CLAIM);
    expect(page.text).not.toContain("@NewsPatriotHub");
  });

  it("still shows User A their own claim (so the test isn't passing by accident)", async () => {
    const agentA = request.agent(app);
    await agentA.post("/login").type("form").send(userA);
    const page = await agentA.get(`/claims/${claimId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(CLAIM);
  });
});
