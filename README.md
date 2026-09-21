# Bourdain Club

A map of every place Anthony Bourdain ate, and a way to go and eat there with
someone you haven't met. Fan-made, non-commercial, not affiliated with the
Bourdain estate, CNN, or Zero Point Zero.

2,095 places · 2,135 appearances · 746 cities · 302 episodes.

## How it's put together

**The database is a compiler.** Postgres is the build-time workbench; the site
reads static artifacts and never queries a database to draw the map.

```
data/*.kml            deannd's five Google My Maps exports
  → scripts/import_kml.py        → supabase/seed.sql
  → scripts/geocode.py           → supabase/seed_geocode.sql   (Nominatim, cached)
  → scripts/fetch_episodes.py    → data/episodes.json          (Wikipedia, cached)
  → scripts/build_cities.py      → supabase/seed_cities.sql
  → scripts/export_map_data.py   → public/data/*.json  +  data/detail.json
```

Every stage is idempotent, offline where it can be, and writes a log to
`notes/`. Re-run any one of them alone.

**The write path** — sign-in, tables, RSVPs, stories, corrections — is
client-side Supabase on top of the static pages, gated by RLS. Static export
works for this: both magic-link flows resolve in the browser. Don't reach for
`@supabase/ssr`; its cookie session needs a server and would force SSR.

## Running it locally

```bash
npm install
supabase start                       # local Postgres + auth, needs Docker
supabase db reset                    # migrations + all three seed files
python3 scripts/export_map_data.py   # regenerate the static artifacts
npm run dev                          # http://localhost:3000
```

`npm run build` prerenders the pages and keeps one server route,
`POST /api/first-table`. It runs `scripts/optimise_photos.mjs` first, which
resizes the About page's photos.

## Environment variables

Copy `.env.example` to `.env.local` for local work, and set the same values in
Vercel (Project → Settings → Environment Variables, all environments).

| Variable | What it's for | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth, tables, stories, corrections | Supabase → Project Settings → Data API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same | Supabase → Project Settings → API Keys → `anon` / publishable |
| `NEXT_PUBLIC_PROTOMAPS_KEY` | Basemap tiles | https://protomaps.com → sign up → API key |
| `NEXT_PUBLIC_PMTILES_URL` | Basemap tiles, self-hosted alternative | A `.pmtiles` URL on R2. Leave unset if using the key above |
| `FIRST_TABLE_SHEETS_WEBHOOK` | First Table form → Google Sheet | Apps Script web app URL. See `scripts/first-table-sheets-webhook.gs`. Server only. |

The `NEXT_PUBLIC_` keys end up in the browser bundle. That is correct for
them: the anon key is designed to be public and is useless without the RLS
policies, and the tile key is a per-domain read key. The sheet webhook is
not public. It stays in `FIRST_TABLE_SHEETS_WEBHOOK` and is read only by
`POST /api/first-table`.

Without the tile variables the map still runs — light paper (OpenFreeMap
Positron) by default, with a night toggle. No API key, no watermark.
Optionally set `NEXT_PUBLIC_PROTOMAPS_KEY` on Vercel later for vector tiles.
Without the Supabase ones, the map still works. The First Table form needs
`FIRST_TABLE_SHEETS_WEBHOOK` or the signup does not confirm.

## Deploying

See `notes/launch.md` for the click-by-click. Short version:

```bash
supabase link --project-ref YOUR_REF
supabase db push                                    # schema
psql "$DB_URL" -f supabase/seed.sql                 # 2,095 places
psql "$DB_URL" -f supabase/seed_geocode.sql
psql "$DB_URL" -f supabase/seed_cities.sql
vercel --prod
```

## The parts worth knowing about

- **`notes/decisions.md`** — everything settled and why, including the things
  that turned out to be wrong.
- **`notes/questions.md`** — what still needs a human.
- **`notes/perf.md`** — measured numbers, including two budgets that are missed.
- **`notes/import-skips.log`**, **`notes/episode-matching.log`**,
  **`notes/geocode-failures.log`** — what each stage refused to guess at.
- **`content/about.json`** — the whole About page. Photos and prose slot in
  without touching code.

## Credit

Almost every place here comes from a map **deannd** built on r/AnthonyBourdain
over about two years. Used with permission. Her descriptions appear throughout,
quoted and credited — they're hers, not ours.

This site sells nothing and never will.
