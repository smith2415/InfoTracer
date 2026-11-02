import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { frameAncestors } from "../src/embed.js";

// Checks for embedding InfoTracer on the Planting Weeds site.

describe("Embedding on Planting Weeds", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const app = createApp(pool, { sessionSecret: "test-secret", sources: [] });
  const stamp = Date.now();
  const emails = [`embed-a-${stamp}@example.com`, `embed-b-${stamp}@example.com`];
  const agent = request.agent(app);
  const HOST = "info-tracer.test";

  beforeAll(async () => {
    await migrate(pool);
    await agent.post("/signup").type("form").send({ email: emails[0], password: "embed-pass-a" });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
    await pool.end();
  });

  it("lets only Planting Weeds and the app itself show it in a frame", async () => {
    const res = await request(app).get("/login");
    expect(res.headers["content-security-policy"]).toBe("frame-ancestors 'self' https://smith2415.github.io");
    expect(frameAncestors("https://a.example, http://insecure.example javascript:x http://localhost:4000")).toBe("'self' https://a.example http://localhost:4000");
  });

  it("uses a cookie that works inside the frame over HTTPS", async () => {
    const res = await request(app)
      .post("/signup")
      .set("X-Forwarded-Proto", "https")
      .type("form")
      .send({ email: emails[1], password: "embed-pass-b" });
    const cookie = res.headers["set-cookie"].join(";");
    expect(cookie).toMatch(/SameSite=None/i);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/Partitioned/);
  });

  it("keeps the ordinary cookie over plain HTTP", async () => {
    const res = await request(app).post("/login").type("form").send({ email: emails[0], password: "embed-pass-a" });
    const cookie = res.headers["set-cookie"].join(";");
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/);
  });

  const claimCount = async () =>
    (await pool.query("SELECT COUNT(*)::int AS n FROM claims c JOIN users u ON u.id = c.user_id WHERE u.email = $1", [emails[0]])).rows[0].n;

  it("refuses forms submitted from another site", async () => {
    const before = await claimCount();
    const fromOrigin = await agent.post("/claims").set("Host", HOST).set("Origin", "https://evil.example").type("form").send({ claim_text: "Forged" });
    expect(fromOrigin.status).toBe(403);
    expect(fromOrigin.text).toContain("That form came from another website");
    const fromReferer = await agent.post("/claims").set("Host", HOST).set("Referer", "https://evil.example/page").type("form").send({ claim_text: "Forged" });
    expect(fromReferer.status).toBe(403);
    const fromSandbox = await agent.post("/claims").set("Host", HOST).set("Origin", "null").type("form").send({ claim_text: "Forged" });
    expect(fromSandbox.status).toBe(403);
    expect(await claimCount()).toBe(before);
  });

  it("accepts forms from the app's own pages, including inside the frame", async () => {
    const before = await claimCount();
    const own = await agent.post("/claims").set("Host", HOST).set("Origin", `https://${HOST}`).type("form").send({ claim_text: "Own form" });
    expect(own.status).toBe(302);
    // Behind Replit's proxy the forwarded host is the one the browser used.
    const proxied = await agent
      .post("/claims")
      .set("Host", "10.0.0.5:5000")
      .set("X-Forwarded-Host", HOST)
      .set("Referer", `https://${HOST}/claims/new`)
      .type("form")
      .send({ claim_text: "Own form via proxy" });
    expect(proxied.status).toBe(302);
    expect(await claimCount()).toBe(before + 2);
  });
});
