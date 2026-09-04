import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { resolveRole } from "@/lib/auth/access";
import { Match, MatchReflection } from "@/lib/types";

// Voor spelers die na een gespeelde wedstrijd hun eigen analyse invullen
// (positief punt, negatief punt, eigen beoordeling). Bewust een los endpoint
// van /api/data/match_reflections: dat vereist canEdit (admin/staf). Een
// speler mag alleen zijn eigen reflectie aanmaken/bijwerken (player_id komt
// uit de sessie, nooit uit de request-body), en alleen voor een wedstrijd die
// al gespeeld is. In tegenstelling tot de belasting-invoer is dit een eigen
// mening, geen gemeten data — daarom wel vrij te bewerken (upsert).
export async function POST(req: NextRequest) {
  const role = await resolveRole();
  if (role !== "speler") {
    return NextResponse.json({ error: "Alleen spelers kunnen hun eigen wedstrijdanalyse invullen." }, { status: 403 });
  }

  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) {
    return NextResponse.json({ error: "Geen speler gekoppeld aan dit account." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { match_id, positive, negative, self_rating } = body;

    if (typeof match_id !== "string" || !match_id) {
      return NextResponse.json({ error: "Wedstrijd ontbreekt." }, { status: 400 });
    }

    const store = getStore();
    const matches = (await store.list("matches")) as unknown as Match[];
    const match = matches.find((m) => m.id === match_id);
    if (!match) return NextResponse.json({ error: "Wedstrijd niet gevonden." }, { status: 404 });
    if (match.score_for === null || match.score_against === null) {
      return NextResponse.json({ error: "Deze wedstrijd is nog niet gespeeld." }, { status: 400 });
    }

    const ratingNum = self_rating === null || self_rating === undefined || self_rating === "" ? null : Number(self_rating);
    if (ratingNum !== null && (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 10)) {
      return NextResponse.json({ error: "Beoordeling moet tussen 1 en 10 zijn." }, { status: 400 });
    }

    const positiveText = typeof positive === "string" && positive.trim() ? positive.trim() : null;
    const negativeText = typeof negative === "string" && negative.trim() ? negative.trim() : null;
    if (!positiveText && !negativeText && ratingNum === null) {
      return NextResponse.json({ error: "Vul minstens één veld in." }, { status: 400 });
    }

    const existing = (await store.list("match_reflections")) as unknown as MatchReflection[];
    const current = existing.find((r) => r.match_id === match_id && r.player_id === playerId);

    const patch = {
      positive: positiveText,
      negative: negativeText,
      self_rating: ratingNum,
      updated_at: new Date().toISOString(),
    };

    const saved = current
      ? await store.update("match_reflections", current.id, patch)
      : (await store.insert("match_reflections", [
          { match_id, player_id: playerId, ...patch, created_at: new Date().toISOString() },
        ]))[0];

    return NextResponse.json(saved, { status: current ? 200 : 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
