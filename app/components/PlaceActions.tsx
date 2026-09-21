"use client";

import { useState } from "react";
import { supabase, supabaseConfigured, useAuth } from "../../lib/supabase";
import s from "./ui.module.css";
import Link from "next/link";

/* Flag a wrong pin. Tables and stories are not on the site. */

export default function PlaceActions({ placeId, placeName }: { placeId: string; placeName: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!supabaseConfigured) return null;

  return (
    <section className={s.section}>
      <h2 className={s.h2}>Something wrong?</h2>
      {open ? (
        <CorrectionForm placeId={placeId} onDone={() => setOpen(false)} />
      ) : user ? (
        <button className={s.linkButton} onClick={() => setOpen(true)}>
          Tell us about {placeName}
        </button>
      ) : (
        <p className={s.note}>
          <Link href="/account/">Sign in</Link> to flag a closed place or a wrong pin.
        </p>
      )}
    </section>
  );
}

function CorrectionForm({ placeId, onDone }: { placeId: string; onDone: () => void }) {
  const { user } = useAuth();
  const [kind, setKind] = useState("closed");
  const [body, setBody] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (done) {
    return (
      <p className={s.note}>
        Thanks — that goes straight to whoever maintains this. Nothing else happens
        automatically, a person reads it.
      </p>
    );
  }
  return (
    <form className={s.form} onSubmit={async (e) => {
      e.preventDefault();
      setErr(null);
      const { error } = await supabase.from("corrections").insert({
        place_id: placeId, submitter_id: user?.id ?? null, kind, body: body.trim(),
      });
      if (error) return setErr(error.message);
      setDone(true);
    }}>
      <label className={s.label} htmlFor="kind">What&rsquo;s wrong</label>
      <select id="kind" className={s.select} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="closed">It&rsquo;s closed</option>
        <option value="wrong_coords">The pin is in the wrong place</option>
        <option value="missing_info">Something here is wrong or missing</option>
        <option value="episode">Wrong show or episode</option>
      </select>
      <label className={s.label} htmlFor="fixbody">Tell us</label>
      <textarea id="fixbody" className={s.textarea} required value={body} maxLength={1000}
        onChange={(e) => setBody(e.target.value)} placeholder="What you know." />
      <div className={s.row}>
        <button className={s.button} type="submit">Send it</button>
        <button className={s.ghost} type="button" onClick={onDone}>Cancel</button>
      </div>
      {err && <p className={s.err}>{err}</p>}
    </form>
  );
}
