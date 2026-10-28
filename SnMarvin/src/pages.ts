/** Page-range parsing and usage estimates for multi-page sends. */

/** Above this many pages, ask before sending. */
export const CONFIRM_ABOVE_PAGES = 10;

/** Pages per Claude request; keeps requests (and device memory) small. */
export const PAGES_PER_REQUEST = 5;

/**
 * Parses "1-3, 5, 8-10" (1-based, as shown on the device) into sorted,
 * unique 0-based page indexes. Throws with a user-facing message if invalid.
 */
export function parsePageList(text: string, totalPages: number): number[] {
  const pages = new Set<number>();
  const parts = text.split(/[,\s]+/).filter(Boolean);
  if (!parts.length) {
    throw new Error('Enter pages like 1-3, 5');
  }
  for (const part of parts) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) {
      throw new Error(`"${part}" isn't a page or range. Use pages like 1-3, 5`);
    }
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to < from || to > totalPages) {
      throw new Error(`"${part}" is outside pages 1-${totalPages}`);
    }
    for (let p = from; p <= to; p++) {
      pages.add(p - 1);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// Rough cost per page image (~2,500 input tokens after Claude's resize, plus output).
const DOLLARS_PER_PAGE: Record<string, number> = {
  'claude-opus-5-5': 0.011,
  'claude-sonnet-5-5': 0.006,
  'claude-haiku-5-5': 0.0004,
};
const SECONDS_PER_PAGE = 4;

/** e.g. "About 2 minutes and roughly $0.25 with claude-opus-5-5." */
export function estimateUsage(pageCount: number, model: string): string {
  const seconds = pageCount * SECONDS_PER_PAGE + 10;
  const time =
    seconds < 90 ? `About ${Math.max(10, Math.round(seconds / 10) * 10)} seconds` : `About ${Math.round(seconds / 60)} minutes`;
  const rate = DOLLARS_PER_PAGE[model];
  if (rate === undefined) {
    return `${time}. Each page is billed to your Anthropic account.`;
  }
  const cost = pageCount * rate;
  const dollars = cost < 0.01 ? 'under $0.01' : `$${cost.toFixed(2)}`;
  return `${time} and roughly ${dollars} with ${model}, billed to your Anthropic account.`;
}
