import { allCities, cityBySlug, SHOW_NAMES } from "../../../lib/detail";
import { cityQuoteBest, cityClipBest, assignEpisodeClip } from "../../../lib/cityQuotes";
import { youtubeId, youtubeWatch } from "../../../lib/youtube";
import YtThumb from "../../components/YtThumb";
import styles from "./city.module.css";
import Link from "next/link";

export function generateStaticParams() {
  return allCities().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = cityBySlug(slug);
  if (!c) return { title: "Not found" };
  return {
    title: `${c.name} — where he ate`,
    description: `${c.places.length} places Anthony Bourdain went in ${c.name}.`,
  };
}

/* deannd's own My Maps. The slot is here and deliberately empty until the
   real URLs arrive — the dataset is hers and the link belongs on every city
   page, but a fabricated URL is worse than a missing one. */
const DEANND_MAPS_URL: string | null = null;

/* Where a city already has a good guide elsewhere, link it rather than
   thinning it into a summary. These people did the work. */
function elsewhere(city: { name: string }) {
  const q = encodeURIComponent(city.name);
  return [
    ...(DEANND_MAPS_URL
      ? [{
          href: DEANND_MAPS_URL,
          label: "deannd's original maps",
          what: "Where every place on this site came from",
        }]
      : []),
    {
      href: `https://eatlikebourdain.com/?s=${q}`,
      label: "eatlikebourdain.com",
      what: "City guides in far more detail than we carry",
    },
    {
      href: `https://www.reddit.com/r/AnthonyBourdain/search/?q=${q}&restrict_sr=1`,
      label: "r/AnthonyBourdain",
      what: "What people who went are saying",
    },
  ];
}

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = cityBySlug(slug);
  if (!city) return <p className={styles.missing}>No such city.</p>;

  const gone = city.places.filter((p) => p.status === "closed").length;
  const episodes = city.episodes.filter((e) => e.match === "exact");
  const looser = city.episodes.filter((e) => e.match !== "exact");
  const quote = cityQuoteBest(city.slug);
  const clip = cityClipBest(city.slug);
  const yt = clip?.id ?? youtubeId(city.videoUrl);
  const ytTitle = clip?.title ?? city.videoTitle ?? "Official clip";
  const listed = episodes.length > 0 ? episodes : looser;
  const epIds = assignEpisodeClip(listed, clip);
  const clipOnEpisode = epIds.some(Boolean);

  return (
    <article className={styles.city}>
      <h1 className={styles.name}>{city.name}</h1>
      <p className={styles.count}>
        {city.places.length} place{city.places.length === 1 ? "" : "s"}
        {gone > 0 && <>, {gone} of them gone</>}
      </p>

      {quote && (
        <section className={styles.section}>
          <blockquote className={styles.quote}>
            <p>{quote.text}</p>
            <cite>{quote.attr}</cite>
          </blockquote>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.h2}>
          {listed.length === 0
            ? "Episodes"
            : episodes.length > 0
              ? "He filmed here"
              : "Episodes that may cover this"}
        </h2>
        {listed.length === 0 ? (
          <p className={styles.empty}>No episode is tied to this city in the data.</p>
        ) : (
          <ul className={styles.eps}>
            {listed.map((e, i) => {
              const id = epIds[i];
              const meta = (
                <span className={styles.epMeta}>
                  <span className={styles.epShow}>{SHOW_NAMES[e.show] ?? e.show}</span>
                  <span className={styles.epNum}>
                    {e.season != null && `S${e.season}`}
                    {e.episode != null && `E${e.episode}`}
                  </span>
                  <span className={styles.epTitle}>{e.title}</span>
                  {e.airDate && <span className={styles.epDate}>{e.airDate}</span>}
                  {!id && (
                    <span className={styles.epNone}>No public clip linked</span>
                  )}
                </span>
              );
              return (
                <li key={`${e.show}-${e.season}-${e.episode}-${e.title}`}>
                  {id ? (
                    <a
                      className={styles.epCard}
                      href={youtubeWatch(id)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <YtThumb
                        className={styles.ytThumb}
                        id={id}
                      />
                      {meta}
                    </a>
                  ) : (
                    <div className={styles.epCard} data-empty="true">
                      {meta}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {listed.length > 0 && episodes.length === 0 && (
          <p className={styles.empty}>
            Matched on country or region rather than by name, so this is
            not stated as fact.
          </p>
        )}
      </section>

      {!clipOnEpisode && yt ? (
        <section className={styles.section}>
          <h2 className={styles.h2}>Watch</h2>
          <a
            className={styles.ytCard}
            href={youtubeWatch(yt)}
            rel="noreferrer"
            target="_blank"
          >
            <YtThumb
              className={styles.ytThumb}
              id={yt}
            />
            <span>
              {ytTitle}
              {city.videoSource && (
                <span className={styles.videoSource}>{city.videoSource}</span>
              )}
            </span>
          </a>
        </section>
      ) : !clipOnEpisode && city.videoUrl ? (
        <section className={styles.section}>
          <h2 className={styles.h2}>Watch</h2>
          <a className={styles.video} href={city.videoUrl} rel="noreferrer" target="_blank">
            {city.videoTitle ?? "Official clip"}
            <span className={styles.videoSource}>{city.videoSource}</span>
          </a>
        </section>
      ) : null}

      <section className={styles.section} data-places={city.places.length}>
        <h2 className={styles.h2}>The places</h2>
        {city.places.length === 0 ? (
          <p className={styles.empty}>No pin is tied to this city in the data.</p>
        ) : (
          <ul className={styles.places}>
            {city.places.map((p) => (
              <li key={p.slug ?? p.name} data-gone={p.status === "closed"}>
                {p.slug ? (
                  <Link
                    className={styles.placeName}
                    href={`/place/${p.slug}/`}
                    scroll={false}
                  >
                    {p.name}
                  </Link>
                ) : (
                  <span className={styles.placeName}>{p.name}</span>
                )}
                <span className={styles.placeShows}>
                  {p.shows.map((s) => SHOW_NAMES[s] ?? s).join(" · ")}
                  {p.status === "closed" && " · gone"}
                </span>
                {(p.ate || p.note) && (
                  <span className={styles.placeAte}>{p.ate ?? p.note}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Elsewhere</h2>
        <p className={styles.elsewhereIntro}>
          Other people have written about {city.name} at length. Go and read
          them.
        </p>
        <ul className={styles.links}>
          {elsewhere(city).map((l) => (
            <li key={l.href}>
              <a href={l.href} rel="noreferrer" target="_blank">{l.label}</a>
              <span>{l.what}</span>
            </li>
          ))}
        </ul>
      </section>

      {episodes.length > 0 && looser.length > 0 && (
        <p className={styles.looser}>
          {looser.length} other episode{looser.length === 1 ? "" : "s"} may cover
          this city — matched on country or region rather than by name, so
          they&rsquo;re not stated as fact here.
        </p>
      )}
    </article>
  );
}
