/** Play / pause / mute for TikTok embed player + YouTube iframe API. */

export function tiktokCmd(win: Window | null | undefined, type: string) {
  win?.postMessage({ type, value: undefined, "x-tiktok-player": true }, "*");
}

export function ytCmd(win: Window | null | undefined, func: string) {
  win?.postMessage(
    JSON.stringify({ event: "command", func, args: [] }),
    "*",
  );
}

export function stopEmbed(iframe: HTMLIFrameElement | null | undefined) {
  const win = iframe?.contentWindow;
  if (!win || !iframe) return;
  const src = iframe.getAttribute("src") ?? "";
  if (src.includes("tiktok.com")) {
    tiktokCmd(win, "pause");
    tiktokCmd(win, "mute");
  } else {
    ytCmd(win, "pauseVideo");
    ytCmd(win, "mute");
  }
}

export function playEmbed(
  iframe: HTMLIFrameElement | null | undefined,
  withSound: boolean,
) {
  const win = iframe?.contentWindow;
  if (!win || !iframe) return;
  const src = iframe.getAttribute("src") ?? "";
  if (src.includes("tiktok.com")) {
    tiktokCmd(win, "play");
    tiktokCmd(win, withSound ? "unMute" : "mute");
  } else {
    ytCmd(win, "playVideo");
    ytCmd(win, withSound ? "unMute" : "mute");
  }
}

/** Hard-stop every video/iframe in a slide except the one still in view. */
export function silenceSlide(root: ParentNode | null | undefined) {
  if (!root) return;
  root.querySelectorAll("video").forEach((el) => {
    const v = el as HTMLVideoElement;
    v.pause();
    v.muted = true;
  });
  root.querySelectorAll("iframe").forEach((el) => {
    stopEmbed(el as HTMLIFrameElement);
  });
}
