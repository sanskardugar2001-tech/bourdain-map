"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  addProtocol,
  removeProtocol,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  initialMapStyle,
  pinColors,
  readMapTheme,
  writeMapTheme,
  type MapTheme,
} from "../../lib/basemap";
import type { SearchCity } from "../../lib/artifacts";
import styles from "./MapView.module.css";

const CLUSTER_MAX_ZOOM = 6;
const WORLD: { center: [number, number]; zoom: number } = { center: [10, 26], zoom: 1.45 };
const MAX_ZOOM = 18;
const MIN_ZOOM = 1.1;
const EASE = (t: number) => 1 - Math.pow(1 - t, 3);

export type PinProps = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  citySlug: string | null;
  kind: string;
  status: string;
  visits: number;
  unnamed: boolean;
};

type Props = {
  onSelect: (p: PinProps, lngLat: [number, number]) => void;
  onSelectCity?: (slug: string, lngLat: [number, number]) => void;
  selectedId?: string | null;
  selectedCitySlug?: string | null;
  cities?: SearchCity[] | null;
  flyTo?: { lon: number; lat: number; zoom?: number; id?: string } | null;
  panelOpen?: boolean;
};

function cameraPadding(panel: boolean): {
  top: number; right: number; bottom: number; left: number;
} {
  if (typeof window === "undefined") {
    return { top: 56, right: 16, bottom: 24, left: 16 };
  }
  if (!panel) return { top: 56, right: 16, bottom: 24, left: 16 };
  const mobile = window.matchMedia("(max-width: 720px)").matches;
  if (mobile) {
    return {
      top: 56,
      right: 16,
      bottom: Math.round(window.innerHeight * 0.62),
      left: 16,
    };
  }
  return {
    top: 56,
    right: Math.min(420, Math.round(window.innerWidth * 0.42)),
    bottom: 24,
    left: 16,
  };
}

function unlockMap(m: MapLibreMap) {
  m.scrollZoom.enable();
  m.boxZoom.enable();
  m.dragPan.enable();
  m.keyboard.enable();
  m.doubleClickZoom.enable();
  m.touchZoomRotate.enable();
  m.touchPitch.disable();
  m.dragRotate.disable();
  m.setMinZoom(MIN_ZOOM);
  m.setMaxZoom(MAX_ZOOM);
}

function emptyPlaces(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function addOverlayLayers(m: MapLibreMap, theme: MapTheme) {
  const C = pinColors(theme);
  if (m.getSource("places")) return;

  m.addSource("places", {
    type: "geojson",
    data: emptyPlaces(),
    cluster: true,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterRadius: 22,
    clusterProperties: {
      gone: ["+", ["case", ["==", ["get", "status"], "closed"], 1, 0]],
    },
  });
  m.addSource("cities", { type: "geojson", data: emptyPlaces() });

  m.addLayer({
    id: "pin-glow",
    type: "circle",
    source: "places",
    filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "status"], "closed"]],
    paint: {
      "circle-color": C.glow,
      "circle-blur": 0.85,
      "circle-opacity": C.glowOpacity,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 5, 12, 9, 16, 13],
    },
  });

  m.addLayer({
    id: "pins",
    type: "circle",
    source: "places",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "status"], "closed"], C.closed,
        ["get", "unnamed"], "rgba(0,0,0,0)",
        C.pin,
      ],
      "circle-stroke-color": [
        "case",
        ["==", ["get", "status"], "closed"], C.closedRing,
        ["get", "unnamed"], C.pin,
        "rgba(0,0,0,0)",
      ],
      "circle-stroke-width": [
        "case",
        ["==", ["get", "status"], "closed"], 1,
        ["get", "unnamed"], 1.2,
        0,
      ],
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        5, ["match", ["get", "kind"], "market", 2.6, "food", 2.4, 2],
        10, ["match", ["get", "kind"], "market", 4.4, "food", 4.1, 3.5],
        16, ["match", ["get", "kind"], "market", 7.2, "food", 6.8, 5.8],
      ],
      "circle-opacity": ["case", ["==", ["get", "status"], "closed"], 0.88, 1],
      "circle-pitch-alignment": "map",
    },
  });

  m.addLayer({
    id: "pin-repeat",
    type: "circle",
    source: "places",
    filter: ["all", ["!", ["has", "point_count"]], [">", ["get", "visits"], 1]],
    paint: {
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": C.pin,
      "circle-stroke-width": 1,
      "circle-stroke-opacity": 0.45,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4.5, 10, 7.5, 16, 11],
    },
  });

  m.addLayer({
    id: "pin-selected",
    type: "circle",
    source: "places",
    filter: ["==", ["get", "id"], "__none__"],
    paint: {
      "circle-color": C.selected,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.6, 12, 6, 16, 8],
      "circle-stroke-color": C.selectedRing,
      "circle-stroke-width": 2.2,
      "circle-stroke-opacity": 0.95,
    },
  });

  m.addLayer({
    id: "clusters",
    type: "circle",
    source: "places",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": C.cluster,
      "circle-opacity": 0.82,
      "circle-stroke-color": C.paper,
      "circle-stroke-width": 0.8,
      "circle-stroke-opacity": 0.55,
      "circle-radius": [
        "interpolate", ["linear"], ["sqrt", ["get", "point_count"]],
        1.4, 2.2, 4.5, 3.6, 11, 5.4, 25, 7.4,
      ],
    },
  });

  m.addLayer({
    id: "pin-labels",
    type: "symbol",
    source: "places",
    filter: ["!", ["has", "point_count"]],
    minzoom: 13,
    layout: {
      "text-field": ["get", "name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 12],
      "text-font": ["Noto Sans Regular"],
      "text-offset": [0, 1.15],
      "text-anchor": "top",
      "text-optional": true,
      "text-padding": 8,
    },
    paint: {
      "text-color": C.ink,
      "text-halo-color": C.halo,
      "text-halo-width": 1.2,
    },
  });

  m.addLayer({
    id: "cities",
    type: "circle",
    source: "cities",
    maxzoom: 10,
    paint: {
      "circle-color": C.ink,
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.28, 6, 0.4, 10, 0],
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        1, ["min", ["+", 1.4, ["*", ["sqrt", ["get", "places"]], 0.18]], 3.4],
        8, ["min", ["+", 2.6, ["*", ["sqrt", ["get", "places"]], 0.28]], 6],
      ],
    },
  });
  m.addLayer({
    id: "city-selected",
    type: "circle",
    source: "cities",
    maxzoom: 11,
    filter: ["==", ["get", "slug"], "__none__"],
    paint: {
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": C.ink,
      "circle-stroke-width": 1.3,
      "circle-stroke-opacity": 0.55,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 5.5, 8, 9],
    },
  });
  m.addLayer({
    id: "city-labels",
    type: "symbol",
    source: "cities",
    minzoom: 3,
    maxzoom: 10,
    filter: [">=", ["get", "places"], 4],
    layout: {
      "text-field": ["get", "name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 8, 12],
      "text-font": ["Noto Sans Regular"],
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-optional": true,
      "text-padding": 10,
    },
    paint: {
      "text-color": C.ink,
      "text-halo-color": C.halo,
      "text-halo-width": 1.2,
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.55, 7, 0.85, 10, 0],
    },
  });
}

function citiesCollection(cities: SearchCity[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cities.map((c) => ({
      type: "Feature" as const,
      properties: { slug: c.slug, name: c.name, places: c.places },
      geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
    })),
  };
}

export default function MapView({
  onSelect, onSelectCity, selectedId, selectedCitySlug, cities, flyTo, panelOpen,
}: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const onSelectCityRef = useRef(onSelectCity);
  const placesData = useRef<GeoJSON.FeatureCollection>(emptyPlaces());
  const citiesData = useRef<GeoJSON.FeatureCollection>(emptyPlaces());
  const themeRef = useRef<MapTheme>("light");
  const selectedIdRef = useRef(selectedId);
  const selectedCityRef = useRef(selectedCitySlug);
  const bound = useRef(false);
  const flownKey = useRef("");
  const panelRef = useRef(Boolean(panelOpen));
  const flying = useRef(false);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [theme, setTheme] = useState<MapTheme>("light");
  const reduced = useRef(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onSelectCityRef.current = onSelectCity; }, [onSelectCity]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { selectedCityRef.current = selectedCitySlug; }, [selectedCitySlug]);
  useEffect(() => { panelRef.current = Boolean(panelOpen); }, [panelOpen]);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const restoreOverlays = useCallback((m: MapLibreMap, next: MapTheme) => {
    addOverlayLayers(m, next);
    const places = m.getSource("places") as GeoJSONSource | undefined;
    const citySrc = m.getSource("cities") as GeoJSONSource | undefined;
    places?.setData(placesData.current);
    citySrc?.setData(citiesData.current);
    if (m.getLayer("pin-selected")) {
      m.setFilter("pin-selected", ["==", ["get", "id"], selectedIdRef.current ?? "__none__"]);
    }
    if (m.getLayer("city-selected")) {
      m.setFilter("city-selected", ["==", ["get", "slug"], selectedCityRef.current ?? "__none__"]);
    }
    unlockMap(m);
  }, []);

  useEffect(() => {
    if (!holder.current || map.current) return;

    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);

    const startTheme = readMapTheme();
    themeRef.current = startTheme;
    setTheme(startTheme);

    let m: MapLibreMap;
    try {
      m = new MapLibreMap({
        container: holder.current,
        style: initialMapStyle(startTheme),
        center: WORLD.center,
        zoom: WORLD.zoom,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        attributionControl: { compact: true },
        pitchWithRotate: false,
        dragRotate: false,
        scrollZoom: { around: "center" },
        touchZoomRotate: { around: "center" },
        dragPan: { linearity: 0.28, deceleration: 2600, maxSpeed: 1400 },
        renderWorldCopies: true,
        fadeDuration: 220,
        maxTileCacheSize: 160,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        cancelPendingTileRequestsWhileZooming: true,
        canvasContextAttributes: { alpha: true, antialias: false, powerPreference: "low-power" },
      });
    } catch (err) {
      console.warn("[map] WebGL failed — search and the panel still work.", err);
      queueMicrotask(() => setLoaded(-1));
      removeProtocol("pmtiles");
      return;
    }
    map.current = m;
    (window as unknown as { __map?: unknown }).__map = m;
    m.getCanvas().style.background = startTheme === "dark" ? "#0B0D10" : "#E6E6E1";
    const onWheel = () => unlockMap(m);
    m.getCanvas().addEventListener("wheel", onWheel, { passive: true });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const bind = () => {
      if (bound.current) return;
      bound.current = true;
      const hit = ["pins", "pin-repeat", "cities", "city-labels"];
      hit.forEach((id) => {
        m.on("mouseenter", id, () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", id, () => { m.getCanvas().style.cursor = ""; });
      });
      const countPopup = new Popup({
        closeButton: false, closeOnClick: false, offset: 10, className: "count-popup",
      });
      m.on("mousemove", "clusters", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        m.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const n = f.properties?.point_count as number;
        countPopup
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setText(`${n} place${n === 1 ? "" : "s"}`)
          .addTo(m);
      });
      m.on("mouseleave", "clusters", () => {
        m.getCanvas().style.cursor = "";
        countPopup.remove();
      });
      m.on("mousemove", "cities", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        m.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const n = f.properties?.places as number;
        const name = f.properties?.name as string;
        countPopup
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setText(`${name} · ${n} place${n === 1 ? "" : "s"}`)
          .addTo(m);
      });
      m.on("mouseleave", "cities", () => {
        m.getCanvas().style.cursor = "";
        countPopup.remove();
      });

      const pickCity = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        const slug = f?.properties?.slug as string | undefined;
        if (!f || !slug) return;
        const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        onSelectCityRef.current?.(slug, [lon, lat]);
      };
      m.on("click", "cities", pickCity);
      m.on("click", "city-labels", pickCity);

      m.on("click", "pins", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!f) return;
        const props = f.properties as unknown as PinProps;
        const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        onSelectRef.current({ ...props, unnamed: Boolean(props.unnamed) }, [lon, lat]);
      });

      m.on("click", "clusters", async (e: MapMouseEvent) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        if (!f) return;
        const src = m.getSource("places") as GeoJSONSource;
        const id = f.properties.cluster_id as number;
        const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        try {
          const leaves = await src.getClusterLeaves(id, 80, 0);
          const tally = new Map<string, number>();
          for (const leaf of leaves) {
            const slug = (leaf.properties as { citySlug?: string } | null)?.citySlug;
            if (slug) tally.set(slug, (tally.get(slug) ?? 0) + 1);
          }
          const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
          if (top && top[1] >= Math.max(3, leaves.length * 0.6) && onSelectCityRef.current) {
            onSelectCityRef.current(top[0], [lon, lat]);
            return;
          }
        } catch { /* expand instead */ }
        const zoom = await src.getClusterExpansionZoom(id);
        m.easeTo({
          center: [lon, lat],
          zoom: Math.min(zoom + 0.35, 17),
          duration: reduced.current ? 0 : 800,
          easing: EASE,
        });
      });

      m.on("moveend", () => unlockMap(m));
      m.on("idle", () => unlockMap(m));
    };

    m.on("load", () => {
      restoreOverlays(m, themeRef.current);
      bind();
      unlockMap(m);
      setReady(true);
      fetch("/data/places.geojson")
        .then((r) => r.json())
        .then((fc: GeoJSON.FeatureCollection) => {
          placesData.current = fc;
          const src = m.getSource("places") as GeoJSONSource | undefined;
          if (!src) return;
          src.setData(fc);
          setLoaded(fc.features.length);
        })
        .catch(() => setLoaded(-1));
    });

    return () => {
      m.getCanvas().removeEventListener("wheel", onWheel);
      removeProtocol("pmtiles");
      m.remove();
      map.current = null;
      bound.current = false;
      flownKey.current = "";
    };
  }, [restoreOverlays]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !cities) return;
    citiesData.current = citiesCollection(cities);
    const src = m.getSource("cities") as GeoJSONSource | undefined;
    src?.setData(citiesData.current);
  }, [cities, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getLayer("pin-selected")) return;
    m.setFilter("pin-selected", ["==", ["get", "id"], selectedId ?? "__none__"]);
  }, [selectedId, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getLayer("city-selected")) return;
    m.setFilter("city-selected", ["==", ["get", "slug"], selectedCitySlug ?? "__none__"]);
  }, [selectedCitySlug, ready]);

  const destLon = flyTo?.lon;
  const destLat = flyTo?.lat;
  const destZoom = flyTo?.zoom;

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || destLon == null || destLat == null) return;
    const dest: [number, number] = [destLon, destLat];
    const zoom = Math.min(destZoom ?? 15, MAX_ZOOM);
    const key = `${destLon.toFixed(5)},${destLat.toFixed(5)},${zoom.toFixed(2)}`;
    const pad = cameraPadding(panelRef.current);
    const samePlace = flownKey.current === key;
    flownKey.current = key;
    unlockMap(m);
    flying.current = true;
    const done = () => {
      flying.current = false;
      unlockMap(m);
    };
    const later = window.setTimeout(done, 2000);
    if (samePlace) {
      m.once("moveend", done);
      m.easeTo({ padding: pad, duration: reduced.current ? 0 : 450 });
      return () => window.clearTimeout(later);
    }
    const here = m.getCenter();
    const hop = Math.hypot(here.lng - dest[0], here.lat - dest[1]);
    m.stop();
    m.once("moveend", done);
    if (reduced.current) {
      m.jumpTo({ center: dest, zoom, padding: pad });
      done();
      return () => window.clearTimeout(later);
    }
    if (hop < 8) {
      m.easeTo({
        center: dest,
        zoom,
        padding: pad,
        duration: 1600,
        easing: EASE,
      });
      return () => window.clearTimeout(later);
    }
    m.flyTo({
      center: dest,
      zoom,
      padding: pad,
      duration: 1800,
      curve: 1.42,
    });
    return () => window.clearTimeout(later);
  }, [destLon, destLat, destZoom, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || flying.current) return;
    unlockMap(m);
    m.easeTo({
      padding: cameraPadding(Boolean(panelOpen)),
      duration: reduced.current ? 0 : 450,
    });
    const later = window.setTimeout(() => unlockMap(m), 600);
    return () => window.clearTimeout(later);
  }, [panelOpen, ready]);

  const resetView = useCallback(() => {
    const m = map.current;
    if (!m) return;
    unlockMap(m);
    m.stop();
    m.once("moveend", () => unlockMap(m));
    m.flyTo({
      center: WORLD.center,
      zoom: WORLD.zoom,
      padding: cameraPadding(false),
      duration: reduced.current ? 0 : 1600,
    });
  }, []);

  const toggleTheme = useCallback(() => {
    const m = map.current;
    const next: MapTheme = themeRef.current === "dark" ? "light" : "dark";
    themeRef.current = next;
    setTheme(next);
    writeMapTheme(next);
    document.documentElement.dataset.mapTheme = next;
    if (!m) return;
    m.getCanvas().style.background = next === "dark" ? "#0B0D10" : "#E6E6E1";
    const cam = {
      center: m.getCenter(),
      zoom: m.getZoom(),
      bearing: m.getBearing(),
      pitch: m.getPitch(),
    };
    m.setStyle(initialMapStyle(next));
    let applied = false;
    const go = () => {
      if (applied) return;
      applied = true;
      restoreOverlays(m, next);
      m.jumpTo(cam);
      unlockMap(m);
      m.resize();
    };
    m.once("style.load", go);
    m.once("styledata", () => { if (m.isStyleLoaded()) go(); });
  }, [restoreOverlays]);

  useEffect(() => {
    document.documentElement.dataset.mapTheme = theme;
  }, [theme]);

  return (
    <div className={styles.wrap} data-map-theme={theme}>
      <div ref={holder} className={styles.map} />
      <div className={styles.corner}>
        <button
          className={styles.reset}
          onClick={toggleTheme}
          type="button"
          aria-pressed={theme === "dark"}
          title={theme === "dark" ? "Switch to light map" : "Switch to dark map"}
        >
          {theme === "dark" ? "Light map" : "Dark map"}
        </button>
        <button className={styles.reset} onClick={resetView} type="button">
          Whole world
        </button>
        <p className={styles.status} aria-live="polite">
          {/* Tiles always paint: OpenFreeMap when no key, Protomaps when one
              is set. Never a "No basemap" / pins-only message. */}
          {loaded === 0 ? "Finding the places…"
            : loaded < 0 ? "The places didn't load. Reload and they should."
            : `${loaded.toLocaleString("en-GB")} places he ate`}
        </p>
      </div>
    </div>
  );
}
