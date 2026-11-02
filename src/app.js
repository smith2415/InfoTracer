import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./auth.js";
import { claimsRouter } from "./claims.js";
import { createFactCheckSearch } from "./factcheck.js";
import { createDefaultSources } from "./sources/index.js";
import * as format from "./format.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// options.factCheckSearch and options.sources let tests replace the real
// outside services (Google, Bluesky) with stand-ins.
export function createApp(pool, { sessionSecret = process.env.SESSION_SECRET, factCheckSearch, sources } = {}) {
  const isProduction = process.env.NODE_ENV === "production";
  if (!sessionSecret) {
    if (isProduction) throw new Error("SESSION_SECRET must be set in production.");
    sessionSecret = "dev-only-secret";
  }

  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));
  // Compile each page template once and reuse it. Express only does this
  // when NODE_ENV is "production", which Replit doesn't set, so without this
  // every page was re-read from disk and recompiled on every request.
  app.set("view cache", true);
  // Replit serves the app behind a proxy that handles HTTPS.
  app.set("trust proxy", 1);

  // Browsers keep the stylesheet and icon for an hour instead of re-checking
  // them on every page.
  app.use(express.static(path.join(root, "public"), { maxAge: "1h" }));
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
      // disableTouch: don't write to the sessions table on every page view
      // just to push the expiry back. A login lasts 7 days from signing in,
      // which is also when the cookie expires (it isn't renewed either).
      // pruneSessionInterval: clear out expired logins once a day rather than
      // every 15 minutes, so an idle app isn't waking the database. Expired
      // logins are never accepted in the meantime.
      store: new PgStore({
        pool,
        createTableIfMissing: true,
        disableTouch: true,
        pruneSessionInterval: 60 * 60 * 24,
      }),
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

  app.use(
    claimsRouter(pool, {
      factCheckSearch: factCheckSearch || createFactCheckSearch(),
      sources: sources || createDefaultSources(),
    })
  );

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
