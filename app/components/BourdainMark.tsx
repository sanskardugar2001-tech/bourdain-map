import type { PhotoMeta } from "../../lib/photo";
import { usable, srcsetAttr, largest } from "../../lib/photo";
import s from "./home.module.css";

/* BOURDAIN, with the O as a circular photo window.

   The loader teaches the mark by cycling solo portraits of him through the O;
   afterwards the same lockup is the nav logo at small size. One component so
   they cannot drift apart.

   The words beside it are not part of the mark. The mark can be a flex;
   the sentence next to it cannot. */

export default function BourdainMark({
  photo, meta, alt, small, huge, isFinal, probe, sizes = "80px",
}: {
  photo?: string;
  meta?: PhotoMeta;
  alt?: string;
  small?: boolean;
  /** Full-viewport lockup — the first-paint loader. */
  huge?: boolean;
  isFinal?: boolean;
  /** Only the loader's mark carries the test hooks. The nav wears the same
   *  component, and without this both answer the same querySelector. */
  probe?: boolean;
  sizes?: string;
}) {
  return (
    <span className={huge ? s.markHuge : small ? s.markSmall : s.mark} aria-label="Bourdain">
      <span aria-hidden="true">B</span>
      <span className={s.markO} aria-hidden="true">
        {usable(meta) || photo ? (
          <img
            {...(probe ? { "data-loader-object": "", "data-final": isFinal ? "true" : "false" } : {})}
            src={usable(meta) ? largest(meta) : `/home/${photo}`}
            srcSet={usable(meta) ? srcsetAttr(meta) : undefined}
            sizes={sizes}
            alt=""
            decoding="async"
          />
        ) : (
          /* No photo yet: the O stays an O rather than a broken frame. */
          <span
            className={s.markOEmpty}
            {...(probe ? { "data-loader-object": "", "data-final": isFinal ? "true" : "false" } : {})}
            title={photo ? `${photo} — not in public/home/` : undefined}
          />
        )}
      </span>
      <span aria-hidden="true">URDAIN</span>
      <span className={s.srOnly}>{alt ?? ""}</span>
    </span>
  );
}
