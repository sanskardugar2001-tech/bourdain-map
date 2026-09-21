import { parseFirstTable } from "../../../lib/firstTable";

export const dynamic = "force-dynamic";

/** Accepts a First Table signup. Sheets webhook is optional (owner skipped it). */
export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Name, age, gender, and a phone number." },
      { status: 400 },
    );
  }

  const parsed = parseFirstTable(input);
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const webhook = process.env.FIRST_TABLE_SHEETS_WEBHOOK?.trim();
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.value),
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.error("[first-table] sheet responded", res.status);
        return Response.json(
          { ok: false, error: "That didn't go through. Try again." },
          { status: 502 },
        );
      }
    } catch (err) {
      console.error("[first-table] sheet request failed", err instanceof Error ? err.name : "error");
      return Response.json(
        { ok: false, error: "That didn't go through. Try again." },
        { status: 502 },
      );
    }
  } else {
    // No sheet — still take the seat request so the form works.
    console.info("[first-table] signup", JSON.stringify(parsed.value));
  }

  return Response.json({ ok: true });
}
