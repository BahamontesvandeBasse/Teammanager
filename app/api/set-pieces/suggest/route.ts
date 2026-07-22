import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { resolveRole } from "@/lib/auth/access";
import { SET_PIECE_CATEGORIES, SET_PIECE_SIDES } from "@/lib/types";

// Voor spelers die inloggen met een eigen "speler"-account (in plaats van de
// tokenlink /mijn/[token]) — zelfde suggestie-mechanisme, maar sessie-based.
// Bewust een los endpoint van /api/data/set_pieces: die vereist canEdit
// (admin/staf), spelers mogen alleen een ongekeurde suggestie aanmaken.
export async function POST(req: NextRequest) {
  const role = await resolveRole();
  if (role !== "speler") {
    return NextResponse.json({ error: "Alleen spelers kunnen een spelhervatting voorstellen." }, { status: 403 });
  }

  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) {
    return NextResponse.json({ error: "Geen speler gekoppeld aan dit account." }, { status: 400 });
  }

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
    const saved = await getStore().insert("set_pieces", [
      {
        category,
        side,
        title: title.trim(),
        description: typeof description === "string" ? description.trim() : "",
        drawing: Array.isArray(drawing) ? drawing : [],
        approved: false,
        suggested_by: "player",
        suggested_by_player_id: playerId,
        created_at: new Date().toISOString(),
      },
    ]);
    return NextResponse.json(saved[0], { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
