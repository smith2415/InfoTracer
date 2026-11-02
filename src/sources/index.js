// Source search (Custom #3): runs every configured source behind one button
// and saves the earliest results as observations on a claim.

import { SourceError } from "./source-error.js";
import { createBlueskySource } from "./bluesky.js";
import { createGdeltSource } from "./gdelt.js";

export { SourceError };

// How many of the earliest new results to save per source, so one search
// doesn't bury the timeline in hundreds of reposts.
export const SAVE_PER_SOURCE = 10;

export const SOURCE_MESSAGES = {
  bluesky: {
    not_configured:
      "Bluesky search isn't set up yet. Add BLUESKY_HANDLE and BLUESKY_APP_PASSWORD secrets to turn it on.",
    rejected:
      "Bluesky didn't accept the login. Check the BLUESKY_HANDLE and BLUESKY_APP_PASSWORD secrets.",
    rate_limited: "Bluesky is limiting searches right now. Try again in a few minutes.",
    unavailable: "Couldn't reach Bluesky. Try again in a moment.",
  },
  gdelt: {
    rejected: "GDELT couldn't run that search. Try a different phrase.",
    rate_limited: "GDELT is limiting searches right now. Wait a minute and try again.",
    unavailable: "GDELT didn't respond. Its servers can be slow; try again in a moment.",
  },
};

export function createDefaultSources() {
  return [createBlueskySource(), createGdeltSource()];
}

// Runs all sources at once, so a slow or failing one doesn't hold up the rest.
// Returns one entry per source: { name, label, result } or { name, label, error }.
export async function searchAllSources(sources, query) {
  const settled = await Promise.allSettled(sources.map((s) => s.search(query)));
  return settled.map((outcome, i) => {
    const { name, label, unit = "post" } = sources[i];
    if (outcome.status === "fulfilled") return { name, label, unit, result: outcome.value };
    const err = outcome.reason;
    if (!(err instanceof SourceError)) throw err;
    console.warn(`${label}: ${err.message}`); // never includes credentials
    let message = SOURCE_MESSAGES[name]?.[err.kind] || `${label} search didn't work. Try again later.`;
    if (err.detail) message += ` ${label} said: "${err.detail}"`;
    return { name, label, error: message };
  });
}

// Normalizes a link for duplicate checks: no trailing slash, any case.
export function urlKey(url) {
  return String(url || "").trim().replace(/\/+$/, "").toLowerCase();
}
