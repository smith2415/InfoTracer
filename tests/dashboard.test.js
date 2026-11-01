import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { weedShare } from "../src/models.js";

// GRADED TEST 2: Dashboard stat (PLAN.md section 4)
//
// Given a user has 2 claims with 10 observations in total, 3 of which are
// marked as weeds, when the user opens the dashboard, then the "share of
// observations marked as weeds" stat shows 30%.

const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const app = createApp(pool, { sessionSecret: "test-secret" });
const email = `dashboard-${Date.now()}@example.com`;
const agent = request.agent(app);

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
  await pool.end();
});

describe("dashboard stat: share of observations marked as weeds", () => {
  beforeAll(async () => {
    await migrate(pool);
    await agent.post("/signup").type("form").send({ email, password: "dashboard-pass" });

    // Given: 2 claims, with 6 and 4 observations (10 in total)...
    const observationIds = [];
    for (const [claimText, count] of [["First claim", 6], ["Second claim", 4]]) {
      const claim = await agent.post("/claims").type("form").send({ claim_text: claimText });
      const claimId = Number(claim.headers.location.split("/").pop());
      for (let i = 0; i < count; i++) {
        const obs = await agent
          .post(`/claims/${claimId}/observations`)
          .type("form")
          .send({ location: i % 2 === 0 ? "X" : "Telegram" });
        observationIds.push(Number(obs.headers.location.split("#observation-")[1]));
      }
    }

    // ...and 3 of them marked as weeds.
    for (const id of observationIds.slice(0, 3)) {
      await agent.post(`/observations/${id}/weed`);
    }
  });

  it("shows 30% when 3 of 10 observations are weeds", async () => {
    // When: the user opens the dashboard.
    const res = await agent.get("/dashboard");
    expect(res.status).toBe(200);

    // Then: the stat shows 30%.
    const stat = res.text.match(/data-stat="weed-share">([^<]*)</);
    expect(stat[1]).toBe("30%");
    expect(res.text).toContain("3 of 10 observations");
  });
});

describe("weedShare calculation", () => {
  it("rounds to a whole percentage and handles no observations", () => {
    expect(weedShare(3, 10)).toBe(30);
    expect(weedShare(1, 3)).toBe(33);
    expect(weedShare(0, 5)).toBe(0);
    expect(weedShare(0, 0)).toBeNull();
  });
});
