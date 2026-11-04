import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";

// Needs a PostgreSQL database in TEST_DATABASE_URL (or DATABASE_URL).
// These checks cover Spine #1; the two graded tests come later.
const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const app = createApp(pool, { sessionSecret: "test-secret" });
const email = `tester-${Date.now()}@example.com`;
const password = "correct-horse-battery";

beforeAll(async () => {
  await migrate(pool);
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
  await pool.end();
});

describe("sign up and login", () => {
  it("sends signed-out visitors to the login page", async () => {
    const res = await request(app).get("/claims");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("creates a user row with a hashed password on sign up", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/signup").type("form").send({ email, password });
    expect(res.headers.location).toBe("/welcome");

    const { rows } = await pool.query("SELECT password_hash FROM users WHERE email = $1", [email]);
    expect(rows).toHaveLength(1);
    expect(rows[0].password_hash).not.toBe(password);

    const claims = await agent.get("/claims");
    expect(claims.status).toBe(200);
    expect(claims.text).toContain(email);
  });

  it("refuses a duplicate email with a friendly message", async () => {
    const res = await request(app).post("/signup").type("form").send({ email, password });
    expect(res.status).toBe(400);
    expect(res.text).toContain("already exists");
  });

  it("rejects a wrong password", async () => {
    const res = await request(app).post("/login").type("form").send({ email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("logs in and logs out", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/login").type("form").send({ email, password });
    expect(login.headers.location).toBe("/welcome");
    expect((await agent.get("/claims")).status).toBe(200);

    await agent.post("/logout");
    const after = await agent.get("/claims");
    expect(after.headers.location).toBe("/login");
  });
});
