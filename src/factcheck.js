// Searches Google's Fact Check Tools API (the data behind Fact Check
// Explorer) for fact-checks of a claim.
//
// The API key stays on the server: it's read from the
// GOOGLE_FACTCHECK_API_KEY secret, sent only to Google, and never included
// in pages, logs or error messages.

const ENDPOINT = "https://factchecktools.googleapis.com/v1alpha1/claims:search";

export class FactCheckError extends Error {
  // kind: not_configured | rejected | rate_limited | unavailable
  constructor(kind) {
    super(`Fact-check lookup failed: ${kind}`);
    this.kind = kind;
  }
}

export const FACT_CHECK_MESSAGES = {
  not_configured:
    "Fact-check lookup isn't set up yet. Add a GOOGLE_FACTCHECK_API_KEY secret to turn it on.",
  rejected:
    "Google's Fact Check service didn't accept the request. Check that the API key is valid and the Fact Check Tools API is enabled for it.",
  rate_limited: "Too many searches in a short time. Try again in a minute.",
  unavailable: "Couldn't reach Google's Fact Check service. Try again in a moment.",
};

// Turns the API's response into the fields the page shows. Anything missing
// becomes null, so a partial response never breaks the page.
export function parseFactChecks(data) {
  const claims = Array.isArray(data?.claims) ? data.claims : [];
  return claims
    .map((c) => ({
      text: typeof c.text === "string" ? c.text : "",
      claimant: c.claimant || null,
      claimDate: c.claimDate || null,
      reviews: (Array.isArray(c.claimReview) ? c.claimReview : []).map((r) => ({
        publisher: r.publisher?.name || r.publisher?.site || "Unknown publisher",
        site: r.publisher?.site || null,
        url: r.url || null,
        title: r.title || null,
        reviewDate: r.reviewDate || null,
        rating: r.textualRating || null,
        language: r.languageCode || null,
      })),
    }))
    .filter((c) => c.reviews.length > 0);
}

// Colors a fact-checker's free-text rating: red for false or misleading,
// green for true, neutral for anything else ("Mixture", "Unproven"...).
export function ratingTone(rating) {
  const r = String(rating || "").toLowerCase();
  if (!r) return "neutral";
  // Includes common Spanish, French, German and Portuguese ratings.
  if (/\b(false|fake|fabricated|misleading|incorrect|pants on fire|hoax|scam|not true|no evidence|baseless|altered|manipulated|satire|falso|falsa|engañoso|enganoso|faux|fausse|trompeur|falsch|irreführend)\b/.test(r)) {
    return "false";
  }
  if (/\b(true|correct|accurate|verdadero|verdadeiro|vrai|wahr|richtig)\b/.test(r)) return "true";
  return "neutral";
}

export function createFactCheckSearch({
  apiKey = process.env.GOOGLE_FACTCHECK_API_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
} = {}) {
  return async function searchFactChecks(query) {
    if (!apiKey) throw new FactCheckError("not_configured");

    const url = new URL(ENDPOINT);
    url.searchParams.set("query", query);
    url.searchParams.set("pageSize", "10");
    url.searchParams.set("key", apiKey);

    let res;
    try {
      res = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new FactCheckError("unavailable");
    }

    if (res.status === 429) throw new FactCheckError("rate_limited");
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new FactCheckError("rejected");
    }
    if (!res.ok) throw new FactCheckError("unavailable");

    let data;
    try {
      data = await res.json();
    } catch {
      throw new FactCheckError("unavailable");
    }
    return parseFactChecks(data);
  };
}
