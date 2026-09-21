/**
 * Reels manifest. Official embeds only — nothing is rehosted.
 * TikTok and YouTube Shorts. Instagram is dropped, always.
 *
 * Accepted remote URLs:
 *   https://www.tiktok.com/@user/video/ID
 *   https://www.youtube.com/shorts/ID
 *   https://youtu.be/ID
 *   https://youtu.be/shorts/ID
 */

import fs from "node:fs";
import path from "node:path";

export type ReelPlatform = "tiktok" | "youtube" | "local";

export type ReelEntry = {
  id: string;
  platform: ReelPlatform;
  url?: string;
  videoId?: string;
  file?: string;
  photo?: string;
  poster?: string;
  caption?: string;
  credit?: string;
};

type Raw = {
  url?: unknown;
  platform?: unknown;
  caption?: unknown;
  line?: unknown;
  credit?: unknown;
  file?: unknown;
  photo?: unknown;
  poster?: unknown;
};

const MIN_REMOTE = 100;
const YT_ID = /^[\w-]{11}$/;

const TIKTOK_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
]);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const IG_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
  "www.instagr.am",
]);

function hostOf(u: URL): string {
  return u.hostname.replace(/^www\./, "").toLowerCase();
}

/** YouTube Shorts id from /shorts/ID or youtu.be/ID. Watch URLs are not reels. */
export function youtubeShortsId(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = hostOf(u);
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0] === "shorts" ? parts[1] : parts[0];
    return id && YT_ID.test(id) ? id : null;
  }

  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const i = parts.indexOf("shorts");
    if (i >= 0 && parts[i + 1] && YT_ID.test(parts[i + 1])) return parts[i + 1];
    const embed = parts.indexOf("embed");
    if (embed >= 0 && parts[embed + 1] && YT_ID.test(parts[embed + 1])) {
      return parts[embed + 1];
    }
    const v = u.searchParams.get("v");
    if (v && YT_ID.test(v)) return v;
    return null;
  }

  return null;
}

function tiktokVideoId(u: URL): string | null {
  const id = u.pathname.match(/\/video\/(\d+)/)?.[1];
  return id ?? null;
}

function parse(raw: Raw, i: number): ReelEntry | null {
  const file = typeof raw.file === "string" ? raw.file.trim() : "";
  const caption = typeof raw.caption === "string"
    ? raw.caption
    : typeof raw.line === "string" ? raw.line : undefined;
  const credit = typeof raw.credit === "string" ? raw.credit : undefined;
  const poster = typeof raw.poster === "string" ? raw.poster.trim() : undefined;
  const platformHint = typeof raw.platform === "string"
    ? raw.platform.trim().toLowerCase()
    : "";

  if (platformHint === "instagram") return null;

  if (file) {
    return {
      id: `local-${file}-${i}`,
      platform: "local",
      file,
      poster,
      caption,
      credit,
    };
  }

  if (typeof raw.url !== "string" || !raw.url.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.url);
  } catch {
    return null;
  }

  const host = hostOf(u);
  if (IG_HOSTS.has(u.hostname) || IG_HOSTS.has(host) || host === "instagram.com") {
    return null;
  }

  if (TIKTOK_HOSTS.has(u.hostname) || TIKTOK_HOSTS.has(host) || host === "tiktok.com") {
    const id = tiktokVideoId(u);
    if (!id) return null;
    const user = u.pathname.match(/^\/@([^/]+)/)?.[1] ?? "";
    const pathName = user ? `/@${user}/video/${id}` : u.pathname;
    return {
      id: `tiktok-${id}-${i}`,
      platform: "tiktok",
      url: `https://www.tiktok.com${pathName}`,
      videoId: id,
      caption,
      credit,
    };
  }

  if (YOUTUBE_HOSTS.has(u.hostname) || YOUTUBE_HOSTS.has(host)) {
    const id = youtubeShortsId(raw.url);
    if (!id) return null;
    return {
      id: `youtube-${id}-${i}`,
      platform: "youtube",
      url: `https://www.youtube.com/shorts/${id}`,
      videoId: id,
      caption,
      credit,
    };
  }

  return null;
}

function readReelFile(file: "content/home.json" | "content/reels.json"): Raw[] {
  const abs = file === "content/home.json"
    ? path.join(process.cwd(), "content/home.json")
    : path.join(process.cwd(), "content/reels.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(abs, "utf-8")) as { reels?: Raw[] };
    return manifest.reels ?? [];
  } catch {
    return [];
  }
}

export function reelEntries(): ReelEntry[] {
  const seen = new Set<string>();
  const local: ReelEntry[] = [];
  const remote: ReelEntry[] = [];
  for (const raws of [readReelFile("content/home.json"), readReelFile("content/reels.json")]) {
    raws.forEach((raw, i) => {
      const e = parse(raw, i);
      if (!e) return;
      const key = e.file || e.videoId || e.url || e.id;
      if (seen.has(key)) return;
      seen.add(key);
      if (e.platform === "local") local.push(e);
      else remote.push(e);
    });
  }
  if (remote.length < MIN_REMOTE) {
    throw new Error(
      `Need ≥${MIN_REMOTE} TikTok or YouTube Shorts URLs in content/reels.json ` +
        `(parsed ${remote.length}). Instagram is dropped. ` +
        `Use youtube.com/shorts/ID, youtu.be/ID, or tiktok.com/@user/video/ID.`
    );
  }
  return [...local, ...remote];
}
