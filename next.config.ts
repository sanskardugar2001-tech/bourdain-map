import type { NextConfig } from "next";

/**
 * Pages are still generated up front. Postgres is the build-time workbench,
 * not the runtime. One route is a server: POST /api/first-table reads
 * FIRST_TABLE_SHEETS_WEBHOOK and appends a row. That cannot live in a pure
 * static export, so `output: "export"` stays off.
 *
 * Auth stays in the browser (magic link). Don't reach for @supabase/ssr.
 */
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
  // A stray package-lock.json in the home directory makes Turbopack infer the
  // workspace root as ~ and warn on every start. Pinning it silences that and
  // keeps module resolution inside the project.
  turbopack: { root: __dirname },
  // next dev 403s chunk requests whose origin it doesn't recognise, and the
  // symptom is a blank map rather than anything mentioning permissions —
  // /_next/static/chunks/*.js simply abort. Both spellings of localhost are
  // the same machine.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // The dev-tools badge defaults to bottom-left, directly on top of the map's
  // status line. Dev-only, so it never affected production, but it obscured
  // the empty state during development.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
