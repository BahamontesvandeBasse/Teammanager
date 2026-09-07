"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate, formatDateShort, todayIso } from "@/lib/format";
import { layoutForFormation, resolveSlotPlayer } from "@/lib/formations";
import { Badge, Button, Card, Message, PageTitle, inputCls, tdCls, thCls } from "@/components/ui";
import {
  Absence,
  Line,
  Match,
  MATCH_TYPES,
  MATCH_TYPE_LABELS,
  MatchPreparation,
  MatchReflection,
  MatchStat,
  MatchType,
  Player,
  ScheduleItem,
  SET_PIECE_CATEGORY_LABELS,
  SET_PIECE_SIDE_LABELS,
  SetPiece,
  TacticalMoment,
  TacticalMomentNotes,
  VideoLink,
  VideoNote,
} from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

type StatDraft = Partial<{ goals: string; assists: string; minutes: string; rating: string }>;
type StatField = "goals" | "assists" | "minutes" | "rating";
type MatchTypeFilter = "alle" | MatchType;

function isPlayed(m: Match): boolean {
  return m.score_for !== null && m.score_against !== null;
}

const TACTICAL_MOMENTS: { key: TacticalMoment; label: string; icon: string }[] = [
  { key: "attacking", label: "Aanvallen", icon: "⚔️" },
  { key: "defending", label: "Verdedigen", icon: "🛡️" },
  { key: "transition_to_attack", label: "Omschakelen naar aanval", icon: "⏩" },
  { key: "transition_to_defense", label: "Omschakelen naar verdedigen", icon: "⏪" },
];

const LINES: { key: Line; label: string }[] = [
  { key: "verdediging", label: "Verdediging" },
  { key: "middenveld", label: "Middenveld" },
  { key: "aanval", label: "Aanval" },
];

function filledMoments(m: TacticalMomentNotes | undefined) {
  if (!m) return [];
  return TACTICAL_MOMENTS.filter((mo) => m[mo.key]?.trim());
}

function parseTimestamp(input: string): number | null {
  const s = input.trim();
  const m = /^(\d{1,3}):([0-5]?\d)$/.exec(s);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export default function ResultatenPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Laden…</p>}>
      <ResultatenPageInner />
    </Suspense>
  );
}

function ResultatenPageInner() {
  const canEdit = useCanEdit();
  const searchParams = useSearchParams();
  const preselectMatch = searchParams.get("match");

  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<MatchStat[]>([]);
  const [videoLinks, setVideoLinks] = useState<VideoLink[]>([]);
  const [videoNotes, setVideoNotes] = useState<VideoNote[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [reflections, setReflections] = useState<MatchReflection[]>([]);
  const [preparations, setPreparations] = useState<MatchPreparation[]>([]);
  const [setPieces, setSetPieces] = useState<SetPiece[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedMatch, setSelectedMatch] = useState<string>("");
  const [selectedVideo, setSelectedVideo] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, StatDraft>>({});
  const [matchTypeFilter, setMatchTypeFilter] = useState<MatchTypeFilter>("alle");

  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [noteTime, setNoteTime] = useState("");
  const [notePlayer, setNotePlayer] = useState("");
  const [noteText, setNoteText] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  const reload = () =>
    Promise.all([
      api.list("players"),
      api.list("matches"),
      api.list("match_stats"),
      api.list("video_links"),
      api.list("video_notes"),
      api.list("schedule_items"),
      api.list("absences"),
      api.list("match_reflections"),
      api.list("match_preparations"),
      api.list("set_pieces"),
    ])
      .then(([p, m, s, v, n, si, a, r, prep, sp]) => {
        setPlayers([...p].sort((a, b) => a.name.localeCompare(b.name, "nl")));
        setMatches([...m].sort((a, b) => `${b.date} ${b.kickoff_time}`.localeCompare(`${a.date} ${a.kickoff_time}`)));
        setStats(s);
        setVideoLinks(v);
        setVideoNotes(n);
        setScheduleItems(si);
        setAbsences(a);
        setReflections(r);
        setPreparations(prep);
        setSetPieces(sp);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (preselectMatch && matches.some((m) => m.id === preselectMatch) && selectedMatch !== preselectMatch) {
      setSelectedMatch(preselectMatch);
      setDrafts({});
      setSelectedVideo("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectMatch, matches]);

  const activePlayers = players.filter((p) => p.active);
  const playedMatches = matches
    .filter(isPlayed)
    .filter((m) => matchTypeFilter === "alle" || m.type === matchTypeFilter);
  const selected = matches.find((m) => m.id === selectedMatch) ?? null;

  function selectMatch(id: string) {
    setSelectedMatch(id);
    setDrafts({});
    setSelectedVideo("");
  }

  // ---------- Statistieken ----------

  function fieldValue(playerId: string, field: StatField): string {
    const draft = drafts[playerId]?.[field];
    if (draft !== undefined) return draft;
    const s = stats.find((x) => x.match_id === selectedMatch && x.player_id === playerId);
    if (!s) return "";
    if (field === "rating") return s.rating ? String(s.rating) : "";
    const stored = field === "minutes" ? s.minutes_played : s[field];
    return stored === 0 ? "" : String(stored);
  }

  function setDraft(playerId: string, field: StatField, value: string) {
    setDrafts((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }));
  }

  async function saveStats() {
    if (!selectedMatch) return;
    setBusy(true);
    try {
      // Vervang de stats van deze wedstrijd door de ingevulde waarden
      const existing = stats.filter((s) => s.match_id === selectedMatch);
      await Promise.all(existing.map((s) => api.remove("match_stats", s.id)));

      const rows = activePlayers
        .map((p) => {
          const goals = parseInt(fieldValue(p.id, "goals"), 10) || 0;
          const assists = parseInt(fieldValue(p.id, "assists"), 10) || 0;
          const minutes = parseInt(fieldValue(p.id, "minutes"), 10) || 0;
          const ratingRaw = parseInt(fieldValue(p.id, "rating"), 10);
          const rating = ratingRaw >= 1 && ratingRaw <= 10 ? ratingRaw : null;
          if (goals === 0 && assists === 0 && minutes === 0 && rating === null) return null;
          return { match_id: selectedMatch, player_id: p.id, goals, assists, minutes_played: minutes, rating };
        })
        .filter(Boolean) as Omit<MatchStat, "id">[];

      if (rows.length > 0) await api.create("match_stats", rows);
      setDrafts({});
      await reload();
      setMsg(`Statistieken opgeslagen voor ${rows.length} spelers.`);
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  const totals = useMemo(() => {
    const playedMatchIds = new Set(playedMatches.map((m) => m.id));
    const map = new Map<string, { goals: number; assists: number; minutes: number; games: number; ratingSum: number; ratingCount: number }>();
    for (const s of stats) {
      if (!playedMatchIds.has(s.match_id)) continue;
      const t = map.get(s.player_id) ?? { goals: 0, assists: 0, minutes: 0, games: 0, ratingSum: 0, ratingCount: 0 };
      t.goals += s.goals;
      t.assists += s.assists;
      t.minutes += s.minutes_played;
      if (s.minutes_played > 0) t.games += 1;
      if (s.rating) {
        t.ratingSum += s.rating;
        t.ratingCount += 1;
      }
      map.set(s.player_id, t);
    }
    return map;
  }, [stats, playedMatches]);

  const ranking = players
    .map((p) => ({ player: p, t: totals.get(p.id) }))
    .filter((r) => r.t)
    .sort((a, b) => (b.t!.goals - a.t!.goals) || (b.t!.assists - a.t!.assists));

  // ---------- Trainingsaanwezigheid (alleen zichtbaar voor staf) ----------

  const trainingAttendance = useMemo(() => {
    const today = todayIso();
    const pastTrainings = scheduleItems.filter(
      (i) => i.activity.toLowerCase().includes("training") && i.date <= today
    );
    return activePlayers
      .map((p) => {
        const total = pastTrainings.length;
        const missed = pastTrainings.filter((t) =>
          absences.some((a) => a.player_id === p.id && t.date >= a.from && t.date <= a.until)
        ).length;
        const attended = total - missed;
        return { player: p, total, attended, pct: total > 0 ? (attended / total) * 100 : null };
      })
      .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100));
  }, [scheduleItems, absences, activePlayers]);

  const record = useMemo(() => {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let gf = 0;
    let ga = 0;
    for (const m of playedMatches) {
      const f = m.score_for ?? 0;
      const a = m.score_against ?? 0;
      gf += f;
      ga += a;
      if (f > a) wins++;
      else if (f === a) draws++;
      else losses++;
    }
    return { games: playedMatches.length, wins, draws, losses, gf, ga };
  }, [playedMatches]);

  // ---------- Analyses ----------

  // Zelfreflecties van spelers op de geselecteerde wedstrijd — alleen voor staf zichtbaar
  // (de API redigeert dit sowieso al tot "eigen rijen" voor niet-staf, maar de kaart zelf
  // is bovendien canEdit-gated zodat een toeschouwer/speler 'm hier niet eens te zien krijgt).
  const selectedReflections = reflections
    .filter((r) => r.match_id === selectedMatch)
    .map((r) => ({ reflection: r, player: players.find((p) => p.id === r.player_id) }))
    .filter((r): r is { reflection: MatchReflection; player: Player } => !!r.player)
    .sort((a, b) => a.player.name.localeCompare(b.player.name, "nl"));

  // Wedstrijdvoorbereiding van de geselecteerde wedstrijd, zoals ingevuld op /wedstrijden.
  const selectedPrep = preparations.find((p) => p.match_id === selectedMatch) ?? null;
  const prepSlots = selectedPrep?.formation ? layoutForFormation(selectedPrep.formation) : [];
  const prepGuestNames: Record<string, string> = {};
  const prepSlotMap: Record<string, string> = {};
  (selectedPrep?.lineup ?? []).forEach((entry) => {
    if (entry.guest_name) {
      prepGuestNames[entry.slot] = entry.guest_name;
      prepSlotMap[entry.slot] = `guest:${entry.slot}`;
    } else if (entry.player_id) {
      prepSlotMap[entry.slot] = entry.player_id;
    }
  });
  const prepAbsentPlayerIds = new Set(
    selected
      ? absences.filter((a) => a.player_id && selected.date >= a.from && selected.date <= a.until).map((a) => a.player_id as string)
      : []
  );
  const prepSubstituteNames = [
    ...(selectedPrep?.substitutes ?? []).map((pid) => players.find((p) => p.id === pid)?.name).filter(Boolean),
    ...(selectedPrep?.guest_substitutes ?? []),
  ] as string[];
  const prepTeamMoments = filledMoments(selectedPrep?.tactical_notes?.team);
  const prepLineTactics = LINES.map((line) => ({
    line,
    moments: filledMoments(selectedPrep?.tactical_notes?.line?.[line.key]),
  })).filter((l) => l.moments.length > 0);
  const prepSetPieces = setPieces.filter((sp) => selectedPrep?.set_piece_ids?.includes(sp.id));
  const hasPrepContent =
    !!selectedPrep &&
    (prepSlots.length > 0 || prepTeamMoments.length > 0 || prepLineTactics.length > 0 || prepSetPieces.length > 0);

  const matchVideos = videoLinks.filter((v) => v.match_id === selectedMatch);
  const currentVideo = videoLinks.find((v) => v.id === selectedVideo) ?? null;
  const currentNotes = videoNotes
    .filter((n) => n.video_link_id === selectedVideo)
    .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);

  // ---------- Teamstatistieken (balbezit, schoten, corners, overtredingen) ----------

  type TeamStatField =
    | "possession_pct"
    | "shots_for"
    | "shots_against"
    | "shots_on_target_for"
    | "shots_on_target_against"
    | "corners_for"
    | "corners_against"
    | "fouls_for"
    | "fouls_against";

  async function updateTeamStat(field: TeamStatField, value: string) {
    if (!selected) return;
    const n = value === "" ? null : parseInt(value, 10);
    await api.update("matches", selected.id, { [field]: isNaN(n as number) ? null : n });
    await reload();
  }

  async function addVideo() {
    if (!selectedMatch || !newUrl.trim()) return;
    setBusy(true);
    try {
      await api.create("video_links", {
        match_id: selectedMatch,
        veo_url: newUrl.trim(),
        title: newTitle.trim() || null,
        ai_advice: null,
        ai_advice_generated_at: null,
      });
      setNewTitle("");
      setNewUrl("");
      await reload();
      setMsg("Video toegevoegd.");
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function removeVideo(id: string) {
    setBusy(true);
    try {
      await api.remove("video_links", id);
      if (selectedVideo === id) setSelectedVideo("");
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!selectedVideo || !noteText.trim()) return;
    const seconds = parseTimestamp(noteTime);
    if (seconds === null) {
      setMsg("Tijdstip moet in mm:ss (bv. 12:34) of als seconden.");
      setErr(true);
      return;
    }
    setBusy(true);
    try {
      await api.create("video_notes", {
        video_link_id: selectedVideo,
        timestamp_seconds: seconds,
        player_id: notePlayer || null,
        note: noteText.trim(),
      });
      setNoteTime("");
      setNotePlayer("");
      setNoteText("");
      await reload();
      setMsg("Observatie toegevoegd.");
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function removeNote(id: string) {
    setBusy(true);
    try {
      await api.remove("video_notes", id);
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function generateAdvice() {
    if (!selectedVideo) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/analyze-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_link_id: selectedVideo }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Genereren mislukt");
      await reload();
      setMsg("AI-advies gegenereerd.");
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  return (
    <div>
      <PageTitle
        title="Resultaten"
        subtitle="Statistieken en video-analyses per wedstrijd, plus het totaalbeeld over het seizoen."
      />

      <Message text={msg} error={err} />

      <div className="mb-4 mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Wedstrijdtype</span>
        <div className="flex gap-1">
          {(
            [["alle", "Alle wedstrijden"], ...MATCH_TYPES.map((t) => [t, MATCH_TYPE_LABELS[t]])] as [MatchTypeFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setMatchTypeFilter(value)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                matchTypeFilter === value ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Seizoensbeeld</h2>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatTile label="Gespeeld" value={record.games} />
          <StatTile label="Gewonnen" value={record.wins} />
          <StatTile label="Gelijk" value={record.draws} />
          <StatTile label="Verloren" value={record.losses} />
          <StatTile label="Doelsaldo" value={`${record.gf}-${record.ga}`} />
        </div>
        {ranking.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen statistieken ingevoerd.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={thCls}>#</th>
                  <th className={thCls}>Speler</th>
                  <th className={thCls}>Wedstrijden</th>
                  {canEdit && <th className={thCls}>Minuten</th>}
                  <th className={thCls}>Goals ⚽</th>
                  <th className={thCls}>Assists 🎯</th>
                  {canEdit && <th className={thCls}>Beoordeling</th>}
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.player.id} className="border-b border-slate-100">
                    <td className={tdCls}>{i + 1}</td>
                    <td className={`${tdCls} font-medium`}>{r.player.name}</td>
                    <td className={tdCls}>{r.t!.games}</td>
                    {canEdit && <td className={tdCls}>{r.t!.minutes}</td>}
                    <td className={`${tdCls} font-semibold`}>{r.t!.goals}</td>
                    <td className={tdCls}>{r.t!.assists}</td>
                    {canEdit && (
                      <td className={tdCls}>{r.t!.ratingCount > 0 ? (r.t!.ratingSum / r.t!.ratingCount).toFixed(1) : "—"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canEdit && (
        <Card className="mb-6">
          <h2 className="mb-1 font-semibold">Trainingsaanwezigheid</h2>
          <p className="mb-3 text-xs text-slate-500">
            Op basis van de seizoensplanning (activiteiten met &quot;training&quot;) en geregistreerde afwezigheid. Alleen voor jou zichtbaar.
          </p>
          {trainingAttendance.every((r) => r.total === 0) ? (
            <p className="text-sm text-slate-500">Nog geen trainingen geweest.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className={thCls}>Speler</th>
                    <th className={thCls}>Aanwezig</th>
                    <th className={thCls}>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {trainingAttendance.map((r) => (
                    <tr key={r.player.id} className="border-b border-slate-100">
                      <td className={`${tdCls} font-medium`}>{r.player.name}</td>
                      <td className={tdCls}>{r.attended} / {r.total}</td>
                      <td className={tdCls}>
                        {r.pct === null ? (
                          "—"
                        ) : (
                          <Badge color={r.pct >= 90 ? "green" : r.pct >= 70 ? "amber" : "red"}>
                            {r.pct.toFixed(0)}%
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Per wedstrijd</h2>
        {playedMatches.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen wedstrijden gespeeld.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {playedMatches.map((m) => (
              <button
                key={m.id}
                onClick={() => selectMatch(m.id)}
                className={`rounded-xl border p-3 text-left transition ${
                  selectedMatch === m.id
                    ? "border-rose-600 bg-rose-50 ring-1 ring-rose-600"
                    : "border-slate-200 bg-white hover:border-rose-400"
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{formatDateShort(m.date)}</span>
                  <Badge color={m.home_away === "home" ? "green" : "blue"}>
                    {m.home_away === "home" ? "Thuis" : "Uit"}
                  </Badge>
                </div>
                <div className="font-semibold">
                  {m.home_away === "away" ? `${m.opponent} — Steenwijkerwold` : `Steenwijkerwold — ${m.opponent}`}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge color="slate">
                    {m.home_away === "away" ? `${m.score_against}-${m.score_for}` : `${m.score_for}-${m.score_against}`}
                  </Badge>
                  {videoLinks.some((v) => v.match_id === m.id) && <Badge color="amber">🎥 video</Badge>}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected && (
        <>
          <Card className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">
                {selected.home_away === "away" ? `${selected.opponent} — Steenwijkerwold` : `Steenwijkerwold — ${selected.opponent}`}
              </h2>
              <Badge color="slate">
                {selected.home_away === "away"
                  ? `${selected.score_against}-${selected.score_for}`
                  : `${selected.score_for}-${selected.score_against}`}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{formatDate(selected.date)} · aftrap {selected.kickoff_time}</p>
          </Card>

          <Card className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Wedstrijdvoorbereiding</h2>
              <Link href={`/wedstrijden/print/${selected.id}`} target="_blank" className="text-xs text-rose-600 hover:underline">
                Volledige weergave →
              </Link>
            </div>
            {!hasPrepContent ? (
              <p className="text-sm text-slate-500">Er is geen wedstrijdvoorbereiding ingevuld voor deze wedstrijd.</p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  {prepSlots.length > 0 && (
                    <div className="mb-4">
                      {selectedPrep!.formation && (
                        <p className="mb-2 text-center text-sm font-bold text-slate-700">{selectedPrep!.formation}</p>
                      )}
                      <div
                        className="relative mx-auto w-full max-w-xs overflow-hidden rounded-xl border-2 border-white/80 shadow-inner"
                        style={{ aspectRatio: "2 / 3", background: "linear-gradient(180deg, #16a34a, #15803d)" }}
                      >
                        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/50" />
                        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
                        <div className="absolute left-1/2 top-0 h-[13%] w-[58%] -translate-x-1/2 border border-t-0 border-white/50" />
                        <div className="absolute left-1/2 bottom-0 h-[13%] w-[58%] -translate-x-1/2 border border-b-0 border-white/50" />

                        {prepSlots.map((slot) => {
                          const player = resolveSlotPlayer(prepSlotMap[slot.id], prepGuestNames, players);
                          const pid = prepSlotMap[slot.id];
                          const isAbsent = !!pid && !pid.startsWith("guest:") && prepAbsentPlayerIds.has(pid);
                          return (
                            <div
                              key={slot.id}
                              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
                            >
                              <span
                                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold text-white shadow ${
                                  isAbsent
                                    ? "border-red-400 bg-red-600"
                                    : player
                                      ? player.isGuest
                                        ? "border-white bg-purple-700"
                                        : "border-white bg-slate-900"
                                      : "border-dashed border-white/70"
                                }`}
                              >
                                {isAbsent ? "🚫" : player ? (player.isGuest ? "G" : (player.shirtNumber ?? "•")) : slot.label}
                              </span>
                              <span className="max-w-[64px] truncate rounded bg-black/50 px-1 text-[10px] leading-tight text-white">
                                {player?.name.split(" ")[0] ?? ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {prepSubstituteNames.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Wissels</p>
                      <p className="text-sm text-slate-700">{prepSubstituteNames.join(" · ")}</p>
                    </div>
                  )}
                </div>

                <div>
                  {prepTeamMoments.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Team-tactiek</p>
                      <div className="flex flex-col gap-1">
                        {prepTeamMoments.map((m) => (
                          <p key={m.key} className="text-sm text-slate-700">
                            <span className="font-medium">{m.icon} {m.label}:</span> {selectedPrep!.tactical_notes!.team[m.key]}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {prepLineTactics.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Tactiek per linie</p>
                      <div className="flex flex-col gap-2">
                        {prepLineTactics.map(({ line, moments }) => (
                          <div key={line.key}>
                            <p className="text-xs font-bold text-slate-600">{line.label}</p>
                            {moments.map((m) => (
                              <p key={m.key} className="text-sm text-slate-700">
                                <span className="font-medium">{m.icon} {m.label}:</span>{" "}
                                {selectedPrep!.tactical_notes!.line[line.key][m.key]}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {prepSetPieces.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Standaardsituaties</p>
                      <div className="flex flex-col gap-1">
                        {prepSetPieces.map((sp) => (
                          <p key={sp.id} className="text-sm text-slate-700">
                            <span className="font-medium">{sp.title}</span>{" "}
                            <span className="text-slate-500">
                              ({SET_PIECE_CATEGORY_LABELS[sp.category]} — {SET_PIECE_SIDE_LABELS[sp.side]})
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card className="mb-6">
            <h2 className="mb-3 font-semibold">Statistieken</h2>
            <fieldset disabled={!canEdit} className="disabled:opacity-70">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className={thCls}>Speler</th>
                    {canEdit && <th className={thCls}>Minuten</th>}
                    <th className={thCls}>Goals</th>
                    <th className={thCls}>Assists</th>
                    {canEdit && <th className={thCls}>Beoordeling (1-10)</th>}
                  </tr>
                </thead>
                <tbody>
                  {activePlayers.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className={`${tdCls} font-medium`}>{p.name}</td>
                      {canEdit && (
                        <td className={tdCls}>
                          <input
                            type="number"
                            min={0}
                            max={130}
                            className={`${inputCls} w-20`}
                            value={fieldValue(p.id, "minutes")}
                            placeholder="0"
                            onChange={(e) => setDraft(p.id, "minutes", e.target.value)}
                          />
                        </td>
                      )}
                      <td className={tdCls}>
                        <input
                          type="number"
                          min={0}
                          className={`${inputCls} w-20`}
                          value={fieldValue(p.id, "goals")}
                          placeholder="0"
                          onChange={(e) => setDraft(p.id, "goals", e.target.value)}
                        />
                      </td>
                      <td className={tdCls}>
                        <input
                          type="number"
                          min={0}
                          className={`${inputCls} w-20`}
                          value={fieldValue(p.id, "assists")}
                          placeholder="0"
                          onChange={(e) => setDraft(p.id, "assists", e.target.value)}
                        />
                      </td>
                      {canEdit && (
                        <td className={tdCls}>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className={`${inputCls} w-20`}
                            value={fieldValue(p.id, "rating")}
                            placeholder="—"
                            onChange={(e) => setDraft(p.id, "rating", e.target.value)}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Button onClick={saveStats} disabled={busy}>{busy ? "Opslaan…" : "Opslaan"}</Button>
            </div>
            </fieldset>
          </Card>

          {canEdit && (
            <Card className="mb-6">
              <h2 className="mb-1 font-semibold">Zelfreflecties spelers 📊</h2>
              <p className="mb-3 text-xs text-slate-500">
                Wat spelers zelf invullen op hun profiel na deze wedstrijd — alleen voor jou en de betreffende speler zichtbaar.
              </p>
              {selectedReflections.length === 0 ? (
                <p className="text-sm text-slate-500">Nog geen speler heeft deze wedstrijd geanalyseerd.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {selectedReflections.map(({ reflection, player }) => (
                    <div key={reflection.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-medium text-slate-800">{player.name}</span>
                        {reflection.self_rating && <Badge color="slate">{reflection.self_rating}/10</Badge>}
                      </div>
                      {reflection.positive && (
                        <p className="text-sm text-slate-700">
                          <span className="font-medium text-green-700">+ </span>
                          {reflection.positive}
                        </p>
                      )}
                      {reflection.negative && (
                        <p className="text-sm text-slate-700">
                          <span className="font-medium text-red-700">− </span>
                          {reflection.negative}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card className="mb-6">
            <h2 className="mb-3 font-semibold">Teamstatistieken</h2>
            <p className="mb-3 text-xs text-slate-500">
              Optioneel — helpt het AI-wedstrijdadvies onderbouwen. Voor = Sv Steenwijkerwold, tegen = tegenstander.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["possession_pct", "Balbezit (%)", selected.possession_pct],
                  ["shots_for", "Schoten voor", selected.shots_for],
                  ["shots_against", "Schoten tegen", selected.shots_against],
                  ["shots_on_target_for", "Schoten op doel voor", selected.shots_on_target_for],
                  ["shots_on_target_against", "Schoten op doel tegen", selected.shots_on_target_against],
                  ["corners_for", "Corners voor", selected.corners_for],
                  ["corners_against", "Corners tegen", selected.corners_against],
                  ["fouls_for", "Overtredingen voor", selected.fouls_for],
                  ["fouls_against", "Overtredingen tegen", selected.fouls_against],
                ] as [TeamStatField, string, number | null][]
              ).map(([field, label, value]) => (
                <div key={field}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
                  {canEdit ? (
                    <input
                      type="number"
                      min={0}
                      max={field === "possession_pct" ? 100 : undefined}
                      className={`${inputCls} w-full`}
                      defaultValue={value ?? ""}
                      placeholder="—"
                      onBlur={(e) => e.target.value !== String(value ?? "") && updateTeamStat(field, e.target.value)}
                    />
                  ) : (
                    <p className="px-3 py-2 text-sm font-medium text-slate-700">{value ?? "—"}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="mb-6">
            <h2 className="mb-3 font-semibold">Video&apos;s bij deze wedstrijd</h2>

            {matchVideos.length === 0 ? (
              <p className="mb-4 text-sm text-slate-500">Nog geen video gekoppeld.</p>
            ) : (
              <div className="mb-4 flex flex-col gap-2">
                {matchVideos.map((v) => (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      v.id === selectedVideo ? "border-rose-500 bg-rose-50" : "border-slate-200"
                    }`}
                  >
                    <button className="flex-1 text-left" onClick={() => setSelectedVideo(v.id)}>
                      <span className="font-medium">{v.title || "Zonder titel"}</span>{" "}
                      <span className="text-slate-500">— {v.veo_url}</span>
                      {v.ai_advice && <span className="ml-2 text-rose-700">✓ advies aanwezig</span>}
                    </button>
                    {canEdit && (
                      <Button variant="danger" onClick={() => removeVideo(v.id)}>Verwijderen</Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canEdit && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Titel (optioneel)</label>
                <input className={`${inputCls} w-48`} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Bv. 1e helft" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Link naar de beelden</label>
                <input className={`${inputCls} w-72`} value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://app.veo.co/..." />
              </div>
              <Button onClick={addVideo} disabled={busy || !newUrl.trim()}>Toevoegen</Button>
            </div>
            )}
          </Card>

          {currentVideo && (
            <Card className="mb-6">
              <h2 className="mb-3 font-semibold">Analyse — {currentVideo.title || currentVideo.veo_url}</h2>
              <p className="mb-3 text-xs text-slate-500">
                Kijk de wedstrijdbeelden terug en noteer per tijdstip wat je opvalt. Op basis daarvan genereert AI onderaan een coachadvies.
              </p>

              {currentNotes.length === 0 ? (
                <p className="mb-4 text-sm text-slate-500">Nog geen observaties. Voeg hieronder tijdstippen toe terwijl je terugkijkt.</p>
              ) : (
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className={thCls}>Tijdstip</th>
                        <th className={thCls}>Speler</th>
                        <th className={thCls}>Observatie</th>
                        <th className={thCls}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentNotes.map((n) => (
                        <tr key={n.id} className="border-b border-slate-100">
                          <td className={`${tdCls} font-mono`}>{formatTimestamp(n.timestamp_seconds)}</td>
                          <td className={tdCls}>{players.find((p) => p.id === n.player_id)?.name ?? "—"}</td>
                          <td className={tdCls}>{n.note}</td>
                          <td className={tdCls}>
                            {canEdit && (
                              <Button variant="danger" onClick={() => removeNote(n.id)}>×</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {canEdit && (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Tijdstip (mm:ss)</label>
                  <input className={`${inputCls} w-24`} value={noteTime} onChange={(e) => setNoteTime(e.target.value)} placeholder="12:34" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Speler (optioneel)</label>
                  <select className={`${inputCls} w-44`} value={notePlayer} onChange={(e) => setNotePlayer(e.target.value)}>
                    <option value="">—</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[16rem]">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Observatie</label>
                  <input
                    className={`${inputCls} w-full`}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Bv. verliest duel op eigen helft, te laat terug"
                  />
                </div>
                <Button onClick={addNote} disabled={busy || !noteText.trim()}>Toevoegen</Button>
              </div>
              )}

              {/* Het AI-advies verwerkt individuele minuten/beoordelingen — daarom
                  net als elders in de app alleen zichtbaar voor staf. */}
              {canEdit && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">AI-advies</h3>
                  <Button onClick={generateAdvice} disabled={generating}>
                    {generating ? "Bezig…" : currentVideo.ai_advice ? "Opnieuw genereren" : "Genereer AI-advies"}
                  </Button>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Gebaseerd op de thema&apos;s uit de wedstrijdvoorbereiding, je observaties, de spelersstatistieken en (indien ingevuld) de teamstatistieken.
                </p>
                {currentVideo.ai_advice ? (
                  <div className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm text-slate-800">
                    {currentVideo.ai_advice}
                    {currentVideo.ai_advice_generated_at && (
                      <p className="mt-3 text-xs text-slate-500">
                        Gegenereerd op {new Date(currentVideo.ai_advice_generated_at).toLocaleString("nl-NL")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Nog geen advies gegenereerd.</p>
                )}
              </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
