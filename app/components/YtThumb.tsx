"use client";

import { useState } from "react";
import { youtubeThumb } from "../../lib/youtube";

/**
 * YouTube returns a 120×90 grey card for missing ids instead of a 404.
 * Hide that — never leave an empty grey rectangle in the panel.
 */
export default function YtThumb({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const [show, setShow] = useState(true);
  if (!id || !show) return null;
  return (
    <img
      className={className}
      src={youtubeThumb(id)}
      alt=""
      width={480}
      height={360}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth <= 120) setShow(false);
      }}
      onError={() => setShow(false)}
    />
  );
}
