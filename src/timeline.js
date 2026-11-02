// Lays out a claim's observations on a time axis drawn to scale.
//
// The result is plain data (positions, labels, kinds) that the claim page
// draws as an SVG "vine," so the timeline works without any JavaScript.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 24 * 60 * 60 * 1000;

export const TIMELINE = {
  width: 1000, // SVG units; the drawing scales to fit the page
  left: 40,
  right: 960,
  rowGap: 26, // vertical space between stacked markers
  minGap: 22, // markers closer than this move up a row instead of overlapping
  maxRows: 3,
};

function shortDate(d) {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function describeSpan(ms) {
  const days = Math.round(ms / DAY);
  if (days < 1) {
    const hours = Math.round(ms / (60 * 60 * 1000));
    return hours <= 1 ? "within an hour" : `over ${hours} hours`;
  }
  if (days === 1) return "over 1 day";
  if (days < 60) return `over ${days} days`;
  const months = Math.round(days / 30);
  if (months < 24) return `over ${months} months`;
  return `over ${Math.round(days / 365)} years`;
}

// Evenly spaced date labels for the axis (first and last always included).
function axisTicks(start, end) {
  const span = end - start;
  if (span <= 0) return [{ x: (TIMELINE.left + TIMELINE.right) / 2, label: shortDate(new Date(start)) }];
  const count = 4;
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = start + (span * i) / count;
    return { x: TIMELINE.left + ((TIMELINE.right - TIMELINE.left) * i) / count, label: shortDate(new Date(t)) };
  });
}

export function buildTimeline(observations) {
  const dated = observations
    .filter((o) => o.observed_at && !Number.isNaN(new Date(o.observed_at).getTime()))
    .map((o) => ({ ...o, time: new Date(o.observed_at).getTime() }))
    .sort((a, b) => a.time - b.time || a.id - b.id);
  const undated = observations.filter((o) => !dated.some((d) => d.id === o.id));

  if (dated.length === 0) {
    return { points: [], ticks: [], undated, rows: 1, summary: null };
  }

  const start = dated[0].time;
  const end = dated[dated.length - 1].time;
  const span = end - start;
  const usable = TIMELINE.right - TIMELINE.left;

  // Place each marker; if it would overlap the previous marker in a row,
  // try the next row up, so close-together posts stay readable.
  const lastXInRow = [];
  const points = dated.map((o, index) => {
    const x = span === 0 ? TIMELINE.left + usable / 2 : TIMELINE.left + ((o.time - start) / span) * usable;
    let row = 0;
    while (row < TIMELINE.maxRows - 1 && lastXInRow[row] !== undefined && x - lastXInRow[row] < TIMELINE.minGap) {
      row += 1;
    }
    lastXInRow[row] = x;
    const kind = o.is_seed ? "seed" : o.is_weed ? "weed" : "observation";
    return {
      id: o.id,
      x,
      row,
      kind,
      isWeed: Boolean(o.is_weed),
      isEarliest: index === 0,
      label: `${shortDate(new Date(o.time))} · ${o.location}${o.poster ? " · " + o.poster : ""}`,
    };
  });

  const first = dated[0];
  return {
    points,
    ticks: axisTicks(start, end),
    undated,
    rows: Math.max(...points.map((p) => p.row)) + 1,
    summary: {
      earliestDate: shortDate(new Date(first.time)),
      earliestLocation: first.location,
      earliestPoster: first.poster || null,
      earliestIsSeed: Boolean(first.is_seed),
      spread: dated.length > 1 ? describeSpan(span) : null,
      datedCount: dated.length,
    },
  };
}
