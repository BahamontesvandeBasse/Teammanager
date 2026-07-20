import { NextRequest, NextResponse } from "next/server";
import { getAdminStore } from "@/lib/db";
import { Player } from "@/lib/types";

type Params = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const store = getAdminStore();
  const players = (await store.list("players")) as Player[];
  const player = players.find((p) => p.token === token);
  if (!player) return NextResponse.json({ error: "Onbekende link" }, { status: 404 });

  try {
    const { body } = await req.json();
    if (!body || !String(body).trim()) {
      return NextResponse.json({ error: "Bericht mag niet leeg zijn." }, { status: 400 });
    }
    const saved = await store.insert("messages", [
      {
        player_id: player.id,
        sender: "player",
        sender_name: player.name,
        body: String(body).trim(),
        created_at: new Date().toISOString(),
      },
    ]);
    return NextResponse.json(saved[0], { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
