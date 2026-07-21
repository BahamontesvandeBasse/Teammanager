import { NextRequest, NextResponse } from "next/server";
import { getAdminStore } from "@/lib/db";
import { IndividualTraining, LoadEntry, Message, Player, SetPiece } from "@/lib/types";

async function resolvePlayer(token: string): Promise<Player | null> {
  const players = (await getAdminStore().list("players")) as Player[];
  return players.find((p) => p.token === token) ?? null;
}

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const player = await resolvePlayer(token);
  if (!player) return NextResponse.json({ error: "Onbekende link" }, { status: 404 });

  const store = getAdminStore();
  const [entries, messages, trainings, setPieces] = await Promise.all([
    store.list("load_entries") as Promise<LoadEntry[]>,
    store.list("messages") as Promise<Message[]>,
    store.list("individual_trainings") as Promise<IndividualTraining[]>,
    store.list("set_pieces") as Promise<SetPiece[]>,
  ]);

  const ownEntries = entries
    .filter((e) => e.player_id === player.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const ownMessages = messages
    .filter((m) => m.player_id === player.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const ownTrainings = trainings
    .filter((t) => t.player_id === player.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

  const ownSetPieces = setPieces
    .filter((sp) => sp.suggested_by_player_id === player.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

  return NextResponse.json({
    player: { id: player.id, name: player.name },
    entries: ownEntries,
    messages: ownMessages,
    trainings: ownTrainings,
    setPieces: ownSetPieces,
  });
}
