"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate, formatDateShort } from "@/lib/format";
import { Badge, Button, Card, Message, PageTitle, inputCls, tdCls, thCls } from "@/components/ui";
import { Match, MatchStat, Player, VideoLink, VideoNote } from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

type StatDraft = Partial<{ goals: string; assists: string; minutes: string; rating: string }>;
type StatField = "goals" | "assists" | "minutes" | "rating";

function isPlayed(m: Match): boolean {
  return m.score_for !== null && m.score_against !== null;
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
  const [loading, setLoading] = useState(true);

  const [selectedMatch, setSelectedMatch] = useState<string>("");
  const [selectedVideo, setSelectedVideo] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, StatDraft>>({});

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
    ])
      .then(([p, m, s, v, n]) => {
        setPlayers([...p].sort((a, b) => a.name.localeCompare(b.name, "nl")));
        setMatches([...m].sort((a, b) => `${b.date} ${b.kickoff_time}`.localeCompare(`${a.date} ${a.kickoff_time}`)));
        setStats(s);
        setVideoLinks(v);
        setVideoNotes(n);
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
  const playedMatches = matches.filter(isPlayed);
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
    const map = new Map<string, { goals: number; assists: number; minutes: number; games: number; ratingSum: number; ratingCount: number }>();
    for (const s of stats) {
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
  }, [stats]);

  const ranking = players
    .map((p) => ({ player: p, t: totals.get(p.id) }))
    .filter((r) => r.t)
    .sort((a, b) => (b.t!.goals - a.t!.goals) || (b.t!.assists - a.t!.assists));

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

  const matchVideos = videoLinks.filter((v) => v.match_id === selectedMatch);
  const currentVideo = videoLinks.find((v) => v.id === selectedVideo) ?? null;
  const currentNotes = videoNotes
    .filter((n) => n.video_link_id === selectedVideo)
    .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);

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

      <Card className="mb-6 mt-4">
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
                  <th className={thCls}>Minuten</th>
                  <th className={thCls}>Goals ⚽</th>
                  <th className={thCls}>Assists 🎯</th>
                  <th className={thCls}>Gem. beoordeling</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.player.id} className="border-b border-slate-100">
                    <td className={tdCls}>{i + 1}</td>
                    <td className={`${tdCls} font-medium`}>{r.player.name}</td>
                    <td className={tdCls}>{r.t!.games}</td>
                    <td className={tdCls}>{r.t!.minutes}</td>
                    <td className={`${tdCls} font-semibold`}>{r.t!.goals}</td>
                    <td className={tdCls}>{r.t!.assists}</td>
                    <td className={tdCls}>{r.t!.ratingCount > 0 ? (r.t!.ratingSum / r.t!.ratingCount).toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
            <h2 className="mb-3 font-semibold">Statistieken</h2>
            <fieldset disabled={!canEdit} className="disabled:opacity-70">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className={thCls}>Speler</th>
                    <th className={thCls}>Minuten</th>
                    <th className={thCls}>Goals</th>
                    <th className={thCls}>Assists</th>
                    <th className={thCls}>Beoordeling (1-10)</th>
                  </tr>
                </thead>
                <tbody>
                  {activePlayers.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className={`${tdCls} font-medium`}>{p.name}</td>
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

              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">AI-advies</h3>
                  {canEdit && (
                    <Button onClick={generateAdvice} disabled={generating}>
                      {generating ? "Bezig…" : currentVideo.ai_advice ? "Opnieuw genereren" : "Genereer AI-advies"}
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {currentNotes.length === 0
                    ? "Gebaseerd op de thema's uit de wedstrijdvoorbereiding — voeg optioneel observaties toe voor een preciezer advies."
                    : "Gebaseerd op de thema's uit de wedstrijdvoorbereiding en je observaties."}
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
            </Card>
          )}
        </>
      )}
    </div>
  );
}
