import Loader from "./components/Loader";
import FluidHero from "./components/FluidHero";
import HeroPullback from "./components/HeroPullback";
import Reveal from "./components/Reveal";
import MaskedText from "./components/MaskedText";
import PlaceGallery from "./components/PlaceGallery";
import DinnerInterest from "./components/DinnerInterest";
import Credits from "./components/Credits";
import { homeManifest, homePhotos, allCredits, pick, asQuote } from "../lib/home";
import { reelEntries } from "../lib/reels";
import { siteStats, n } from "../lib/stats";
import { placeBySlug } from "../lib/detail";
import { usable, srcsetAttr, largest } from "../lib/about";
import s from "./components/home.module.css";
import Link from "next/link";

export const metadata = {
  title: "Where he ate",
  description:
    "Every place Anthony Bourdain ate, on one map — and a way to go and eat " +
    "there with someone you haven't met.",
};

export default function Home() {
  const m = homeManifest();
  const photos = homePhotos();
  const credits = allCredits(m);
  const stats = siteStats();
  const reels = reelEntries();

  const withMeta = <T extends { photo?: string }>(e?: T) =>
    e ? { ...e, meta: e.photo ? photos[e.photo] : undefined } : undefined;

  const objects = (m.loader?.objects ?? []).filter((o) => o?.photo).map((o) => withMeta(o)!);
  const portrait = withMeta(m.loader?.portrait) ?? null;
  const pair = withMeta(pick(m.pairing?.photos));
  const pairQuote = asQuote(pick(m.pairing?.quotes));
  const seats = m.london?.seats ?? 8;

  const pullbackVideo =
    m.pullback?.file?.trim() || m.pullback?.videoId?.trim()
      ? {
          file: m.pullback?.file?.trim() || undefined,
          credit: m.pullback?.credit,
          videoId: m.pullback?.videoId?.trim() || undefined,
          start: m.pullback?.start,
          vertical: m.pullback?.vertical,
        }
      : null;

  const room = m.pullback?.background;
  const roomMeta = room?.photo ? photos[room.photo] : undefined;
  const footagePoster = pair?.meta && usable(pair.meta) ? largest(pair.meta) : "/home/bourdain-peabody-red.jpg";

  const gallery = (m.gallery ?? [])
    .map((g) => {
      const place = g.placeSlug ? placeBySlug(g.placeSlug) : null;
      return {
        ...withMeta(g)!,
        city: place?.city ?? null,
        placeSlug: place?.slug ?? g.placeSlug,
        href: place ? `/place/${place.slug}/` : `/city/${g.placeSlug}/`,
      };
    })
    .filter((g) => g.placeSlug);

  return (
    <>
      <Loader objects={objects} portrait={portrait} total={stats.places} />
      <Reveal />

      <FluidHero
        video={m.pullback?.file ? `/home/${m.pullback.file}` : undefined}
        poster={footagePoster}
        vertical={m.pullback?.vertical}
      />

      <HeroPullback
        target={null}
        video={pullbackVideo}
        invite={
          <>
            <p>A table in London. {seats} seats.</p>
            <div className={s.tableChairs} aria-hidden="true">
              {Array.from({ length: seats }).map((_, i) => (
                <span key={i} className={s.tableChair} />
              ))}
            </div>
            <a href="#london" data-cursor="table">
              Take a seat
            </a>
          </>
        }
        background={
          room?.photo && usable(roomMeta) ? (
            <>
              <img
                src={largest(roomMeta)}
                srcSet={srcsetAttr(roomMeta)}
                sizes="100vw"
                alt={room.alt ?? ""}
              />
              <span className={s.roomCredit}>{room.credit}</span>
            </>
          ) : (
            <img src="/home/bourdain-podium.jpg" alt="" />
          )
        }
      />

      <section className={`${s.section} ${s.bridge} reveal`}>
        <div>
          <MaskedText as="p" text={n(stats.places)} className={s.counter} />
          <p className="label">places he ate</p>
        </div>
        <p className={s.bridgeArrow}>then one table</p>
        <div>
          <MaskedText as="p" text={String(seats)} className={s.counter} />
          <p className="label">strangers in London</p>
        </div>
      </section>

      <section className={`${s.section} ${s.londonBlock} reveal`} id="london-door">
        <p className="label">the first table</p>
        <MaskedText
          as="p"
          text={m.london?.line || "One table in London. Eight seats. Come alone."}
          className={s.inviteLine}
        />
        <p className={s.colText}>
          A small group meets at a place he went. You can arrive alone.
          The evening is about the company. No date yet — leave your name
          and we&rsquo;ll write when there is one.
        </p>
        <DinnerInterest seats={seats} />
      </section>

      <PlaceGallery items={gallery} />

      {reels.length > 0 && (
        <section className={`${s.section} ${s.reelsDoor} reveal`}>
          <p className="label">reels</p>
          <MaskedText as="p" text="Full screen. Swipe." className={s.inviteLine} />
          <Link className={s.inviteCta} href="/reels/">Open the player</Link>
        </section>
      )}

      <section className={`${s.section} ${s.storiesTease} reveal`}>
        <p className="label">after</p>
        {pairQuote ? (
          <>
            <MaskedText as="blockquote" text={pairQuote.text} className={s.quote} />
            {pairQuote.attr && <p className={s.credit}>{pairQuote.attr}</p>}
          </>
        ) : (
          <MaskedText
            as="p"
            text="After the meal, whoever went writes a short piece about who they met."
            className={s.quote}
          />
        )}
        <p className={s.colText}>
          Not a review. A story. Nothing here yet — the first dinner has
          to happen first.
        </p>
        <Link href="/stories/">Stories</Link>
      </section>

      <section className={`${s.section} ${s.invite} reveal`}>
        <MaskedText as="p" text="Pull up a chair." className={s.inviteLine} />
        <a className={s.inviteCta} href="#london" data-cursor="table">
          Hear about the first London dinner
        </a>
        <Link className={s.inviteCta} href="/map/" data-cursor="explore">
          Or open the map
        </Link>
      </section>

      <Credits extra={credits} />
    </>
  );
}
