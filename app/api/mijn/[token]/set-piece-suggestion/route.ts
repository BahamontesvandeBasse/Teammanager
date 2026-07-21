import { NextRequest, NextResponse } from "next/server";
import { getAdminStore } from "@/lib/db";
import { Player, SET_PIECE_CATEGORIES, SET_PIECE_SIDES } from "@/lib/types";

type Params = { params: Promise<{ token: string }> };

// Speler stelt een spelhervatting voor — komt bij de staf terecht als
// suggestie (approved: false), zichtbaar in het beheerscherm Spelhervattingen.
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const store = getAdminStore();
  const players = (await store.list("players")) as Player[];
  const player = players.find((p) => p.token === token);
  if (!player) return NextResponse.json({ error: "Onbekende link" }, { status: 404 });

  try {
    const { category, side, title, description, drawing } = await req.json();
    if (!SET_PIECE_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Onbekende categorie." }, { status: 400 });
    }
    if (!SET_PIECE_SIDES.includes(side)) {
      return NextResponse.json({ error: "Kies aanvallen of verdedigen." }, { status: 400 });
    }
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Titel ontbreekt." }, { status: 400 });
    }
    const saved = await store.insert("set_pieces", [
      {
        category,
        side,
        title: title.trim(),
        description: typeof description === "string" ? description.trim() : "",
        drawing: Array.isArray(drawing) ? drawing : [],
        approved: false,
        suggested_by: "player",
        suggested_by_player_id: player.id,
        created_at: new Date().toISOString(),
      },
    ]);
    return NextResponse.json(saved[0], { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
