import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { Match, Player, VideoLink, VideoNote } from "@/lib/types";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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
    const [videoLinks, videoNotes, matches, players] = await Promise.all([
      store.list("video_links"),
      store.list("video_notes"),
      store.list("matches"),
      store.list("players"),
    ]);

    const videoLink = (videoLinks as VideoLink[]).find((v) => v.id === video_link_id);
    if (!videoLink) return NextResponse.json({ error: "Video niet gevonden" }, { status: 404 });

    const notes = (videoNotes as VideoNote[])
      .filter((n) => n.video_link_id === video_link_id)
      .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);

    if (notes.length === 0) {
      return NextResponse.json(
        { error: "Voeg eerst tijdstip-observaties toe bij deze video voordat je AI-advies genereert." },
        { status: 400 }
      );
    }

    const match = (matches as Match[]).find((m) => m.id === videoLink.match_id);
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

    const prompt = `Je bent een assistent-coach voor een jeugdvoetbalteam (JO19). Hieronder staan observaties die de trainer tijdens het terugkijken van de wedstrijdbeelden heeft genoteerd, met tijdstip en (indien van toepassing) de betrokken speler.

${matchContext}

Observaties:
${noteLines}

Geef op basis van uitsluitend deze observaties een kort, praktisch coachadvies in het Nederlands:
1. Belangrijkste sterke punten (team en/of individuele spelers).
2. Belangrijkste verbeterpunten (team en/of individuele spelers).
3. Twee tot drie concrete oefeningen of aandachtspunten voor de volgende training.

Wees bondig en concreet. Verzin geen observaties die niet in de lijst staan.`;

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
