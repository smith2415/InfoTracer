// GDELT source: searches worldwide online news coverage through the GDELT
// DOC 2.0 API (free, no key) and returns the earliest articles as
// observations.
//
// GDELT's article list only covers the most recent 3 months of whatever date
// range you ask for, so a plain search would miss early coverage. Instead:
//   1. Ask for the daily article count since 2017 (GDELT's archive start)
//      and find the first day the phrase appeared.
//   2. List articles from that day forward, oldest first.
// GDELT asks for at most one request every 5 seconds, so the second request
// waits.

import { SourceError } from "./source-error.js";

const ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const ARCHIVE_START = "20170101000000";
const WINDOW_DAYS = 90; // GDELT's article list limit
const PAUSE_MS = 5500;
const MAX_ARTICLES = 250;

// GDELT's search language: letters, numbers and spaces only, and several
// words in quotes to search them as an exact phrase. "$12 billion" becomes
// "12 billion".
export function gdeltQuery(text) {
  const cleaned = String(text || "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.includes(" ") ? `"${cleaned}"` : cleaned;
}

// "20260302T091500Z" -> "2026-03-02T09:15:00Z"
export function parseGdeltDate(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T?(\d{2})(\d{2})(\d{2}))?Z?$/.exec(String(value || ""));
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

// 2026-03-02T09:15:00Z -> "20260302091500"
function gdeltTimestamp(date) {
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

export function toObservation(article) {
  const notes = [];
  if (article.title) notes.push(`Headline: ${article.title}`);
  const origin = [article.language, article.sourcecountry].filter(Boolean).join(", ");
  if (origin) notes.push(`Language and country: ${origin}`);
  notes.push("Date is when GDELT first saw the article, which can be slightly after it was published.");
  return {
    observedAt: parseGdeltDate(article.seendate),
    location: "News site",
    poster: article.domain || null,
    postText: null, // fill in the claim's exact wording from the article
    url: article.url || null,
    notes: notes.join("\n").slice(0, 2000),
    foundBy: "gdelt",
  };
}

export function createGdeltSource({
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => new Date(),
} = {}) {
  // GDELT answers errors as plain text (sometimes with status 200), so read
  // the body as text first and only then parse it.
  async function request(params) {
    let res;
    try {
      res = await fetchImpl(`${ENDPOINT}?${new URLSearchParams({ ...params, format: "json" })}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new SourceError("unavailable");
    }
    const text = await res.text().catch(() => "");
    if (res.status === 429 || /limit requests/i.test(text)) throw new SourceError("rate_limited");
    if (!res.ok) throw new SourceError("unavailable");
    const trimmed = text.trim();
    if (!trimmed) return {};
    if (!trimmed.startsWith("{")) {
      throw new SourceError("rejected", trimmed.replace(/\s+/g, " ").slice(0, 200));
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new SourceError("unavailable");
    }
  }

  return {
    name: "gdelt",
    label: "GDELT news",
    unit: "article",

    async search(text) {
      const query = gdeltQuery(text);
      if (!query) throw new SourceError("rejected", "Enter a phrase with letters or numbers.");
      const end = now();

      // 1. Daily article counts since 2017: when did the phrase first appear?
      const timeline = await request({
        query,
        mode: "TimelineVolRaw",
        timelinesmooth: "0",
        startdatetime: ARCHIVE_START,
        enddatetime: gdeltTimestamp(end),
      });
      const points = timeline.timeline?.[0]?.data || [];
      const withArticles = points.filter((p) => Number(p.value) > 0);
      const totalFound = withArticles.reduce((sum, p) => sum + Number(p.value), 0);
      if (withArticles.length === 0) return { observations: [], totalFound: 0, reachedEnd: true };

      // 2. The articles from that first day forward, oldest first.
      const first = new Date(parseGdeltDate(withArticles[0].date));
      first.setUTCHours(0, 0, 0, 0);
      const windowEnd = new Date(Math.min(end.getTime(), first.getTime() + WINDOW_DAYS * 86400000));
      await pause(PAUSE_MS);
      const list = await request({
        query,
        mode: "ArtList",
        sort: "DateAsc",
        maxrecords: String(MAX_ARTICLES),
        startdatetime: gdeltTimestamp(first),
        enddatetime: gdeltTimestamp(windowEnd),
      });

      const observations = (Array.isArray(list.articles) ? list.articles : [])
        .map(toObservation)
        .filter((o) => o.url && o.observedAt)
        .sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
      return { observations, totalFound, reachedEnd: true };
    },
  };
}
