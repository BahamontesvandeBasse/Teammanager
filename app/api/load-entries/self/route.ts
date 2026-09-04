import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { resolveRole } from "@/lib/auth/access";
import { LoadEntry } from "@/lib/types";

// Voor spelers die hun eigen belasting (RPE/vermoeidheid/spierpijn) na een training of
// wedstrijd invullen. Bewust een los endpoint van /api/data/load_entries: dat vereist
// canEdit (admin/staf). Een speler mag alleen:
// - zijn eigen data aanmaken (player_id komt uit de sessie, nooit uit de request-body),
// - dat precies één keer per sessie (datum + type) — daarna niet meer aanpassen. Bij een
//   fout moet de speler de staf vragen; dat voorkomt dat achteraf aangepaste cijfers de
//   belasting-analyse stiekem vertekenen.
export async function POST(req: NextRequest) {
  const role = await resolveRole();
  if (role !== "speler") {
    return NextResponse.json({ error: "Alleen spelers kunnen hun eigen belasting invullen." }, { status: 403 });
  }

  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) {
    return NextResponse.json({ error: "Geen speler gekoppeld aan dit account." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { date, session_type, absent, minutes, rpe, fatigue, soreness, injury_flag, injury_severity, notes } = body;

    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Ongeldige datum." }, { status: 400 });
    }
    if (session_type !== "training" && session_type !== "wedstrijd") {
      return NextResponse.json({ error: "Onbekend type sessie." }, { status: 400 });
    }
    const validSeverities = ["licht", "matig", "ernstig"];
    if (injury_severity !== null && injury_severity !== undefined && !validSeverities.includes(injury_severity)) {
      return NextResponse.json({ error: "Ongeldige ernst voor de blessure." }, { status: 400 });
    }
    // Aangevinkt zonder ernst-keuze → voorzichtigheidshalve "ernstig" behandelen i.p.v. aannemen dat het licht is.
    const severity = injury_flag === true ? injury_severity ?? "ernstig" : null;

    const store = getStore();
    const existing = (await store.list("load_entries")) as unknown as LoadEntry[];
    const already = existing.some(
      (e) => e.player_id === playerId && e.date === date && e.session_type === session_type
    );
    if (already) {
      return NextResponse.json(
        { error: "Je hebt deze sessie al ingevuld — dit kan niet meer aangepast worden. Vraag de staf als er iets moet veranderen." },
        { status: 409 }
      );
    }

    if (absent === true) {
      const saved = await store.insert("load_entries", [
        {
          player_id: playerId,
          date,
          session_type,
          absent: true,
          minutes: null,
          rpe: null,
          notes: null,
          fatigue: null,
          soreness: null,
          injury_flag: false,
          injury_severity: null,
          reported_by: "player",
        },
      ]);
      return NextResponse.json(saved[0], { status: 201 });
    }

    const minutesNum = Number(minutes);
    const rpeNum = Number(rpe);
    if (!Number.isFinite(minutesNum) || minutesNum <= 0) {
      return NextResponse.json({ error: "Vul de minuten in." }, { status: 400 });
    }
    if (!Number.isFinite(rpeNum) || rpeNum < 1 || rpeNum > 10) {
      return NextResponse.json({ error: "RPE moet tussen 1 en 10 zijn." }, { status: 400 });
    }
    const fatigueNum = fatigue === null || fatigue === undefined || fatigue === "" ? null : Number(fatigue);
    const sorenessNum = soreness === null || soreness === undefined || soreness === "" ? null : Number(soreness);
    if (fatigueNum !== null && (!Number.isFinite(fatigueNum) || fatigueNum < 1 || fatigueNum > 10)) {
      return NextResponse.json({ error: "Vermoeidheid moet tussen 1 en 10 zijn." }, { status: 400 });
    }
    if (sorenessNum !== null && (!Number.isFinite(sorenessNum) || sorenessNum < 1 || sorenessNum > 10)) {
      return NextResponse.json({ error: "Spierpijn moet tussen 1 en 10 zijn." }, { status: 400 });
    }

    const saved = await store.insert("load_entries", [
      {
        player_id: playerId,
        date,
        session_type,
        absent: false,
        minutes: Math.round(minutesNum),
        rpe: Math.round(rpeNum),
        notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
        fatigue: fatigueNum,
        soreness: sorenessNum,
        injury_flag: injury_flag === true,
        injury_severity: severity,
        reported_by: "player",
      },
    ]);
    return NextResponse.json(saved[0], { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
