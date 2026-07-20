import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { LoadEntry, Match, MatchStat, Player, VideoLink, VideoNote } from "@/lib/types";
import { formatDate } from "@/lib/format";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ontbreekt. Zet deze in .env.local om AI-samenvattingen te kunnen genereren." },
      { status: 400 }
    );
  }

  const { player_id } = await req.json();
  if (!player_id) return NextResponse.json({ error: "player_id ontbreekt" }, { status: 400 });

  try {
    const store = getStore();
    const [players, matches, matchStats, loadEntries, videoLinks, videoNotes] = await Promise.all([
      store.list("players"),
      store.list("matches"),
      store.list("match_stats"),
      store.list("load_entries"),
      store.list("video_links"),
      store.list("video_notes"),
    ]);

    const player = (players as Player[]).find((p) => p.id === player_id);
    if (!player) return NextResponse.json({ error: "Speler niet gevonden" }, { status: 404 });

    const matchById = new Map((matches as Match[]).map((m) => [m.id, m]));

    const stats = (matchStats as MatchStat[]).filter((s) => s.player_id === player_id);
    const statsTotal = stats.reduce(
      (t, s) => ({
        goals: t.goals + s.goals,
        assists: t.assists + s.assists,
        minutes: t.minutes + s.minutes_played,
        games: t.games + (s.minutes_played > 0 ? 1 : 0),
      }),
      { goals: 0, assists: 0, minutes: 0, games: 0 }
    );
    const statsLines = stats
      .map((s) => {
        const m = matchById.get(s.match_id);
        const label = m ? `${formatDate(m.date)} ${m.home_away === "home" ? "thuis" : "uit"} tegen ${m.opponent}` : s.match_id;
        return `- ${label}: ${s.minutes_played} min, ${s.goals} goals, ${s.assists} assists`;
      })
      .join("\n");

    const load = (loadEntries as LoadEntry[])
      .filter((l) => l.player_id === player_id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
    const loadLines = load
      .map((l) => {
        if (l.absent) return `- ${l.date} (${l.session_type}): afwezig`;
        const injury = l.injury_flag ? " ⚠ blessure gemeld" : "";
        return `- ${l.date} (${l.session_type}): ${l.minutes} min, RPE ${l.rpe}, vermoeidheid ${l.fatigue}/10, spierpijn ${l.soreness}/10${injury}${l.notes ? ` — "${l.notes}"` : ""}`;
      })
      .join("\n");
    const injuryFlags = load.filter((l) => l.injury_flag);

    const playerVideoNotes = (videoNotes as VideoNote[]).filter((n) => n.player_id === player_id);
    const videoLinkById = new Map((videoLinks as VideoLink[]).map((v) => [v.id, v]));
    const videoLines = playerVideoNotes
      .map((n) => {
        const link = videoLinkById.get(n.video_link_id);
        const match = link ? matchById.get(link.match_id) : undefined;
        const label = match ? `${formatDate(match.date)} tegen ${match.opponent}` : "onbekende wedstrijd";
        return `- [${label}, ${formatTimestamp(n.timestamp_seconds)}] ${n.note}`;
      })
      .join("\n");

    if (stats.length === 0 && load.length === 0 && playerVideoNotes.length === 0) {
      return NextResponse.json(
        { error: "Nog geen statistieken, belastingdata of video-observaties voor deze speler om een samenvatting van te maken." },
        { status: 400 }
      );
    }

    const prompt = `Je bent een assistent-coach voor een jeugdvoetbalteam (JO19). Stel een kort, praktisch spelersprofiel op in het Nederlands voor ${player.name}${player.positions.length > 0 ? ` (${player.positions.join("/")})` : ""}, uitsluitend op basis van onderstaande data. Verzin niets dat er niet in staat.

Statistieken (${statsTotal.games} wedstrijden, ${statsTotal.minutes} minuten, ${statsTotal.goals} goals, ${statsTotal.assists} assists):
${statsLines || "(geen wedstrijdstatistieken)"}

Belasting/training, laatste ${load.length} registraties${injuryFlags.length > 0 ? ` — LET OP: ${injuryFlags.length}x blessure gemeld` : ""}:
${loadLines || "(geen belastingdata)"}

Video-observaties uit wedstrijdanalyses:
${videoLines || "(geen video-observaties)"}

Geef een bondig profiel met:
1. Algemeen beeld (rol, inzet, ontwikkeling) in 2-3 zinnen.
2. Fysieke aandachtspunten (belasting/herstel/blessurerisico) — alleen als de data daar aanleiding toe geeft.
3. Twee tot drie concrete coach-aandachtspunten voor de komende periode, gebaseerd op de video-observaties en statistieken.`;

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
    const summary = data.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";

    const now = new Date().toISOString();
    const updated = await store.update("players", player_id, {
      ai_summary: summary,
      ai_summary_generated_at: now,
    });

    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
