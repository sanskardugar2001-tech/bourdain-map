import s from "./home.module.css";

export default function Credits({
  extra,
}: {
  extra?: { photo: string; credit: string }[];
}) {
  return (
    <footer className={s.colophon}>
      <div className={s.colGrid}>
        <div>
          <p className="label">the places</p>
          <p className={s.colText}>
            Almost every place here comes from a map <strong>deannd</strong>{" "}
            built on r/AnthonyBourdain over about two years. Used with
            permission. Her descriptions appear on the place pages, quoted
            and credited — they are hers, not ours.
          </p>
        </div>
        <div>
          <p className="label">what this isn&rsquo;t</p>
          <p className={s.colText}>
            This site sells nothing. No ads, no affiliate links, no bookings,
            no sponsored placement — not now and not later.
          </p>
          <p className={s.colText}>
            It is not affiliated with the Bourdain estate, CNN, or Zero Point
            Zero. Nobody involved with the shows has anything to do with it.
          </p>
        </div>
        <div>
          <p className="label">photographs &amp; film</p>
          {extra?.length ? (
            <ul className={s.creditList}>
              {extra.map((c) => (
                <li key={c.photo}>{c.credit}</li>
              ))}
            </ul>
          ) : (
            <p className={s.colText}>
              Portraits are CC BY 2.0 via Wikimedia Commons. The pullback
              clip is by MANIFESTO (@bymnfsto), used with permission.
            </p>
          )}
        </div>
      </div>
      <p className={s.colRule}>
        Fan-made, non-commercial. Place data: deannd. Film: MANIFESTO.
      </p>
    </footer>
  );
}
