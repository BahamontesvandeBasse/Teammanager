import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { generateSchedule } from "@/lib/schedule";
import { Match, Player } from "@/lib/types";

// Genereert het was- en rijschema voor het hele seizoen (vervangt bestaande schema's).
export async function POST() {
  try {
    const store = getStore();
    const [players, matches] = await Promise.all([
      store.list("players") as Promise<Player[]>,
      store.list("matches") as Promise<Match[]>,
    ]);

    if (players.filter((p) => p.active).length === 0) {
      return NextResponse.json({ error: "Geen actieve spelers — importeer eerst de spelerslijst." }, { status: 400 });
    }
    if (matches.length === 0) {
      return NextResponse.json({ error: "Geen wedstrijden — importeer eerst het programma." }, { status: 400 });
    }

    const { wash, carpool } = generateSchedule(players, matches);

    await store.clear("wash_duty");
    await store.clear("carpool_duty");
    if (wash.length > 0) await store.insert("wash_duty", wash);
    if (carpool.length > 0) await store.insert("carpool_duty", carpool);

    return NextResponse.json({ wash: wash.length, carpool: carpool.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
