/** This device's copy of a First Table signup. The sheet is the record. */

export const INTEREST_KEY = "wha:london-interest";
export const INTEREST_EVENT = "wha:london-interest";

export type Interest = {
  name: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  note: string;
  at: number;
};

export function readInterest(): Interest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(INTEREST_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Interest;
    return saved?.name ? saved : null;
  } catch {
    return null;
  }
}

export function writeInterest(row: Interest) {
  localStorage.setItem(INTEREST_KEY, JSON.stringify(row));
  window.dispatchEvent(new CustomEvent(INTEREST_EVENT, { detail: row }));
}

export function onInterest(fn: (row: Interest | null) => void): () => void {
  const ping = () => fn(readInterest());
  const onStore = (e: StorageEvent) => {
    if (e.key === INTEREST_KEY) ping();
  };
  window.addEventListener(INTEREST_EVENT, ping);
  window.addEventListener("storage", onStore);
  ping();
  return () => {
    window.removeEventListener(INTEREST_EVENT, ping);
    window.removeEventListener("storage", onStore);
  };
}
