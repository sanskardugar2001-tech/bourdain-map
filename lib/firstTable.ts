/** First Table list. Shared by the form and POST /api/first-table.
 *  No webhook URL here — that stays in FIRST_TABLE_SHEETS_WEBHOOK. */

export const GENDERS = [
  "Woman",
  "Man",
  "Non-binary",
  "Prefer not to say",
] as const;

export type Gender = (typeof GENDERS)[number];

export type FirstTableRow = {
  name: string;
  age: number;
  gender: Gender;
  phone: string;
  email: string;
  note: string;
  source: "site";
};

const NAME_MAX = 80;
const NOTE_MAX = 160;

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseFirstTable(input: unknown):
  | { ok: true; value: FirstTableRow }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Name, age, gender, and a phone number." };
  }
  const body = input as Record<string, unknown>;
  const name = str(body.name);
  const gender = str(body.gender);
  const phone = str(body.phone);
  const email = str(body.email);
  const note = str(body.note);
  const ageRaw = typeof body.age === "number" ? body.age : Number(str(body.age));
  const digits = phone.replace(/\D/g, "");

  if (!name || name.length > NAME_MAX) {
    return { ok: false, error: "Name, age, gender, and a phone number." };
  }
  if (!Number.isInteger(ageRaw) || ageRaw < 1 || ageRaw > 120) {
    return { ok: false, error: "Age needs to be a whole number." };
  }
  if (!GENDERS.includes(gender as Gender)) {
    return { ok: false, error: "Name, age, gender, and a phone number." };
  }
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, error: "That phone number doesn't look right." };
  }
  if (email && !validEmail(email)) {
    return { ok: false, error: "That email doesn't look right." };
  }
  if (note.length > NOTE_MAX) {
    return { ok: false, error: "Keep the note short." };
  }

  return {
    ok: true,
    value: {
      name,
      age: ageRaw,
      gender: gender as Gender,
      phone,
      email,
      note,
      source: "site",
    },
  };
}
