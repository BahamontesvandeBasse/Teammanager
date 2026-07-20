import { NextRequest, NextResponse } from "next/server";
import { getAdminStore } from "@/lib/db";
import { Player } from "@/lib/types";

type Params = { params: Promise<{ token: string }> };

// Speler kiest zelf een "extra training" (vrijblijvend, geen toewijzing door de staf nodig).
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const store = getAdminStore();
  const players = (await store.list("players")) as Player[];
  const player = players.find((p) => p.token === token);
  if (!player) return NextResponse.json({ error: "Onbekende link" }, { status: 404 });

  try {
    const { title, description } = await req.json();
    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Titel ontbreekt." }, { status: 400 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const saved = await store.insert("individual_trainings", [
      {
        player_id: player.id,
        title,
        description: description || null,
        target_date: today,
        status: "voltooid",
        notes: null,
        created_at: new Date().toISOString(),
        created_by: "player",
      },
    ]);
    return NextResponse.json(saved[0], { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
