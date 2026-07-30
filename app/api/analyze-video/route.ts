import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { resolveRole } from "@/lib/auth/access";
import { canEdit } from "@/lib/auth/roles";
import { lineForPosition } from "@/lib/positions";
import { Match, MatchPreparation, MatchStat, Player, SET_PIECE_CATEGORY_LABELS, SET_PIECE_SIDE_LABELS, SetPiece, TacticalMoment, VideoLink, VideoNote } from "@/lib/types";

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

const LINE_ORDER = ["verdediging", "middenveld", "aanval"] as const;

function buildPrepThemes(prep: MatchPreparation | undefined, setPieces: SetPiece[]): string {
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

  const chosenSetPieces = setPieces.filter((sp) => prep.set_piece_ids?.includes(sp.id));
  for (const sp of chosenSetPieces) {
    lines.push(
      `Spelhervatting — ${SET_PIECE_CATEGORY_LABELS[sp.category]} (${SET_PIECE_SIDE_LABELS[sp.side]}): ${sp.title}${sp.description.trim() ? ` — ${sp.description.trim()}` : ""}`
    );
  }

  return lines.join("\n");
}

function playerLine(player: Player): string {
  for (const code of player.positions) {
    const line = lineForPosition(code);
    if (line) return line;
  }
  return "overig";
}

function buildMatchStatsSection(matchStats: MatchStat[], players: Player[]): string {
  const played = matchStats.filter((s) => s.minutes_played > 0);
  if (played.length === 0) return "";

  const byLine = new Map<string, string[]>();
  for (const s of played) {
    const player = players.find((p) => p.id === s.player_id);
    if (!player) continue;
    const line = playerLine(player);
    const parts = [`${s.minutes_played}'`, `${s.goals}g`, `${s.assists}a`];
    if (s.rating) parts.push(`beoordeling ${s.rating}/10`);
    const entry = `${player.name}: ${parts.join(", ")}`;
    byLine.set(line, [...(byLine.get(line) ?? []), entry]);
  }

  const sections: string[] = [];
  for (const line of [...LINE_ORDER, "overig"]) {
    const entries = byLine.get(line);
    if (!entries || entries.length === 0) continue;
    sections.push(`${LINE_LABELS[line] ?? "Overig"}:\n${entries.map((e) => `- ${e}`).join("\n")}`);
  }
  return sections.join("\n\n");
}

function buildTeamStatsLine(match: Match): string {
  const parts: string[] = [];
  if (match.score_for !== null && match.score_against !== null) parts.push(`Eindstand: ${match.score_for}-${match.score_against}`);
  if (match.possession_pct !== null) parts.push(`Balbezit: ${match.possession_pct}%`);
  if (match.shots_for !== null || match.shots_against !== null) {
    parts.push(`Schoten: ${match.shots_for ?? "?"} voor — ${match.shots_against ?? "?"} tegen`);
  }
  if (match.shots_on_target_for !== null || match.shots_on_target_against !== null) {
    parts.push(`Schoten op doel: ${match.shots_on_target_for ?? "?"} voor — ${match.shots_on_target_against ?? "?"} tegen`);
  }
  if (match.corners_for !== null || match.corners_against !== null) {
    parts.push(`Corners: ${match.corners_for ?? "?"} voor — ${match.corners_against ?? "?"} tegen`);
  }
  if (match.fouls_for !== null || match.fouls_against !== null) {
    parts.push(`Overtredingen: ${match.fouls_for ?? "?"} voor — ${match.fouls_against ?? "?"} tegen`);
  }
  return parts.join("\n");
}

export async function POST(req: NextRequest) {
  const role = await resolveRole();
  if (!canEdit(role)) {
    return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  }

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
    const [videoLinks, videoNotes, matches, players, preparations, setPieces, matchStats] = await Promise.all([
      store.list("video_links"),
      store.list("video_notes"),
      store.list("matches"),
      store.list("players"),
      store.list("match_preparations"),
      store.list("set_pieces"),
      store.list("match_stats"),
    ]);

    const videoLink = (videoLinks as VideoLink[]).find((v) => v.id === video_link_id);
    if (!videoLink) return NextResponse.json({ error: "Video niet gevonden" }, { status: 404 });

    const notes = (videoNotes as VideoNote[])
      .filter((n) => n.video_link_id === video_link_id)
      .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);

    const match = (matches as Match[]).find((m) => m.id === videoLink.match_id);
    const prep = (preparations as MatchPreparation[]).find((p) => p.match_id === videoLink.match_id);
    const prepThemes = buildPrepThemes(prep, setPieces as SetPiece[]);

    const matchStatsForMatch = (matchStats as MatchStat[]).filter((s) => s.match_id === videoLink.match_id);
    const statsSection = buildMatchStatsSection(matchStatsForMatch, players as Player[]);
    const teamStatsLine = match ? buildTeamStatsLine(match) : "";

    if (notes.length === 0 && !prepThemes && !statsSection && !teamStatsLine) {
      return NextResponse.json(
        {
          error:
            "Er is nog geen wedstrijdvoorbereiding, statistiek of observatie bij deze video. Vul eerst de wedstrijdvoorbereiding of statistieken in, of voeg een observatie toe.",
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

    const dataSections = [
      matchContext,
      teamStatsLine ? `Teamstatistieken:\n${teamStatsLine}` : "",
      prepThemes ? `Thema's uit de wedstrijdvoorbereiding:\n${prepThemes}` : "",
      statsSection ? `Spelersstatistieken (per linie):\n${statsSection}` : "",
      notes.length > 0 ? `Observaties tijdens het terugkijken van de beelden:\n${noteLines}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const instructions =
      notes.length > 0
        ? `Geef een kort, praktisch coachadvies in het Nederlands. Baseer je zoveel mogelijk op de observaties en statistieken hierboven — verzin geen observaties of cijfers die niet gegeven zijn. Structureer als volgt:
1. Per thema uit de voorbereiding (aanvallen, verdedigen, omschakelen, spelhervattingen waar relevant): is het volgens de observaties gelukt zoals afgesproken, of niet?
2. Team als geheel: belangrijkste sterke en zwakke punten, onderbouwd met de teamstatistieken waar beschikbaar (balbezit, schoten, schoten op doel, corners, overtredingen).
3. Per linie (verdediging, middenveld, aanval): sterke en zwakke punten van die linie, gebaseerd op de spelersstatistieken en observaties van de spelers in die linie.
4. Per speler die heeft gespeeld: korte, concrete sterke en zwakke punten (gebruik goals/assists/beoordeling/observaties — sla spelers zonder relevante info over).
5. Twee tot drie concrete oefeningen of aandachtspunten voor de volgende training.

Wees bondig en concreet.`
        : `Je hebt geen toegang tot de wedstrijdbeelden zelf (nog geen observaties genoteerd), alleen tot de gegevens hierboven. Geef in het Nederlands een analyse en kijkwijzer, gestructureerd als volgt:
1. Per thema uit de voorbereiding (indien aanwezig): concrete, herkenbare signalen om op te letten in de beelden om te zien of het is gelukt zoals afgesproken.
2. Team als geheel: wat de statistieken (indien aanwezig) al laten zien over sterke en zwakke punten, plus waar in de beelden op te letten.
3. Per linie (verdediging, middenveld, aanval): wat de spelersstatistieken laten zien, plus kijkpunten voor die linie.
4. Per speler die heeft gespeeld: korte kijkpunten of, als de statistieken al iets laten zien (bv. veel goals/assists, lage/hoge beoordeling), een voorzichtige duiding.
5. Twee tot drie concrete oefeningen of aandachtspunten die logisch aansluiten.

Wees bondig en concreet. Verzin geen wedstrijdgebeurtenissen die niet uit de gegeven data blijken — formuleer onderdelen zonder observaties als kijkpunten, niet als vaststaande conclusies.`;

    const prompt = `Je bent een assistent-coach voor een jeugdvoetbalteam (JO19). Hieronder staan de beschikbare gegevens over deze wedstrijd.

${dataSections}

${instructions}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1536,
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
