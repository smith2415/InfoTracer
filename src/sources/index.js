// Source search (Custom #3): runs every configured source behind one button
// and saves the earliest results as observations on a claim.

import { SourceError } from "./source-error.js";
import { createBlueskySource } from "./bluesky.js";
import { createGdeltSource } from "./gdelt.js";
import { createXpozSource } from "./xpoz.js";

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
  xpoz: {
    not_configured: "Xpoz search isn't set up yet. Add an XPOZ_API_KEY secret to turn it on.",
    rejected: "Xpoz didn't accept the API key. Check the XPOZ_API_KEY secret.",
    out_of_credits: "Xpoz's credits are used up for now. Bluesky and GDELT still work.",
    rate_limited: "Xpoz is limiting searches right now. Try again in a few minutes.",
    bad_query: "Xpoz couldn't run that search. Try a different phrase.",
    unavailable: "Couldn't reach Xpoz. Try again in a moment.",
  },
};

export function createDefaultSources() {
  return [createBlueskySource(), createGdeltSource(), createXpozSource()];
}

// The most time a whole source search may take. Results from sources that
// finish in time are kept; any source still running is reported as slow.
export const SEARCH_TIME_LIMIT_MS = 60_000;

const TIMED_OUT = Symbol("timed out");

// Runs all sources at once, so a slow or failing one doesn't hold up the rest.
// Returns one entry per source, in the sources' order:
//   { name, label, unit, result, seconds }        it worked
//   { name, label, error, seconds, timedOut? }    it failed or ran out of time
// onSettle(entry) is called as each source finishes, for progress updates.
// Each source's time is written to the log (never with credentials).
export async function searchAllSources(
  sources,
  query,
  { timeLimitMs = SEARCH_TIME_LIMIT_MS, onSettle = () => {} } = {}
) {
  const started = Date.now();
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(resolve, timeLimitMs, TIMED_OUT);
  });

  try {
    return await Promise.all(
      sources.map(async (source) => {
        const { name, label, unit = "post" } = source;
        const run = Promise.resolve()
          .then(() => source.search(query))
          .then((result) => ({ result }), (err) => ({ err }));
        const outcome = await Promise.race([run, deadline]);
        const seconds = Math.round((Date.now() - started) / 100) / 10;

        let entry;
        if (outcome === TIMED_OUT) {
          const limit = Math.round(timeLimitMs / 1000);
          console.warn(`Source search: ${label} gave no answer within ${limit}s`);
          entry = {
            name,
            label,
            seconds,
            timedOut: true,
            error: `${label} took longer than ${limit} seconds, so its results were skipped. Try again later.`,
          };
        } else if (outcome.err) {
          const err = outcome.err;
          if (!(err instanceof SourceError)) throw err;
          console.warn(`Source search: ${label} failed after ${seconds}s: ${err.message}`);
          let message = SOURCE_MESSAGES[name]?.[err.kind] || `${label} search didn't work. Try again later.`;
          if (err.detail) message += ` ${label} said: "${err.detail}"`;
          entry = { name, label, seconds, error: message };
        } else {
          console.log(`Source search: ${label} finished in ${seconds}s (${outcome.result.totalFound} found)`);
          entry = { name, label, unit, seconds, result: outcome.result };
        }
        onSettle(entry);
        return entry;
      })
    );
  } finally {
    clearTimeout(timer);
  }
}

// Normalizes a link for duplicate checks: no trailing slash, any case.
export function urlKey(url) {
  return String(url || "").trim().replace(/\/+$/, "").toLowerCase();
}
