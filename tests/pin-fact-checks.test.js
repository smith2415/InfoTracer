import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { parseFactChecks } from "../src/factcheck.js";

// Checks for pinning fact-check articles to a claim.

const SAMPLE = parseFactChecks({
  claims: [
    {
      text: "Zelensky bought two mega yachts with US aid",
      claimant: "Social media posts",
      claimReview: [
        {
          publisher: { name: "Example Fact Check" },
          url: "https://factcheck.example/yachts",
          title: "No, Zelensky did not buy two yachts",
          reviewDate: "2022-12-05T00:00:00Z",
          textualRating: "False",
        },
      ],
    },
  ],
});

const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const app = createApp(pool, { sessionSecret: "test-secret", factCheckSearch: async () => SAMPLE });
const emails = [`pin-a-${Date.now()}@example.com`, `pin-b-${Date.now()}@example.com`];
const agentA = request.agent(app);
const agentB = request.agent(app);
let claimId;

const pinForm = {
  return_to: "results",
  q: "two mega yachts",
  url: "https://factcheck.example/yachts",
  publisher: "Example Fact Check",
  title: "No, Zelensky did not buy two yachts",
  rating: "False",
  review_date: "2022-12-05T00:00:00Z",
  reviewed_claim: "Zelensky bought two mega yachts with US aid",
  claimant: "Social media posts",
};

const pins = async () =>
  (await pool.query("SELECT * FROM pinned_fact_checks WHERE claim_id = $1", [claimId])).rows;

beforeAll(async () => {
  await migrate(pool);
  await agentA.post("/signup").type("form").send({ email: emails[0], password: "pin-pass-a" });
  await agentB.post("/signup").type("form").send({ email: emails[1], password: "pin-pass-b" });
  const claim = await agentA.post("/claims").type("form").send({ claim_text: "Yacht claim", hook: "two mega yachts" });
  claimId = Number(claim.headers.location.split("/").pop());
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
  await pool.end();
});

describe("pinning fact-checks", () => {
  it("shows a Pin button on each fact-check result", async () => {
    const res = await agentA.get(`/claims/${claimId}/fact-checks`);
    expect(res.text).toContain(`action="/claims/${claimId}/fact-checks/pin"`);
    expect(res.text).toContain(">Pin</button>");
  });

  it("pins a fact-check, returns to the results, and shows it as pinned", async () => {
    const res = await agentA.post(`/claims/${claimId}/fact-checks/pin`).type("form").send(pinForm);
    expect(res.headers.location).toBe(`/claims/${claimId}/fact-checks?q=two%20mega%20yachts`);

    const rows = await pins();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ publisher: "Example Fact Check", rating: "False", claimant: "Social media posts" });

    const results = await agentA.get(`/claims/${claimId}/fact-checks`);
    expect(results.text).toContain("Pinned ✓");
  });

  it("shows pinned fact-checks on the claim page", async () => {
    const page = await agentA.get(`/claims/${claimId}`);
    expect(page.text).toContain("Pinned fact-checks");
    expect(page.text).toContain('rating rating-false">False');
    expect(page.text).toContain('href="https://factcheck.example/yachts"');
    expect(page.text).toContain("Social media posts");
  });

  it("keeps one pin when the same fact-check is pinned twice", async () => {
    await agentA.post(`/claims/${claimId}/fact-checks/pin`).type("form").send(pinForm);
    expect(await pins()).toHaveLength(1);
  });

  it("refuses a pin without a valid web link", async () => {
    const res = await agentA.post(`/claims/${claimId}/fact-checks/pin`).type("form").send({ ...pinForm, url: "javascript:alert(1)" });
    expect(res.status).toBe(400);
    expect(await pins()).toHaveLength(1);
  });

  it("doesn't let another user pin to or unpin from your claim", async () => {
    expect((await agentB.post(`/claims/${claimId}/fact-checks/pin`).type("form").send({ ...pinForm, url: "https://x.example/1" })).status).toBe(404);
    const [pin] = await pins();
    expect((await agentB.post(`/fact-check-pins/${pin.id}/unpin`)).status).toBe(404);
    expect(await pins()).toHaveLength(1);
  });

  it("unpins from the claim page", async () => {
    const [pin] = await pins();
    const res = await agentA.post(`/fact-check-pins/${pin.id}/unpin`);
    expect(res.headers.location).toBe(`/claims/${claimId}#pinned-fact-checks`);
    expect(await pins()).toHaveLength(0);
    expect((await agentA.get(`/claims/${claimId}`)).text).not.toContain("Pinned fact-checks");
  });

  it("deletes a claim's pins along with the claim", async () => {
    await agentA.post(`/claims/${claimId}/fact-checks/pin`).type("form").send(pinForm);
    await agentA.post(`/claims/${claimId}/delete`);
    expect(await pins()).toHaveLength(0);
  });
});
