// Bluesky source: searches public Bluesky posts for a phrase and returns
// them as observations, oldest first.
//
// Uses Bluesky's official API with an app password (never your main
// password). Credentials come from the BLUESKY_HANDLE and
// BLUESKY_APP_PASSWORD secrets and stay on the server.

import { SourceError, kindForStatus } from "./source-error.js";

const PAGE_SIZE = 100; // the API's maximum per request
const MAX_PAGES = 5; // up to 500 posts per search
const TOKEN_LIFETIME_MS = 60 * 60 * 1000; // reuse a login for up to an hour
const BACKDATE_WARNING_MS = 24 * 60 * 60 * 1000;

// "2026-02-22 10:00 UTC"
function readable(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

// https://bsky.app/profile/{handle}/post/{id}, from an at:// post address.
export function postUrl(post) {
  const rkey = String(post.uri || "").split("/").pop();
  const who = post.author?.handle || post.author?.did;
  return rkey && who ? `https://bsky.app/profile/${who}/post/${rkey}` : null;
}

// One Bluesky post as an observation. A post's createdAt time is set by the
// app that posted it, so it can be backdated; when it's much earlier than
// when Bluesky indexed the post, the notes say so.
export function toObservation(post) {
  const created = post.record?.createdAt || post.indexedAt || null;
  const notes = [];
  if (post.author?.displayName) notes.push(`Display name: ${post.author.displayName}`);
  if (post.record?.createdAt && post.indexedAt) {
    const gap = new Date(post.indexedAt) - new Date(post.record.createdAt);
    if (gap > BACKDATE_WARNING_MS) {
      notes.push(
        `Check the date: the post says it was created ${readable(post.record.createdAt)}, but Bluesky first indexed it ${readable(post.indexedAt)}. Posts can be backdated.`
      );
    }
  }
  return {
    observedAt: created,
    location: "Bluesky",
    poster: post.author?.handle ? `@${post.author.handle}` : null,
    postText: typeof post.record?.text === "string" ? post.record.text.slice(0, 2000) : null,
    url: postUrl(post),
    notes: notes.length ? notes.join("\n") : null,
    foundBy: "bluesky",
  };
}

export function createBlueskySource({
  handle = process.env.BLUESKY_HANDLE,
  appPassword = process.env.BLUESKY_APP_PASSWORD,
  service = process.env.BLUESKY_SERVICE || "https://bsky.social",
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
  now = () => Date.now(),
} = {}) {
  let session = null; // { token, expires }

  async function request(path, init = {}) {
    try {
      return await fetchImpl(`${service}/xrpc/${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new SourceError("unavailable");
    }
  }

  async function login() {
    const res = await request("com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
    });
    const kind = kindForStatus(res.status);
    if (kind) throw new SourceError(kind);
    const data = await res.json().catch(() => ({}));
    if (!data.accessJwt) throw new SourceError("rejected");
    session = { token: data.accessJwt, expires: now() + TOKEN_LIFETIME_MS };
    return session.token;
  }

  async function token() {
    return session && session.expires > now() ? session.token : login();
  }

  async function searchPage(query, cursor, retried = false) {
    const params = new URLSearchParams({ q: query, sort: "latest", limit: String(PAGE_SIZE) });
    if (cursor) params.set("cursor", cursor);
    const res = await request(`app.bsky.feed.searchPosts?${params}`, {
      headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json" },
    });
    if (res.status === 401 && !retried) {
      session = null; // the login expired early; log in again once
      return searchPage(query, cursor, true);
    }
    const kind = kindForStatus(res.status);
    if (kind) throw new SourceError(kind);
    return res.json().catch(() => {
      throw new SourceError("unavailable");
    });
  }

  return {
    name: "bluesky",
    label: "Bluesky",

    // Returns { observations (oldest first), totalFound, reachedEnd }.
    async search(query) {
      if (!handle || !appPassword) throw new SourceError("not_configured");

      // Bluesky lists the newest posts first, so walk back page by page.
      const posts = [];
      let cursor;
      let reachedEnd = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await searchPage(query, cursor);
        const batch = Array.isArray(data.posts) ? data.posts : [];
        posts.push(...batch);
        cursor = data.cursor;
        if (!cursor || batch.length === 0) {
          reachedEnd = true;
          break;
        }
      }

      const observations = posts
        .map(toObservation)
        .filter((o) => o.url)
        .sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
      return { observations, totalFound: observations.length, reachedEnd };
    },
  };
}
