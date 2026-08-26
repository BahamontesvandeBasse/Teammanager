import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { resolveRole } from "@/lib/auth/access";
import { todayIso, daysBetweenIso } from "@/lib/format";

const MIN_DAYS_NOTICE = 7;

// Voor spelers die hun eigen (toekomstige) afwezigheid melden. Los endpoint van
// /api/data/absences (canEdit/staf-only): een speler mag alleen een afwezigheid
// voor zichzelf aanmaken, en alleen als die minstens 7 dagen vooruit ligt — voor
// afwezigheid binnen die week moet de speler de trainer bellen, zodat de staf
// nooit op het laatste moment verrast wordt door een appje. Gaat direct in
// (geen goedkeuring nodig) maar staat als "niet gezien" totdat de staf het heeft
// bekeken (zie /api/data/absences PATCH voor het afvinken).
export async function POST(req: NextRequest) {
  const role = await resolveRole();
  if (role !== "speler") {
    return NextResponse.json({ error: "Alleen spelers kunnen hun eigen afwezigheid melden." }, { status: 403 });
  }

  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) {
    return NextResponse.json({ error: "Geen speler gekoppeld aan dit account." }, { status: 400 });
  }

  try {
    const { from, until, reason } = await req.json();
    if (typeof from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return NextResponse.json({ error: "Ongeldige begindatum." }, { status: 400 });
    }
    if (typeof until !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
      return NextResponse.json({ error: "Ongeldige einddatum." }, { status: 400 });
    }
    if (until < from) {
      return NextResponse.json({ error: "De einddatum ligt voor de begindatum." }, { status: 400 });
    }

    const today = todayIso();
    if (daysBetweenIso(today, from) < MIN_DAYS_NOTICE) {
      return NextResponse.json(
        {
          error: `Afwezigheid binnen ${MIN_DAYS_NOTICE} dagen kun je niet zelf melden — neem hiervoor telefonisch contact op met de trainer.`,
        },
        { status: 400 }
      );
    }

    const saved = await getStore().insert("absences", [
      {
        player_id: playerId,
        staff_id: null,
        from,
        until,
        reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
        reported_by: "player",
        acknowledged: false,
      },
    ]);
    return NextResponse.json(saved[0], { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
