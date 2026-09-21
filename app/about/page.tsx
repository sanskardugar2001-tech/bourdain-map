import styles from "./about.module.css";
import Link from "next/link";

export const metadata = {
  title: "About",
  description: "Sanskar. The map, and one table in London.",
};

export default function About() {
  return (
    <>
      <article className={styles.about}>
        <header className={styles.intro}>
          <img
            className={styles.portrait}
            src="/about/sanskar.jpg"
            alt="Sanskar"
            width={800}
            height={1000}
          />
          <h1 className={styles.h1}>About</h1>
          <p className={styles.lede}>Heya — Sanskar this side.</p>
        </header>

        <div className={styles.essay}>
          <p>
            I&rsquo;m 24. Moved to London from India for uni in 2021; now I
            lead marketing at a startup here.
          </p>
          <p>
            I have one tattoo. It&rsquo;s Bourdain. That should tell you enough.
          </p>
          <p>
            It started as pleasure — watching some guy travel and eat. Then it
            became the stories. Joy in simple things. Eating at a local spot
            with the same respect he&rsquo;d give a white-tablecloth room. I
            want to live a bit more like that, and meet people who do too.
          </p>
          <p>
            Weird, how much one person can change how you see strangers.
            He&rsquo;s made me kinder, a little humbler, less quick to judge —
            and yes, that sounds like I&rsquo;m polishing my own halo. Still true.
          </p>
          <p>
            I&rsquo;m starting to find more people who got the same spark from
            him. This site — and the <Link href="/#london">First Table</Link> —
            is me trying to sit down with them.
          </p>
        </div>
      </article>
    </>
  );
}
