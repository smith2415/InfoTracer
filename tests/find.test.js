import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";

// Checks for Spine #6: search claims by text, filter by status or location,
// and sort by newest or by earliest observation.
const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const app = createApp(pool, { sessionSecret: "test-secret" });
const emails = [`find-a-${Date.now()}@example.com`, `find-b-${Date.now()}@example.com`];
const agentA = request.agent(app);
const agentB = request.agent(app);

async function addClaim(agent, fields, observations = []) {
  const res = await agent.post("/claims").type("form").send(fields);
  const id = Number(res.headers.location.split("/").pop());
  for (const obs of observations) {
    await agent.post(`/claims/${id}/observations`).type("form").send(obs);
  }
  return id;
}

// The claim texts in the order the list shows them.
function order(html, texts) {
  return texts
    .map((t) => [t, html.indexOf(t)])
    .filter(([, i]) => i >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([t]) => t);
}

beforeAll(async () => {
  await migrate(pool);
  await agentA.post("/signup").type("form").send({ email: emails[0], password: "find-pass-a" });
  await agentB.post("/signup").type("form").send({ email: emails[1], password: "find-pass-b" });

  await addClaim(agentA, { claim_text: "Bank heist claim", hook: "$12 billion", status: "tracing" }, [
    { location: "X", observed_at: "2026-03-06T12:00" },
    { location: "Bluesky", observed_at: "2026-03-02T09:00" },
  ]);
  await addClaim(agentA, { claim_text: "Yacht purchase claim", hook: "two mega yachts", status: "traced", notes: "Seen at 100% certainty" }, [
    { location: "News site", observed_at: "2023-11-20T08:00" },
  ]);
  await addClaim(agentA, { claim_text: "Moth spies claim", status: "dead end" });
  await addClaim(agentB, { claim_text: "Another user bank claim", hook: "$12 billion" });
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
  await pool.end();
});

describe("finding claims", () => {
  const all = ["Bank heist claim", "Yacht purchase claim", "Moth spies claim"];

  it("searches the claim, hook and notes, ignoring case", async () => {
    const byHook = await agentA.get("/claims").query({ q: "12 BILLION" });
    expect(order(byHook.text, all)).toEqual(["Bank heist claim"]);
    expect(byHook.text).toContain("Showing 1 of 3 claims");

    const byNotes = await agentA.get("/claims").query({ q: "100%" });
    expect(order(byNotes.text, all)).toEqual(["Yacht purchase claim"]);
  });

  it("never shows another user's claims in search results", async () => {
    const res = await agentA.get("/claims").query({ q: "bank" });
    expect(res.text).not.toContain("Another user bank claim");
    const theirs = await agentB.get("/claims").query({ q: "heist" });
    expect(theirs.text).toContain("No claims match");
  });

  it("filters by status and by location", async () => {
    const traced = await agentA.get("/claims").query({ status: "traced" });
    expect(order(traced.text, all)).toEqual(["Yacht purchase claim"]);

    const bluesky = await agentA.get("/claims").query({ location: "bluesky" });
    expect(order(bluesky.text, all)).toEqual(["Bank heist claim"]);
  });

  it("combines search and filters, and explains when nothing matches", async () => {
    const res = await agentA.get("/claims").query({ q: "claim", status: "dead end" });
    expect(order(res.text, all)).toEqual(["Moth spies claim"]);

    const none = await agentA.get("/claims").query({ q: "bank", status: "traced" });
    expect(none.text).toContain("No claims match");
  });

  it("sorts by newest, oldest and earliest observation", async () => {
    const newest = await agentA.get("/claims");
    expect(order(newest.text, all)).toEqual(["Moth spies claim", "Yacht purchase claim", "Bank heist claim"]);

    const oldest = await agentA.get("/claims").query({ sort: "oldest" });
    expect(order(oldest.text, all)).toEqual(["Bank heist claim", "Yacht purchase claim", "Moth spies claim"]);

    // The yacht story's first sighting (2023) comes before the bank story's
    // (2026); a claim with no observations goes last.
    const earliest = await agentA.get("/claims").query({ sort: "earliest" });
    expect(order(earliest.text, all)).toEqual(["Yacht purchase claim", "Bank heist claim", "Moth spies claim"]);
  });

  it("ignores unknown filter values instead of failing", async () => {
    const res = await agentA.get("/claims").query({ status: "bogus", sort: "DROP TABLE", q: "_" });
    expect(res.status).toBe(200);
  });
});
