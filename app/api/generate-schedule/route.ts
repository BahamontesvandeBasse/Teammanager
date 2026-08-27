import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { generateCorveeSchedule, generateSchedule } from "@/lib/schedule";
import { Absence, CarpoolDuty, CorveeDuty, Match, Player, ScheduleItem, WashDuty } from "@/lib/types";

// Vult het was-, rij- en corveeschema aan voor wedstrijden/weken die nog geen
// beurt hebben. Bestaande beurten (ook handmatig aangepaste) blijven
// ongewijzigd staan — nieuw toegevoegde wedstrijden/trainingen verschuiven dus
// niemand die al is ingedeeld.
export async function POST() {
  try {
    const store = getStore();
    const [players, matches, existingWash, existingCarpool, scheduleItems, absences, existingCorvee] =
      await Promise.all([
        store.list("players") as Promise<Player[]>,
        store.list("matches") as Promise<Match[]>,
        store.list("wash_duty") as Promise<WashDuty[]>,
        store.list("carpool_duty") as Promise<CarpoolDuty[]>,
        store.list("schedule_items") as Promise<ScheduleItem[]>,
        store.list("absences") as Promise<Absence[]>,
        store.list("corvee_duty") as Promise<CorveeDuty[]>,
      ]);

    if (players.filter((p) => p.active).length === 0) {
      return NextResponse.json({ error: "Geen actieve spelers — importeer eerst de spelerslijst." }, { status: 400 });
    }
    if (matches.length === 0) {
      return NextResponse.json({ error: "Geen wedstrijden — importeer eerst het programma." }, { status: 400 });
    }

    const matchIds = new Set(matches.map((m) => m.id));
    const relevantWash = existingWash.filter((w) => matchIds.has(w.match_id));
    const relevantCarpool = existingCarpool.filter((c) => matchIds.has(c.match_id));

    const { wash, carpool } = generateSchedule(players, matches, relevantWash, relevantCarpool);

    // Corvee-generatie gebruikt de bestaande wasbeurten (voor de voorkeurskoppeling)
    // inclusief net hierboven aangevulde nieuwe wasbeurten, zodat een net gegenereerde
    // wasbeurt ook meteen als voorkeur meetelt.
    const corvee = generateCorveeSchedule(
      players,
      scheduleItems,
      matches,
      [...relevantWash, ...wash],
      absences,
      existingCorvee
    );

    if (wash.length > 0) await store.insert("wash_duty", wash);
    if (carpool.length > 0) await store.insert("carpool_duty", carpool);
    if (corvee.length > 0) await store.insert("corvee_duty", corvee);

    return NextResponse.json({ wash: wash.length, carpool: carpool.length, corvee: corvee.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
