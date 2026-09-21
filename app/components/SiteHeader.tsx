"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./SiteShell.module.css";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/map/", label: "Map" },
  { href: "/reels/", label: "Reels" },
  { href: "/about/", label: "About" },
];

export default function SiteHeader() {
  const path = usePathname() ?? "/";
  return (
    <header className={`${styles.header} arrival-nav`}>
      {/* next/link prefetches on hover by default in production builds. */}
      <Link href="/" className={styles.wordmark} aria-label="Bourdain Club — home">
        <span className={styles.sentence}>Bourdain Club</span>
      </Link>
      <nav className={styles.nav}>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={
              n.href === "/"
                ? path === "/" ? "page" : undefined
                : path.startsWith(n.href) ? "page" : undefined
            }
            // Map links carry the pill; everything else keeps its cursor.
            {...(n.href === "/map/" ? { "data-cursor": "sit" } : {})}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
