import Loader from "./components/Loader";
import FluidHero from "./components/FluidHero";
import HeroPullback from "./components/HeroPullback";
import Reveal from "./components/Reveal";
import MaskedText from "./components/MaskedText";
import ScaleSequence from "./components/ScaleSequence";
import DinnerInterest from "./components/DinnerInterest";
import { homeManifest, homePhotos, pick, uniqueByFilename, isFoodStill } from "../lib/home";
import { siteStats } from "../lib/stats";
import { usable, srcsetAttr, largest } from "../lib/about";
import s from "./components/home.module.css";

export const metadata = {
  description:
    "Every place Anthony Bourdain ate, on one map — and a way to go and eat " +
    "there with someone you haven't met.",
};

export default function Home() {
  const m = homeManifest();
  const photos = homePhotos();
  const stats = siteStats();

  const withMeta = <T extends { photo?: string }>(e?: T) =>
    e ? { ...e, meta: e.photo ? photos[e.photo] : undefined } : undefined;

  const used = new Set<string>();
  const objects = uniqueByFilename(m.loader?.objects, used).map((o) => withMeta(o)!);
  const portraitRaw = m.loader?.portrait && !isFoodStill(m.loader.portrait.photo)
    ? m.loader.portrait
    : undefined;
  const portrait = withMeta(portraitRaw) ?? objects[0] ?? null;
  const pair = withMeta(pick(uniqueByFilename(m.pairing?.photos, used)));
  const seats = m.london?.seats ?? 8;
  const londonLine = m.london?.line || "One table in London. Eight seats. Come alone.";

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

  const room = uniqueByFilename(
    m.pullback?.background ? [m.pullback.background] : [],
    used,
  )[0];
  const roomMeta = room?.photo ? photos[room.photo] : undefined;
  const footagePoster = pair?.meta && usable(pair.meta) ? largest(pair.meta) : "/home/bourdain-portrait-black.jpg";

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
            <p>{londonLine}</p>
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
            <img src="/home/pullback-kitchen.jpg" alt="" />
          )
        }
      />

      <ScaleSequence />

      <section className={`${s.section} ${s.londonBlock} reveal`} id="london">
        <p className="label">the first table</p>
        <MaskedText as="p" text="One table in London." className={s.inviteLine} />
        <MaskedText as="p" text="Eight seats. Come alone." className={s.quote} />
        <DinnerInterest seats={seats} />
      </section>
    </>
  );
}
