import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./auth.js";
import { claimsRouter } from "./claims.js";
import { createFactCheckSearch } from "./factcheck.js";
import * as format from "./format.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// options.factCheckSearch lets tests replace the real Google lookup.
export function createApp(pool, { sessionSecret = process.env.SESSION_SECRET, factCheckSearch } = {}) {
  const isProduction = process.env.NODE_ENV === "production";
  if (!sessionSecret) {
    if (isProduction) throw new Error("SESSION_SECRET must be set in production.");
    sessionSecret = "dev-only-secret";
  }

  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));
  // Replit serves the app behind a proxy that handles HTTPS.
  app.set("trust proxy", 1);

  app.use(express.static(path.join(root, "public")));
  // Chart.js for the dashboard, served from the installed package.
  app.use(
    "/vendor/chart.js",
    express.static(path.join(root, "node_modules", "chart.js", "dist"), { maxAge: "7d" })
  );
  app.use(express.urlencoded({ extended: false }));

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      name: "infotracer.sid",
      store: new PgStore({ pool, createTableIfMissing: true }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  // Display helpers (dash, formatDateTime, ...) for every page.
  Object.assign(app.locals, format);

  // Makes the signed-in user available to every page.
  app.use((req, res, next) => {
    res.locals.currentUser = req.session.userId
      ? { id: req.session.userId, email: req.session.email }
      : null;
    next();
  });

  app.get("/", (req, res) => {
    res.redirect(req.session.userId ? "/claims" : "/login");
  });

  app.use(authRouter(pool));

  app.use(claimsRouter(pool, { factCheckSearch: factCheckSearch || createFactCheckSearch() }));

  app.use((req, res) => {
    res.status(404).render("message", {
      title: "Page not found",
      message: "That page doesn't exist.",
    });
  });

  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).render("message", {
      title: "Something went wrong",
      message: "Something went wrong on our end. Try again in a moment.",
    });
  });

  return app;
}
