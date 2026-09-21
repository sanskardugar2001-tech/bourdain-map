import type { Metadata } from "next";
import { Instrument_Serif, Inter_Tight } from "next/font/google";
import "./tokens.css";
import "./globals.css";
import SiteShell from "./components/SiteShell";

/* next/font self-hosts these at build time, so there is no runtime request to
   a font CDN and no silent fallback. Two families, no more: a display serif
   with actual character for names, one plain grotesk for everything else. */
const display = Instrument_Serif({
  variable: "--font-display-loaded",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});
const body = Inter_Tight({
  variable: "--font-body-loaded",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Where he ate",
  description:
    "Every place Anthony Bourdain ate, on one map. Fan-made, non-commercial, " +
    "not affiliated with the Bourdain estate, CNN, or Zero Point Zero.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} no-js`}>
      <head>
        {/* Hide the loader before first paint on a repeat visit, so there is
            no flash of it. Runs ahead of the bundle deliberately. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              // Runs before first paint. Puts the hero in its pre-animation
              // state so the curtain never lifts on settled content — and
              // does nothing at all without JS or under reduced motion, so
              // those readers get the finished page.
              "try{var r=document.documentElement;" +
              // Only the homepage runs an opening, so only the homepage gets a
              // pre-animation state. Setting it anywhere else hides the header
              // on a page that has nothing to clear it.
              "if(location.pathname==='/' && " +
              "!matchMedia('(prefers-reduced-motion: reduce)').matches){" +
              "r.dataset.opening='pending';" +
              // Pins the magnitude sequence before paint, so the first frame
              // is already the held number and not the stacked fallback.
              "r.dataset.scalePin='1'}}catch(e){}",
          }}
        />
      </head>
      <body>
        {/* Map routes get the full-bleed map with a panel over it; every
            other route is an ordinary document. Within the map routes the
            map never unmounts, so pin → city → pin costs nothing. */}
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
