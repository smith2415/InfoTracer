// Embedding InfoTracer as a page on the Planting Weeds site.
//
// The Planting Weeds site (smith2415.github.io) shows the app in a frame.
// That needs three things:
//   1. Only Planting Weeds (and the app itself) may frame the app, so no other
//      site can show it inside a page built to trick people into clicking.
//   2. The login cookie has to work inside the frame. Browsers only send a
//      cookie into a frame on another site when it's marked SameSite=None and
//      Secure (and Partitioned, for browsers that keep a separate cookie jar
//      for each site a frame appears on).
//   3. SameSite=Lax used to stop other sites from submitting forms to the app
//      with a signed-in user's cookie. With SameSite=None, sameSiteFormsOnly
//      does that job instead.

export const DEFAULT_FRAME_ANCESTORS = "https://smith2415.github.io";

// Sites allowed to show the app in a frame, from the FRAME_ANCESTORS setting
// (space- or comma-separated) or the default.
export function frameAncestors(value = process.env.FRAME_ANCESTORS) {
  const list = String(value || DEFAULT_FRAME_ANCESTORS)
    .split(/[\s,]+/)
    .filter(
      (origin) =>
        /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) // local previews
    );
  return ["'self'", ...list].join(" ");
}

export function allowFramingBy(ancestors = frameAncestors()) {
  const policy = `frame-ancestors ${ancestors}`;
  return (req, res, next) => {
    res.set("Content-Security-Policy", policy);
    next();
  };
}

// The host a request was addressed to, as the browser saw it.
function requestHost(req) {
  const forwarded = req.get("x-forwarded-host");
  return (forwarded ? forwarded.split(",")[0] : req.get("host") || "").trim().toLowerCase();
}

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

// Refuses form submissions that come from another site. Browsers send an
// Origin header (or at least a Referer) with every form post, naming the page
// the form was on. Requests with neither, such as from scripts and tests,
// can't carry a visitor's cookie by accident, so they're let through.
export function sameSiteFormsOnly(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const origin = req.get("origin");
  const referer = req.get("referer");
  const from = origin ? (origin === "null" ? null : hostOf(origin)) : referer ? hostOf(referer) : undefined;
  if (from === undefined || from === requestHost(req)) return next();

  console.warn(`Refused a ${req.method} to ${req.path} from another site (${origin || referer})`);
  res.status(403).render("message", {
    title: "Request refused",
    message: "That form came from another website, so it wasn't accepted. Open InfoTracer directly and try again.",
  });
}
