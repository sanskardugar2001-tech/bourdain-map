/** Build-time content for the homepage. Server components only. */

import fs from "node:fs";
import path from "node:path";
import type { PhotoMeta } from "./about";

export type HomePhoto = {
  photo?: string;
  alt?: string;
  credit?: string;
  quote?: string;
  placeSlug?: string;
  line?: string;
};

export type HomeQuote = { text: string; attr?: string };

export type LoaderEntry = { photo?: string; alt?: string; credit?: string };

export type HomeReel = {
  file?: string;
  photo?: string;
  poster?: string;
  credit?: string;
  line?: string;
};

export type HomeManifest = {
  loader?: { objects?: LoaderEntry[]; portrait?: LoaderEntry };
  hero?: { photos?: HomePhoto[]; quotes?: Array<string | HomeQuote> };
  london?: { citySlug?: string; seats?: number; line?: string };
  gallery?: HomePhoto[];
  reels?: HomeReel[];
  pullback?: {
    file?: string;
    credit?: string;
    videoId?: string;
    start?: number;
    vertical?: boolean;
    background?: HomePhoto;
  };
  pairing?: { photos?: HomePhoto[]; quotes?: Array<string | HomeQuote> };
  video?: { url?: string; title?: string; source?: string };
  colophon?: { copyright?: string };
};

export const pick = <T,>(pool: T[] | undefined): T | undefined =>
  pool && pool.length ? pool[Math.floor(Math.random() * pool.length)] : undefined;

/** Basename, lowercased — the unit we dedupe homepage stills on. */
export function photoFile(photo?: string): string {
  const raw = (photo ?? "").trim();
  if (!raw) return "";
  const base = raw.split("/").pop() ?? raw;
  return base.toLowerCase();
}

/**
 * Plates, bowls, market food. Banned on `/`. Kitchen-without-a-plate
 * (empty pass) is atmosphere and is allowed; dinner tables are not.
 */
const FOOD_STILL =
  /(^|[-_])(pho|ramen|dumpling|skewer|octopus|crab|sashimi)([-_.]|$)|obama-hanoi|pairing-dinner|pairing-kitchen|candid-2008|loader-pho|loader-ramen|loader-dumpling|loader-skewer|hero-crab|hero-octopus|hero-ramen/;

export function isFoodStill(photo?: string): boolean {
  const key = photoFile(photo);
  return key.length > 0 && FOOD_STILL.test(key);
}

/** First occurrence of each filename wins. Food stills are dropped. */
export function uniqueByFilename<T extends { photo?: string }>(
  entries: T[] | undefined,
  used?: Set<string>,
): T[] {
  const seen = used ?? new Set<string>();
  const out: T[] = [];
  for (const e of entries ?? []) {
    const key = photoFile(e.photo);
    if (!key || isFoodStill(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function asQuote(q: string | HomeQuote | undefined): HomeQuote | undefined {
  if (!q) return undefined;
  if (typeof q === "string") return q.trim() ? { text: q.trim() } : undefined;
  return q.text?.trim() ? q : undefined;
}

function readJson<T>(p: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")) as T; }
  catch { return fallback; }
}

export const homeManifest = () =>
  readJson<HomeManifest>(path.join(process.cwd(), "content", "home.json"), {});

export const homePhotos = () =>
  readJson<Record<string, PhotoMeta>>(
    path.join(process.cwd(), "content", "home.generated.json"), {});

export function allCredits(m: HomeManifest): { photo: string; credit: string }[] {
  const out: { photo: string; credit: string }[] = [];
  const add = (e?: { photo?: string; file?: string; credit?: string }) => {
    const key = e?.photo || e?.file;
    if (key && e?.credit?.trim()) out.push({ photo: key, credit: e.credit.trim() });
  };
  (m.loader?.objects ?? []).forEach(add);
  add(m.loader?.portrait);
  (m.hero?.photos ?? []).forEach(add);
  add(m.pullback?.background);
  add({ photo: m.pullback?.file, credit: m.pullback?.credit });
  (m.pairing?.photos ?? []).forEach(add);
  (m.gallery ?? []).forEach(add);
  (m.reels ?? []).forEach(add);
  return out.filter((c, i, a) =>
    a.findIndex((x) => x.photo === c.photo) === i && !isFoodStill(c.photo)
  );
}
