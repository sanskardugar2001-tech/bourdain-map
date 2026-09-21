"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase, supabaseConfigured, useAuth, signIn, signOut } from "../../lib/supabase";
import s from "./ui.module.css";

/** Sign in, sign out, edit your display name. That's the whole account. */
export default function Account() {
  const { user, profile, ready, setProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!supabaseConfigured) {
    return (
      <div className={`${s.form} ${s.page}`}>
        <h2 className={s.h2}>No account needed</h2>
        <p className={s.note}>
          The map is open without signing in. Leave a name for the first
          London table if that&rsquo;s why you&rsquo;re here.
        </p>
        <Link className={s.button} href="/#london">
          One table in London
        </Link>
      </div>
    );
  }
  if (!ready) return <p className={s.note}>…</p>;

  if (!user) {
    return (
      <form
        className={s.form}
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          const { error } = await signIn(email.trim());
          if (error) setErr(error.message);
          else setSent(true);
        }}
      >
        <h2 className={s.h2}>Sign in</h2>
        {sent ? (
          <p className={s.note}>
            Check your email. The link signs you in — no password to remember or lose.
          </p>
        ) : (
          <>
            <label className={s.label} htmlFor="email">Your email</label>
            <input
              id="email" className={s.input} type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
            />
            <button className={s.button} type="submit">Send me a link</button>
            <p className={s.note}>
              Only needed to flag a wrong pin. Looking at the map needs nothing.
            </p>
          </>
        )}
        {err && <p className={s.err}>{err}</p>}
      </form>
    );
  }

  return (
    <div className={s.form}>
      <h2 className={s.h2}>You</h2>
      <p className={s.note}>Signed in as {user.email}</p>
      <label className={s.label} htmlFor="dn">Display name</label>
      <input
        id="dn" className={s.input}
        value={name || profile?.display_name || ""}
        onChange={(e) => { setName(e.target.value); setSaved(false); }}
        placeholder="What people will see"
      />
      <button
        className={s.button}
        onClick={async () => {
          setErr(null);
          const next = (name || profile?.display_name || "").trim();
          if (!next) return;
          const { error } = await supabase.from("profiles")
            .update({ display_name: next }).eq("id", user.id);
          if (error) setErr(error.message);
          else { setSaved(true); setProfile(profile ? { ...profile, display_name: next } : null); }
        }}
      >
        Save
      </button>
      {saved && <p className={s.note}>Saved.</p>}
      {err && <p className={s.err}>{err}</p>}
      <button className={s.linkButton} onClick={() => signOut()}>Sign out</button>
    </div>
  );
}
