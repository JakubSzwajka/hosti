export type FuzzyMatch = {
  score: number;
  positions: number[];
};

const SCORE = {
  base: 1,
  wordStart: 8,
  titleStart: 6,
  consecutive: 8,
  gap: 0.4,
  gapCap: 12,
  lead: 0.1,
  leadCap: 20,
} as const;

export function hasQuery(query: string): boolean {
  return /\S/.test(query);
}

function isWordStart(chars: string[], index: number): boolean {
  if (index === 0) return true;
  const before = chars[index - 1] ?? "";
  const here = chars[index] ?? "";
  if (!/[\p{L}\p{N}]/u.test(before)) return true;
  // A camelCase hump starts a word too.
  return before === before.toLowerCase() && here !== here.toLowerCase();
}

export function fuzzyMatch(query: string, title: string): FuzzyMatch | null {
  const wanted = Array.from(query)
    .filter((char) => !/\s/.test(char))
    .map((char) => char.toLowerCase());
  if (wanted.length === 0) return { score: 0, positions: [] };

  const chars = Array.from(title);
  const lower = chars.map((char) => char.toLowerCase());
  const length = chars.length;
  if (wanted.length > length) return null;

  // best[j]: top score with the current query char matched at title index j.
  const from: number[][] = [];
  let previous: number[] = [];
  wanted.forEach((char, step) => {
    const best = new Array<number>(length).fill(Number.NEGATIVE_INFINITY);
    const back = new Array<number>(length).fill(-1);
    for (let j = step; j < length; j += 1) {
      if (lower[j] !== char) continue;
      let here = SCORE.base;
      if (isWordStart(chars, j)) here += SCORE.wordStart;
      if (j === 0) here += SCORE.titleStart;
      if (step === 0) {
        best[j] = here - SCORE.lead * Math.min(j, SCORE.leadCap);
        continue;
      }
      for (let k = step - 1; k < j; k += 1) {
        const before = previous[k] ?? Number.NEGATIVE_INFINITY;
        if (before === Number.NEGATIVE_INFINITY) continue;
        const move =
          k === j - 1 ? SCORE.consecutive : -SCORE.gap * Math.min(j - k - 1, SCORE.gapCap);
        const total = before + here + move;
        if (total > (best[j] ?? Number.NEGATIVE_INFINITY)) {
          best[j] = total;
          back[j] = k;
        }
      }
    }
    from.push(back);
    previous = best;
  });

  let top = Number.NEGATIVE_INFINITY;
  let end = -1;
  previous.forEach((score, j) => {
    if (score > top) {
      top = score;
      end = j;
    }
  });
  if (end < 0) return null;

  const positions = new Array<number>(wanted.length);
  let at = end;
  for (let step = wanted.length - 1; step >= 0; step -= 1) {
    positions[step] = at;
    at = from[step]?.[at] ?? -1;
  }
  return { score: Math.round(top * 10) / 10, positions };
}

export type Ranked<T> = { item: T; match: FuzzyMatch };

export function rankTitles<T extends { title: string }>(
  query: string,
  items: readonly T[],
): Ranked<T>[] {
  if (!hasQuery(query)) {
    return items.map((item) => ({ item, match: { score: 0, positions: [] } }));
  }
  const ranked: { entry: Ranked<T>; index: number }[] = [];
  items.forEach((item, index) => {
    const match = fuzzyMatch(query, item.title);
    if (match) ranked.push({ entry: { item, match }, index });
  });
  ranked.sort((a, b) => b.entry.match.score - a.entry.match.score || a.index - b.index);
  return ranked.map((row) => row.entry);
}

export type TitlePart = { text: string; hit: boolean; start: number };

export function highlightParts(title: string, positions: readonly number[]): TitlePart[] {
  if (positions.length === 0) return [{ text: title, hit: false, start: 0 }];
  const hit = new Set(positions);
  const parts: TitlePart[] = [];
  Array.from(title).forEach((char, index) => {
    const on = hit.has(index);
    const last = parts[parts.length - 1];
    if (last && last.hit === on) last.text += char;
    else parts.push({ text: char, hit: on, start: index });
  });
  return parts;
}
