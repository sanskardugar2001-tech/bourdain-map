"use client";

import { Component, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import MapView, { type PinProps } from "./MapView";
import MapSearch from "./MapSearch";
import SearchPalette from "./SearchPalette";
import { loadSearchIndex, type SearchIndex } from "../../lib/artifacts";
import styles from "./MapShell.module.css";

class MapSafe extends Component<{ children: ReactNode }, { ok: boolean }> {
  state = { ok: true };
  static getDerivedStateFromError() { return { ok: false }; }
  render() { return this.state.ok ? this.props.children : null; }
}

/** The URL is the state. Everything here derives from the path. */
function parsePath(path: string): { kind: "place" | "city" | null; slug: string | null } {
  const m = /^\/(place|city)\/([^/]+)\/?$/.exec(path);
  if (!m) return { kind: null, slug: null };
  return { kind: m[1] as "place" | "city", slug: decodeURIComponent(m[2]) };
}

export default function MapShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { kind, slug } = useMemo(() => parsePath(path ?? "/"), [path]);

  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [camera, setCamera] = useState<
    { lon: number; lat: number; zoom?: number } | null
  >(null);

  useEffect(() => {
    loadSearchIndex().then(setIndex).catch(() => setIndex(null));
  }, []);

  /* Route change -> move the camera. The map itself is never rebuilt. */
  useEffect(() => {
    if (!index || !slug) return;
    if (kind === "place") {
      const p = index.places.find((x) => x.slug === slug);
      if (p) setCamera({ lon: p.lon, lat: p.lat, zoom: 15.5 });
    } else if (kind === "city") {
      const c = index.cities.find((x) => x.slug === slug);
      if (c) setCamera({ lon: c.lon, lat: c.lat, zoom: 12 });
    }
  }, [index, kind, slug]);

  const selectedId = useMemo(() => {
    if (kind !== "place" || !index || !slug) return null;
    return index.places.find((x) => x.slug === slug)?.id ?? null;
  }, [index, kind, slug]);

  /* Clicking a pin is a navigation, so back works and the link is shareable. */
  const onSelect = useCallback(
    (p: PinProps) => {
      if (p.slug) router.push(`/place/${encodeURIComponent(p.slug)}/`);
    },
    [router]
  );

  const onSelectCity = useCallback(
    (citySlug: string) => {
      router.push(`/city/${encodeURIComponent(citySlug)}/`);
    },
    [router]
  );

  /* Cmd-K, Ctrl-K, or / — the palette is the primary way in, not a filter
     box in a corner. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing =
        e.target instanceof HTMLElement &&
        /^(input|textarea)$/i.test(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPreview = useCallback((lon: number, lat: number, zoom: number) => {
    setCamera({ lon, lat, zoom });
  }, []);

  const panelOpen = kind === "place" || kind === "city";

  return (
    <div className={styles.shell} data-panel={panelOpen ? "open" : "closed"}>
      <div className={styles.mapHit}>
        <MapSafe>
          <MapView
            onSelect={onSelect}
            onSelectCity={onSelectCity}
            selectedId={selectedId}
            selectedCitySlug={kind === "city" ? slug : null}
            cities={index?.cities ?? null}
            flyTo={camera}
            panelOpen={panelOpen}
          />
        </MapSafe>
      </div>

      <header className={styles.masthead}>
        <div className={styles.brand}>
          <a href="/" className={styles.wordmark}>Bourdain Club</a>
          <p className={styles.tagline}>
            Every place Anthony Bourdain ate. Pick a city.
          </p>
        </div>
        <nav className={styles.nav}>
          <a href="/">Home</a>
          <a href="/map/">Map</a>
          <a href="/reels/">Reels</a>
          <a href="/about/">About</a>
        </nav>
        <div className={styles.searchSlot}>
          {index && (
            <MapSearch
              index={index}
              onPreview={onPreview}
              onChoose={(href) => router.push(href)}
            />
          )}
        </div>
      </header>

      {/* Panel, never modal. The map stays visible and interactive behind it. */}
      <aside className={styles.panel} aria-hidden={!panelOpen}>
        {panelOpen && (
          <>
            <button
              type="button"
              className={styles.close}
              onClick={() => router.push("/map/")}
              aria-label="Close"
            >
              ×
            </button>
            <div className={styles.panelBody}>{children}</div>
          </>
        )}
      </aside>

      {paletteOpen && index && (
        <SearchPalette
          index={index}
          onClose={() => setPaletteOpen(false)}
          onPreview={onPreview}
          onChoose={(href) => {
            setPaletteOpen(false);
            router.push(href);
          }}
        />
      )}
    </div>
  );
}
