import {
  allPlaces, placeBySlug, SHOW_NAMES, KIND_LABELS, displayPlaceName,
} from "../../../lib/detail";
import { cityQuoteBest, cityClipBest } from "../../../lib/cityQuotes";
import { youtubeWatch } from "../../../lib/youtube";
import PlaceActions from "../../components/PlaceActions";
import YtThumb from "../../components/YtThumb";
import styles from "./place.module.css";
import Link from "next/link";

export function generateStaticParams() {
  return allPlaces().map((p) => ({ slug: p.slug }));
}

const regionName = (cc: string | null) => {
  if (!cc) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc;
  } catch {
    return cc;
  }
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = placeBySlug(slug);
  if (!p) return { title: "Not found" };
  const where = p.city ?? regionName(p.cc);
  const name = displayPlaceName(p.name);
  return {
    title: `${name}${where ? ` — ${where}` : ""}`,
    description: `Anthony Bourdain went to ${name}${where ? ` in ${where}` : ""}.`,
  };
}

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = placeBySlug(slug);
  if (!place) {
    return (
      <p className={styles.missing}>
        No such place. It may have been merged into another pin.
      </p>
    );
  }

  const gone = place.status === "closed";
  const unnamed = /^meals? with/i.test(place.name);
  const country = regionName(place.cc);
  const name = displayPlaceName(place.name);
  const kind = KIND_LABELS[place.kind];
  const quote = cityQuoteBest(place.citySlug);
  const clip = cityClipBest(place.citySlug);
  const visits = place.appearances.filter((a) => a.show !== "other" || a.episodeTitle);

  return (
    <article className={styles.place} data-gone={gone}>
      <h1 className={styles.name}>{name}</h1>

      <p className={styles.meta}>
        {place.citySlug ? (
          <Link href={`/city/${place.citySlug}/`}>{place.city}</Link>
        ) : (
          <span>{country ?? "Somewhere unmapped"}</span>
        )}
        {country && <span>{country}</span>}
        {kind && <span>{kind}</span>}
        {gone && <span className={styles.gone}>gone</span>}
      </p>

      {place.statusNote && <p className={styles.statusNote}>{place.statusNote}</p>}

      {unnamed && (
        <p className={styles.unnamed}>
          Nobody wrote down whose table this was.
        </p>
      )}

      {quote && (
        <blockquote className={styles.cityQuote}>
          <p>{quote.text}</p>
          <cite>{quote.attr}</cite>
        </blockquote>
      )}

      {clip?.id && (
        <a
          className={styles.watch}
          href={youtubeWatch(clip.id)}
          rel="noreferrer"
          target="_blank"
        >
          <YtThumb
            className={styles.watchThumb}
            id={clip.id}
          />
          <span>{clip.title ?? "Official clip"}</span>
        </a>
      )}

      <ol className={styles.visits}>
        {visits.map((a, i) => {
          const inferred = a.episodeSource === "inferred";
          return (
            <li key={i} className={styles.visit}>
              <p className={styles.show}>
                {SHOW_NAMES[a.show] ?? a.show}
                {a.season != null && <span className={styles.se}>S{a.season}</span>}
                {a.episode != null && (
                  <span className={inferred ? styles.seSoft : styles.se}>
                    E{a.episode}
                  </span>
                )}
              </p>

              {a.episodeTitle && (
                <p className={inferred ? styles.epTitleSoft : styles.epTitle}>
                  {a.episodeTitle}
                  {inferred && (
                    <span className={styles.qualifier}>
                      likely — matched on the city, not this place
                    </span>
                  )}
                </p>
              )}

              {a.ate && <p className={styles.ate}>{a.ate}</p>}

              {a.note && (
                <figure className={styles.quote}>
                  <blockquote>{a.note}</blockquote>
                  <figcaption>deannd</figcaption>
                </figure>
              )}
            </li>
          );
        })}
      </ol>

      <PlaceActions placeId={place.id} placeName={name} />

      <p className={styles.credit}>
        This place, and what he ate here, comes from the map <strong>deannd</strong>{" "}
        built on r/AnthonyBourdain over two years. Used with permission.
      </p>
    </article>
  );
}
