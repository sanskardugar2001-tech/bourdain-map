"use client";

import { useEffect, useState } from "react";
import { GENDERS, parseFirstTable } from "../../lib/firstTable";
import {
  onInterest,
  writeInterest,
  type Interest,
} from "../../lib/londonInterest";
import s from "./ui.module.css";

export default function DinnerInterest({
  id = "london",
  seats = 8,
}: {
  id?: string;
  seats?: number;
}) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<Interest | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => onInterest(setSaved), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const parsed = parseFirstTable({
      name,
      age,
      gender,
      phone,
      email,
      note,
    });
    if (!parsed.ok) {
      setErr(parsed.error);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/first-table/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.value),
      });
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setErr(data?.error || "That didn't go through. Try again.");
        return;
      }
      const row: Interest = { ...parsed.value, at: Date.now() };
      try { writeInterest(row); } catch { /* private mode */ }
      setSaved(row);
    } catch {
      setErr("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className={s.form} id={id} data-done="true" aria-live="polite">
        <p className={s.h2}>You&rsquo;re on the list</p>
        <p className={s.note}>
          {saved.name}. One table in London. {seats} seats. Come alone.
        </p>
      </div>
    );
  }

  return (
    <form className={s.form} id={id} onSubmit={onSubmit} noValidate>
      <label className={s.label} htmlFor={`${id}-name`}>Name</label>
      <input
        id={`${id}-name`}
        className={s.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
        required
      />
      <label className={s.label} htmlFor={`${id}-age`}>Age</label>
      <input
        id={`${id}-age`}
        className={s.input}
        type="number"
        inputMode="numeric"
        min={1}
        max={120}
        value={age}
        onChange={(e) => setAge(e.target.value)}
        required
      />
      <label className={s.label} htmlFor={`${id}-gender`}>Gender</label>
      <select
        id={`${id}-gender`}
        className={s.select}
        value={gender}
        onChange={(e) => setGender(e.target.value)}
        required
      >
        <option value="">Choose</option>
        {GENDERS.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>
      <label className={s.label} htmlFor={`${id}-phone`}>Phone</label>
      <input
        id={`${id}-phone`}
        className={s.input}
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoComplete="tel"
        required
      />
      <label className={s.label} htmlFor={`${id}-email`}>Email</label>
      <input
        id={`${id}-email`}
        className={s.input}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <label className={s.label} htmlFor={`${id}-note`}>Anything to say</label>
      <input
        id={`${id}-note`}
        className={s.input}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={160}
        placeholder="showing up hungry, no plan"
      />
      <button className={s.button} type="submit" disabled={busy}>
        {busy ? "Holding your seat…" : "Put me on the list"}
      </button>
      {err && <p className={s.err} role="alert">{err}</p>}
    </form>
  );
}
