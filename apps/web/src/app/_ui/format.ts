import { type Bundle, NO_COLLECTION_PATH } from "@hosti/shared";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000 * 1000) return `${Math.round(bytes / 1000)} kB`;
  return `${(bytes / 1000 / 1000).toFixed(1)} MB`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export const NO_COLLECTION = NO_COLLECTION_PATH;

export type ChipCount = { name: string; href: string; count: number };

export function collectionChips(bundles: Bundle[]): ChipCount[] {
  const named = new Map<string, number>();
  let loose = 0;
  for (const bundle of bundles) {
    if (bundle.collection) named.set(bundle.collection, (named.get(bundle.collection) ?? 0) + 1);
    else loose += 1;
  }
  const chips: ChipCount[] = [{ name: "all bundles", href: "/", count: bundles.length }];
  for (const [name, count] of [...named].sort((a, b) => a[0].localeCompare(b[0]))) {
    chips.push({ name, href: `/c/${encodeURIComponent(name)}`, count });
  }
  chips.push({ name: "no collection", href: `/c/${NO_COLLECTION}`, count: loose });
  return chips;
}
