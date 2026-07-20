import { NextRequest, NextResponse } from "next/server";
import { getAdminStore } from "@/lib/db";
import { LoadEntry, Player } from "@/lib/types";

type Params = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const store = getAdminStore();
  const players = (await store.list("players")) as Player[];
  const player = players.find((p) => p.token === token);
  if (!player) return NextResponse.json({ error: "Onbekende link" }, { status: 404 });

  try {
    const body = await req.json();
    const { date, session_type, minutes, rpe, fatigue, soreness, injury_flag, notes } = body;

    if (!date || !session_type || !minutes || !rpe) {
      return NextResponse.json({ error: "Vul in ieder geval datum, type, minuten en RPE in." }, { status: 400 });
    }

    // Upsert: overschrijf een eigen invoer van dezelfde dag/type i.p.v. dupliceren.
    const existing = (await store.list("load_entries")) as LoadEntry[];
    const match = existing.find(
      (e) => e.player_id === player.id && e.date === date && e.session_type === session_type
    );

    const patch = {
      player_id: player.id,
      date,
      session_type,
      absent: false, // een speler die zelf invult was per definitie aanwezig
      minutes: Number(minutes),
      rpe: Number(rpe),
      notes: notes || null,
      fatigue: fatigue ? Number(fatigue) : null,
      soreness: soreness ? Number(soreness) : null,
      injury_flag: Boolean(injury_flag),
      reported_by: "player" as const,
    };

    const saved = match ? await store.update("load_entries", match.id, patch) : (await store.insert("load_entries", [patch]))[0];
    return NextResponse.json(saved, { status: match ? 200 : 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
