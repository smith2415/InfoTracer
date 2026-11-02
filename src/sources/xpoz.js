// Xpoz source: searches X, Reddit and (optionally) Instagram and TikTok
// through Xpoz's official SDK, and returns the posts as observations.
//
// Xpoz doesn't disclose how it collects its data, so every result is
// flagged "verify" on the claim page (PLAN.md section 5).
//
// Settings (Replit Secrets):
//   XPOZ_API_KEY     required
//   XPOZ_PLATFORMS   optional, e.g. "twitter,reddit,tiktok,instagram".
//                    Defaults to "twitter,reddit" (about 4 credits a search;
//                    TikTok adds 5, Instagram 12).

import { SourceError } from "./source-error.js";

const LIMIT_PER_PLATFORM = 300; // the most Xpoz returns in one "fast" call
export const DEFAULT_PLATFORMS = ["twitter", "reddit"];
export const PLATFORMS = {
  twitter: { location: "X", credits: 2 },
  reddit: { location: "Reddit", credits: 2 },
  tiktok: { location: "TikTok", credits: 5 },
  instagram: { location: "Instagram", credits: 12 },
};

const VERIFY_NOTE = "Found through Xpoz. Verify before relying on it: Xpoz doesn't disclose how it collects its data.";

export function parsePlatforms(value) {
  const chosen = String(value || "")
    .toLowerCase()
    .split(/[\s,]+/)
    .map((p) => (p === "x" ? "twitter" : p))
    .filter((p) => PLATFORMS[p]);
  return chosen.length ? [...new Set(chosen)] : DEFAULT_PLATFORMS;
}

// Xpoz dates can be ISO text or a Unix time in seconds or milliseconds.
export function parseXpozDate(value) {
  if (value === null || value === undefined || value === "") return null;
  let date;
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value))) {
    const n = Number(value);
    date = new Date(n < 1e12 ? n * 1000 : n);
  } else {
    date = new Date(String(value));
  }
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function httpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
}

// One post from any platform as an observation.
export function toObservation(platform, post) {
  const notes = [VERIFY_NOTE];
  let poster = null;
  let text = null;
  let url = null;

  if (platform === "twitter") {
    poster = post.authorUsername ? `@${post.authorUsername}` : null;
    text = post.text || null;
    if (post.id) {
      url = post.authorUsername
        ? `https://x.com/${encodeURIComponent(post.authorUsername)}/status/${encodeURIComponent(post.id)}`
        : `https://x.com/i/web/status/${encodeURIComponent(post.id)}`;
    }
    if (post.deleted) notes.push("Xpoz marks this post as deleted; the link may no longer work.");
  } else if (platform === "reddit") {
    poster = post.authorUsername ? `u/${post.authorUsername}` : null;
    text = [post.title, post.selftext].filter(Boolean).join("\n\n") || null;
    const permalink = post.permalink
      ? httpUrl(post.permalink) || `https://www.reddit.com${post.permalink.startsWith("/") ? "" : "/"}${post.permalink}`
      : null;
    url = httpUrl(post.postUrl) || permalink || httpUrl(post.url);
    if (post.subredditName) notes.push(`Subreddit: r/${post.subredditName}`);
  } else if (platform === "instagram") {
    poster = post.username ? `@${post.username}` : null;
    text = post.caption || post.subtitles || null;
    url = httpUrl(post.codeUrl);
  } else if (platform === "tiktok") {
    poster = post.username ? `@${post.username}` : null;
    text = post.description || null;
    if (post.username && post.id) {
      url = `https://www.tiktok.com/@${encodeURIComponent(post.username)}/video/${encodeURIComponent(post.id)}`;
    }
  }

  return {
    observedAt: parseXpozDate(post.createdAt ?? post.createdAtTimestamp ?? post.createdAtDate),
    location: PLATFORMS[platform].location,
    poster,
    postText: text ? String(text).slice(0, 2000) : null,
    url,
    notes: notes.join("\n"),
    foundBy: "xpoz",
  };
}

// Turns an SDK error into a SourceError. The SDK's error class names tell us
// what happened; messages are only passed on for validation errors.
function toSourceError(err) {
  const name = err?.name || err?.constructor?.name || "";
  const message = String(err?.message || "");
  if (name === "AuthenticationError") return new SourceError("rejected");
  if (/credit|quota|insufficient|exceeded/i.test(message)) return new SourceError("out_of_credits");
  if (/rate.?limit|too many/i.test(message)) return new SourceError("rate_limited");
  if (name === "ValidationError") return new SourceError("bad_query", message.slice(0, 200));
  return new SourceError("unavailable");
}

async function loadClient(options) {
  const { XpozClient } = await import("@xpoz/xpoz");
  return new XpozClient(options);
}

export function createXpozSource({
  apiKey = process.env.XPOZ_API_KEY,
  platforms = parsePlatforms(process.env.XPOZ_PLATFORMS),
  createClient = loadClient,
  timeoutMs = 30000,
} = {}) {
  return {
    name: "xpoz",
    label: `Xpoz (${platforms.map((p) => PLATFORMS[p].location).join(", ")})`,

    async search(query) {
      if (!apiKey) throw new SourceError("not_configured");

      let client;
      try {
        client = await createClient({ apiKey, versionCheck: false, timeoutMs });
        await client.connect();
      } catch (err) {
        throw toSourceError(err);
      }

      try {
        const settled = await Promise.allSettled(
          platforms.map((p) =>
            client[p].searchPosts(query, {
              responseType: "fast",
              limit: LIMIT_PER_PLATFORM,
              ...(p === "twitter" ? { filterOutRetweets: true } : {}),
            })
          )
        );

        const failures = settled.filter((s) => s.status === "rejected");
        if (failures.length === settled.length) throw toSourceError(failures[0].reason);

        let reachedEnd = true;
        const observations = [];
        const skipped = [];
        settled.forEach((outcome, i) => {
          const platform = platforms[i];
          if (outcome.status === "rejected") {
            skipped.push(PLATFORMS[platform].location);
            return;
          }
          const posts = Array.isArray(outcome.value?.data) ? outcome.value.data : [];
          if (posts.length >= LIMIT_PER_PLATFORM) reachedEnd = false;
          observations.push(...posts.map((post) => toObservation(platform, post)));
        });

        const usable = observations
          .filter((o) => o.url && o.observedAt)
          .sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
        const result = { observations: usable, totalFound: usable.length, reachedEnd };
        if (skipped.length) result.warning = `${skipped.join(" and ")} didn't respond, so those results are missing.`;
        return result;
      } finally {
        await client.close().catch(() => {});
      }
    },
  };
}
