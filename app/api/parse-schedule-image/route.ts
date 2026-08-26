import { NextRequest, NextResponse } from "next/server";
import { matchFromTeams, ParsedMatch, parseDutchDate } from "@/lib/parse";

// Herkent een geüploade screenshot van een wedstrijdprogramma (bv. voetbal.nl)
// via Claude vision — het alternatief voor plakken/Excel wanneer de bron
// (zoals voetbal.nl) alleen ingelogd te bekijken is en dus niet server-side
// op te halen is.

type RawMatch = {
  date_text?: string;
  time?: string;
  home_team?: string;
  away_team?: string;
  competition?: string | null;
};

function normalizeTime(v: string | undefined): string | null {
  if (!v) return null;
  const m = /(\d{1,2})[:.](\d{2})/.exec(v);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ontbreekt. Zet deze in .env.local om screenshots te kunnen laten herkennen." },
      { status: 400 }
    );
  }

  const { imageDataUrl } = await req.json();
  if (typeof imageDataUrl !== "string") {
    return NextResponse.json({ error: "Geen afbeelding ontvangen." }, { status: 400 });
  }

  const match = /^data:([^;]+);base64,(.+)$/.exec(imageDataUrl);
  if (!match) {
    return NextResponse.json({ error: "Ongeldige afbeelding." }, { status: 400 });
  }
  const [, mediaType, base64Data] = match;

  const prompt = `Dit is een screenshot van een wedstrijdprogramma (bv. van voetbal.nl). Lees alle wedstrijden die zichtbaar zijn en geef ze terug als puur JSON — geen uitleg, geen markdown, alleen een JSON-array.

Elk element: { "date_text": string, "time": string, "home_team": string, "away_team": string, "competition": string of null }

- "date_text": de datum precies zoals afgebeeld (bv. "za 6 sep 2025" of "06-09-2025"), inclusief jaartal als dat zichtbaar is.
- "time": aftraptijd in HH:MM.
- "home_team" en "away_team": de volledige teamnamen precies zoals afgebeeld, in de volgorde thuisteam - uitteam. Verzin niets en laat geen wedstrijd weg die op de screenshot staat.
- "competition": naam van de competitie/poule/beker als die zichtbaar is, anders null.

Als er geen wedstrijden op de afbeelding te zien zijn, geef dan een lege array [] terug.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Claude API-fout (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const text: string = data.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";

    const jsonMatch = /\[[\s\S]*\]/.exec(text);
    if (!jsonMatch) {
      throw new Error("Kon geen wedstrijden herkennen in de afbeelding. Zorg dat het programma goed leesbaar in beeld staat.");
    }

    let raw: RawMatch[];
    try {
      raw = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error("Herkenning gaf geen geldige data terug — probeer een duidelijkere screenshot.");
    }

    const matches: ParsedMatch[] = raw
      .map((r) => {
        const date = r.date_text ? parseDutchDate(r.date_text) : null;
        const time = normalizeTime(r.time);
        if (!date || !time || !r.home_team || !r.away_team) return null;
        return matchFromTeams(date, time, r.home_team, r.away_team, r.competition?.trim() || null);
      })
      .filter((m): m is ParsedMatch => m !== null);

    if (matches.length === 0) {
      return NextResponse.json(
        { error: "Geen wedstrijden herkend op de screenshot. Zorg dat datum, tijd en teamnamen goed leesbaar zijn." },
        { status: 422 }
      );
    }

    return NextResponse.json({ matches });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
