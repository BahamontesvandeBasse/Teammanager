import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { Match, MatchPreparation, Player, TacticalMoment, VideoLink, VideoNote } from "@/lib/types";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const MOMENT_LABELS: Record<TacticalMoment, string> = {
  attacking: "Aanvallen",
  defending: "Verdedigen",
  transition_to_attack: "Omschakelen naar aanvallen",
  transition_to_defense: "Omschakelen naar verdedigen",
};

const LINE_LABELS: Record<string, string> = {
  verdediging: "Verdediging",
  middenveld: "Middenveld",
  aanval: "Aanval",
};

function buildPrepThemes(prep: MatchPreparation | undefined): string {
  if (!prep) return "";
  const lines: string[] = [];
  if (prep.formation) lines.push(`Opstelling/systeem: ${prep.formation}`);

  if (prep.tactical_notes) {
    const { team, line } = prep.tactical_notes;
    for (const moment of Object.keys(team) as TacticalMoment[]) {
      if (team[moment]?.trim()) lines.push(`Team — ${MOMENT_LABELS[moment]}: ${team[moment].trim()}`);
    }
    for (const lineName of Object.keys(line) as (keyof typeof line)[]) {
      for (const moment of Object.keys(line[lineName]) as TacticalMoment[]) {
        const note = line[lineName][moment];
        if (note?.trim()) {
          lines.push(`${LINE_LABELS[lineName] ?? lineName} — ${MOMENT_LABELS[moment]}: ${note.trim()}`);
        }
      }
    }
  }

  if (prep.corners_notes?.trim()) lines.push(`Corners: ${prep.corners_notes.trim()}`);
  if (prep.freekicks_notes?.trim()) lines.push(`Vrije trappen: ${prep.freekicks_notes.trim()}`);
  if (prep.throwins_notes?.trim()) lines.push(`Ingooien: ${prep.throwins_notes.trim()}`);

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ontbreekt. Zet deze in .env.local om AI-advies te kunnen genereren." },
      { status: 400 }
    );
  }

  const { video_link_id } = await req.json();
  if (!video_link_id) return NextResponse.json({ error: "video_link_id ontbreekt" }, { status: 400 });

  try {
    const store = getStore();
    const [videoLinks, videoNotes, matches, players, preparations] = await Promise.all([
      store.list("video_links"),
      store.list("video_notes"),
      store.list("matches"),
      store.list("players"),
      store.list("match_preparations"),
    ]);

    const videoLink = (videoLinks as VideoLink[]).find((v) => v.id === video_link_id);
    if (!videoLink) return NextResponse.json({ error: "Video niet gevonden" }, { status: 404 });

    const notes = (videoNotes as VideoNote[])
      .filter((n) => n.video_link_id === video_link_id)
      .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);

    const match = (matches as Match[]).find((m) => m.id === videoLink.match_id);
    const prep = (preparations as MatchPreparation[]).find((p) => p.match_id === videoLink.match_id);
    const prepThemes = buildPrepThemes(prep);

    if (notes.length === 0 && !prepThemes) {
      return NextResponse.json(
        {
          error:
            "Er is nog geen wedstrijdvoorbereiding (thema's) of observatie bij deze video. Vul eerst de wedstrijdvoorbereiding in of voeg een observatie toe.",
        },
        { status: 400 }
      );
    }

    const playerName = (id: string | null) =>
      id ? (players as Player[]).find((p) => p.id === id)?.name ?? "onbekende speler" : null;

    const noteLines = notes
      .map((n) => {
        const who = playerName(n.player_id);
        return `- [${formatTimestamp(n.timestamp_seconds)}]${who ? ` (${who})` : ""} ${n.note}`;
      })
      .join("\n");

    const matchContext = match
      ? `Wedstrijd: ${match.home_away === "home" ? "thuis" : "uit"} tegen ${match.opponent} op ${match.date}.`
      : "";

    const prompt = notes.length > 0
      ? `Je bent een assistent-coach voor een jeugdvoetbalteam (JO19). Hieronder staan de thema's/aandachtspunten uit de wedstrijdvoorbereiding, en observaties die de trainer tijdens het terugkijken van de wedstrijdbeelden heeft genoteerd (met tijdstip en, indien van toepassing, de betrokken speler).

${matchContext}

${prepThemes ? `Thema's uit de wedstrijdvoorbereiding:\n${prepThemes}\n` : ""}
Observaties tijdens het terugkijken:
${noteLines}

Geef een kort, praktisch coachadvies in het Nederlands, gestructureerd per thema uit de voorbereiding (aanvallen, verdedigen, omschakelen, spelhervattingen) waar relevant:
1. Per thema: is het volgens de observaties gelukt zoals afgesproken, of niet? Onderbouw met de observaties.
2. Belangrijkste sterke en verbeterpunten (team en/of individuele spelers).
3. Twee tot drie concrete oefeningen of aandachtspunten voor de volgende training.

Wees bondig en concreet. Verzin geen observaties die niet in de lijst staan.`
      : `Je bent een assistent-coach voor een jeugdvoetbalteam (JO19). Je hebt geen toegang tot de wedstrijdbeelden zelf, alleen tot de thema's/aandachtspunten die de trainer vooraf in de wedstrijdvoorbereiding heeft vastgelegd.

${matchContext}

Thema's uit de wedstrijdvoorbereiding:
${prepThemes}

Er zijn nog geen observaties genoteerd tijdens het terugkijken van de beelden. Geef in het Nederlands een korte kijkwijzer voor de trainer om de beelden mee terug te kijken, gestructureerd per thema uit de voorbereiding (aanvallen, verdedigen, omschakelen, spelhervattingen waar relevant):
1. Per thema: concrete, herkenbare momenten/signalen om op te letten in de beelden om te zien of het is gelukt zoals afgesproken.
2. Twee tot drie concrete oefeningen of aandachtspunten die logisch zouden aansluiten als deze thema's aandacht nodig blijken.

Wees bondig en concreet. Verzin geen wedstrijdgebeurtenissen — je hebt de beelden niet gezien, dus formuleer dit als kijkpunten, niet als vaststaande conclusies over het verloop van de wedstrijd.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Claude API-fout (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const advice = data.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";

    const now = new Date().toISOString();
    const updated = await store.update("video_links", video_link_id, {
      ai_advice: advice,
      ai_advice_generated_at: now,
    });

    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
