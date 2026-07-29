"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ageFromBirthdate, formatDate, todayIso } from "@/lib/format";
import { playerAbsenceStatus } from "@/lib/absence";
import { isTrainingActivity } from "@/lib/training";
import { Badge, Button, Card, Message, PageTitle, inputCls, thCls, tdCls } from "@/components/ui";
import { AbsenceBanner } from "@/components/PlayerAbsence";
import { DrawingThumbnail, TacticsBoardEditor } from "@/components/TacticsBoard";
import {
  Absence,
  DrawingElement,
  LoadEntry,
  Match,
  MatchStat,
  Player,
  ScheduleItem,
  SET_PIECE_CATEGORIES,
  SET_PIECE_CATEGORY_LABELS,
  SET_PIECE_SIDE_LABELS,
  SetPiece,
  SetPieceCategory,
  SetPieceSide,
  VideoLink,
  VideoNote,
} from "@/lib/types";
import { useCanEdit, useOwnPlayerId, useRole } from "@/lib/auth/RoleProvider";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const canEdit = useCanEdit();
  const role = useRole();
  const ownPlayerId = useOwnPlayerId();
  const { id } = use(params);

  const [player, setPlayer] = useState<Player | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<MatchStat[]>([]);
  const [load, setLoad] = useState<LoadEntry[]>([]);
  const [videoLinks, setVideoLinks] = useState<VideoLink[]>([]);
  const [videoNotes, setVideoNotes] = useState<VideoNote[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [ownSetPieces, setOwnSetPieces] = useState<SetPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  // ---------- Zelfbediening voor de ingelogde speler zelf ----------
  const [spCategory, setSpCategory] = useState<SetPieceCategory>(SET_PIECE_CATEGORIES[0]);
  const [spSide, setSpSide] = useState<SetPieceSide>("attacking");
  const [spTitle, setSpTitle] = useState("");
  const [spDescription, setSpDescription] = useState("");
  const [spDrawing, setSpDrawing] = useState<DrawingElement[]>([]);
  const [spDrawingOpen, setSpDrawingOpen] = useState(false);
  const [spBusy, setSpBusy] = useState(false);
  const [spMsg, setSpMsg] = useState<string | null>(null);

  const reload = () =>
    Promise.all([
      api.list("players"),
      api.list("matches"),
      api.list("match_stats"),
      api.list("load_entries"),
      api.list("video_links"),
      api.list("video_notes"),
      api.list("absences"),
      api.list("schedule_items"),
      api.list("set_pieces"),
    ])
      .then(([players, m, s, l, vl, vn, a, si, setPieces]) => {
        const found = players.find((p) => p.id === id) ?? null;
        if (!found) {
          setNotFound(true);
          return;
        }
        setPlayer(found);
        setMatches(m);
        setStats(s.filter((x) => x.player_id === id));
        setLoad(l.filter((x) => x.player_id === id).sort((a, b) => b.date.localeCompare(a.date)));
        setVideoLinks(vl);
        setVideoNotes(vn.filter((x) => x.player_id === id));
        setAbsences(a);
        setScheduleItems(si);
        setOwnSetPieces(
          setPieces
            .filter((x) => x.suggested_by_player_id === id)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
        );
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function updateContact(value: string) {
    await api.update("players", id, { parent_contact: value || null });
    await reload();
  }

  async function updateBirthdate(value: string) {
    await api.update("players", id, { birthdate: value || null });
    await reload();
  }

  async function submitSetPiece() {
    if (!spTitle.trim()) {
      setSpMsg("Vul een titel in.");
      return;
    }
    setSpBusy(true);
    try {
      const res = await fetch("/api/set-pieces/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: spCategory,
          side: spSide,
          title: spTitle.trim(),
          description: spDescription.trim(),
          drawing: spDrawing,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Versturen mislukt");
      }
      setSpMsg("Bedankt! De staf bekijkt je voorstel.");
      setSpTitle("");
      setSpDescription("");
      setSpDrawing([]);
      setSpDrawingOpen(false);
      await reload();
    } catch (e) {
      setSpMsg((e as Error).message);
    } finally {
      setSpBusy(false);
    }
  }

  async function generateSummary() {
    setGenerating(true);
    try {
      const res = await fetch("/api/player-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Genereren mislukt");
      await reload();
      setMsg("AI-samenvatting gegenereerd.");
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;
  if (notFound || !player) {
    return (
      <div>
        <PageTitle title="Speler niet gevonden" />
        <Link href="/spelers" className="text-sm text-rose-600 hover:underline">← Terug naar Spelers</Link>
      </div>
    );
  }
  // Spelers mogen alleen hun eigen profiel bekijken, niet dat van teamgenoten.
  if (role === "speler" && ownPlayerId !== id) {
    return (
      <div>
        <PageTitle title="Geen toegang" subtitle="Je kunt alleen je eigen spelersprofiel bekijken." />
        <Link href="/spelers" className="text-sm text-rose-600 hover:underline">← Terug naar Spelers</Link>
      </div>
    );
  }

  const isOwnPlayer = role === "speler" && ownPlayerId === id;

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const totals = stats.reduce(
    (t, s) => ({
      goals: t.goals + s.goals,
      assists: t.assists + s.assists,
      minutes: t.minutes + s.minutes_played,
      games: t.games + (s.minutes_played > 0 ? 1 : 0),
      ratingSum: t.ratingSum + (s.rating ?? 0),
      ratingCount: t.ratingCount + (s.rating ? 1 : 0),
    }),
    { goals: 0, assists: 0, minutes: 0, games: 0, ratingSum: 0, ratingCount: 0 }
  );
  const avgRating = totals.ratingCount > 0 ? totals.ratingSum / totals.ratingCount : null;
  const avgMinutesPerGoal = totals.goals > 0 ? totals.minutes / totals.goals : null;
  const avgMinutesPerAssist = totals.assists > 0 ? totals.minutes / totals.assists : null;

  // Speelminuten sinds de laatste wedstrijd met een goal of assist, chronologisch terugtellend.
  const statsByDate = [...stats]
    .map((s) => ({ ...s, date: matchById.get(s.match_id)?.date }))
    .filter((s): s is typeof s & { date: string } => !!s.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  let minutesSinceContribution = 0;
  let hasContribution = false;
  for (let i = statsByDate.length - 1; i >= 0; i--) {
    const s = statsByDate[i];
    if (s.goals > 0 || s.assists > 0) {
      hasContribution = true;
      break;
    }
    minutesSinceContribution += s.minutes_played;
  }
  if (!hasContribution) minutesSinceContribution = totals.minutes;

  const recentLoad = load.slice(0, 10);
  const injuryFlags = recentLoad.filter((l) => l.injury_flag);
  const videoLinkById = new Map(videoLinks.map((v) => [v.id, v]));

  const today = todayIso();

  // Alleen data meetellen op dagen die ook echt een geplande training waren — anders kan een
  // per ongeluk dubbel of los ingevoerde belasting-registratie de teller boven het totaal duwen.
  const trainingDates = new Set(
    scheduleItems.filter((i) => isTrainingActivity(i.activity) && i.date < today).map((i) => i.date)
  );
  const totalTrainings = trainingDates.size;
  const attendedTrainings = new Set(
    load.filter((l) => l.session_type === "training" && !l.absent && trainingDates.has(l.date)).map((l) => l.date)
  ).size;
  const attendancePct = totalTrainings > 0 ? Math.round((attendedTrainings / totalTrainings) * 100) : null;

  const hasData = stats.length > 0 || load.length > 0 || videoNotes.length > 0;

  return (
    <div>
      <Link href="/spelers" className="mb-2 inline-block text-sm text-rose-600 hover:underline">← Terug naar Spelers</Link>
      <PageTitle
        title={player.name}
        subtitle={[
          player.shirt_number ? `#${player.shirt_number}` : null,
          player.positions.length > 0 ? player.positions.join(" / ") : null,
          player.birthdate ? `${ageFromBirthdate(player.birthdate)} jaar` : null,
          player.active ? "Actief" : "Inactief",
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <AbsenceBanner status={playerAbsenceStatus(id, absences, todayIso())} />

      {isOwnPlayer && (
        <>
          <Card className="mb-6">
            <h2 className="mb-1 font-semibold">Spelhervattingen 🚩</h2>
            <p className="mb-3 text-xs text-slate-500">
              Heb je een idee voor een corner, vrije trap, aftrap, inworp of keeperbal? Stel &apos;m voor — de staf bekijkt en keurt goed.
            </p>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  className={inputCls}
                  value={spCategory}
                  onChange={(e) => setSpCategory(e.target.value as SetPieceCategory)}
                >
                  {SET_PIECE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{SET_PIECE_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
                <div className="flex gap-1">
                  {(["attacking", "defending"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpSide(s)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium ${
                        spSide === s ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600"
                      }`}
                    >
                      {SET_PIECE_SIDE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <input
                className={inputCls}
                placeholder="Titel, bv. 'Korte corner naar de rand'"
                value={spTitle}
                onChange={(e) => setSpTitle(e.target.value)}
              />
              <textarea
                className={`${inputCls} py-2`}
                rows={2}
                placeholder="Omschrijving (optioneel)"
                value={spDescription}
                onChange={(e) => setSpDescription(e.target.value)}
              />

              {spDrawingOpen ? (
                <div className="rounded-lg border border-slate-200 p-2">
                  <TacticsBoardEditor elements={spDrawing} onChange={setSpDrawing} />
                  <button onClick={() => setSpDrawingOpen(false)} className="mt-2 text-xs text-slate-500 hover:underline">
                    tekening inklappen
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSpDrawingOpen(true)}
                  className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500"
                >
                  {spDrawing.length > 0 ? "✏️ Tekening bewerken" : "🎨 Tekening toevoegen (optioneel)"}
                </button>
              )}

              <Button onClick={submitSetPiece} disabled={spBusy || !spTitle.trim()}>
                {spBusy ? "Bezig…" : "Voorstel versturen"}
              </Button>
              {spMsg && <div className="text-xs text-slate-600">{spMsg}</div>}
            </div>

            {ownSetPieces.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Jouw voorstellen</h3>
                <div className="flex flex-col gap-2">
                  {ownSetPieces.map((sp) => (
                    <div key={sp.id} className="flex items-center gap-2 text-xs text-slate-600">
                      {sp.drawing.length > 0 && (
                        <DrawingThumbnail strokes={sp.drawing} className="h-9 w-6 shrink-0 rounded border border-slate-200" />
                      )}
                      <span className="flex-1">{sp.title}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-medium ${sp.approved ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                        {sp.approved ? "goedgekeurd" : "voorgesteld"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Contact</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Contact</label>
            <input
              className={`${inputCls} w-64`}
              disabled={!canEdit}
              defaultValue={player.parent_contact ?? ""}
              placeholder="Telefoon of e-mail"
              onBlur={(e) => e.target.value !== (player.parent_contact ?? "") && updateContact(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Geboortedatum</label>
            <input
              type="date"
              disabled={!canEdit}
              className={inputCls}
              defaultValue={player.birthdate ?? ""}
              onBlur={(e) => e.target.value !== (player.birthdate ?? "") && updateBirthdate(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {canEdit && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">AI-samenvatting</h2>
            <Button onClick={generateSummary} disabled={generating || !hasData}>
              {generating ? "Bezig…" : player.ai_summary ? "Opnieuw genereren" : "Genereer samenvatting"}
            </Button>
          </div>
          {!hasData && (
            <p className="text-sm text-slate-500">
              Nog geen statistieken, belastingdata of video-observaties voor deze speler.
            </p>
          )}
          {player.ai_summary ? (
            <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm text-slate-800">
              {player.ai_summary}
              {player.ai_summary_generated_at && (
                <p className="mt-3 text-xs text-slate-500">
                  Gegenereerd op {new Date(player.ai_summary_generated_at).toLocaleString("nl-NL")}
                </p>
              )}
            </div>
          ) : (
            hasData && <p className="text-sm text-slate-500">Nog geen samenvatting gegenereerd.</p>
          )}
          <Message text={msg} error={err} />
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Statistieken</h2>
          <div className="mb-3 flex flex-wrap gap-4 text-sm">
            <span><span className="font-semibold">{totals.games}</span> wedstrijden</span>
            {canEdit && <span><span className="font-semibold">{totals.minutes}</span> minuten</span>}
            <span><span className="font-semibold">{totals.goals}</span> goals</span>
            <span><span className="font-semibold">{totals.assists}</span> assists</span>
            {canEdit && (
              <span><span className="font-semibold">{avgRating !== null ? avgRating.toFixed(1) : "—"}</span> beoordeling</span>
            )}
          </div>
          {canEdit && (
            <div className="mb-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-3">
              <span>
                Minuten sinds laatste goal/assist: <span className="font-semibold text-slate-800">{minutesSinceContribution}&apos;</span>
              </span>
              <span>
                Gem. minuten per goal: <span className="font-semibold text-slate-800">{avgMinutesPerGoal !== null ? `${Math.round(avgMinutesPerGoal)}'` : "—"}</span>
              </span>
              <span>
                Gem. minuten per assist: <span className="font-semibold text-slate-800">{avgMinutesPerAssist !== null ? `${Math.round(avgMinutesPerAssist)}'` : "—"}</span>
              </span>
            </div>
          )}
          {stats.length === 0 ? (
            <p className="text-sm text-slate-500">Nog geen wedstrijdstatistieken.</p>
          ) : (
            <div className="flex flex-col gap-1 text-sm">
              {stats.map((s) => {
                const m = matchById.get(s.match_id);
                return (
                  <div key={s.id} className="flex items-center justify-between border-b border-slate-100 py-1">
                    <span className="text-slate-600">
                      {m ? `${formatDate(m.date)} · ${m.home_away === "home" ? "thuis" : "uit"} tegen ${m.opponent}` : "onbekende wedstrijd"}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {canEdit
                        ? `${s.minutes_played}' · ${s.goals}g · ${s.assists}a${s.rating ? ` · ${s.rating}/10` : ""}`
                        : `${s.goals}g · ${s.assists}a`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Belasting (laatste {recentLoad.length})</h2>
          <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
            <span className="font-semibold">{attendedTrainings}</span> / <span className="font-semibold">{totalTrainings}</span> trainingen aanwezig
            {attendancePct !== null && <span className="text-slate-500"> ({attendancePct}%)</span>}
          </div>
          {injuryFlags.length > 0 && (
            <div className="mb-3">
              <Badge color="red">⚠ {injuryFlags.length}× blessure gemeld</Badge>
            </div>
          )}
          {recentLoad.length === 0 ? (
            <p className="text-sm text-slate-500">Nog geen belastingdata.</p>
          ) : (
            <div className="flex flex-col gap-1 text-sm">
              {recentLoad.map((l) => (
                <div key={l.id} className="border-b border-slate-100 py-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">{formatDate(l.date)} · {l.session_type}</span>
                    {l.injury_flag && <Badge color="red">blessure</Badge>}
                  </div>
                  {l.absent ? (
                    <div className="text-xs text-slate-500">Afwezig</div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      {l.minutes} min · RPE {l.rpe} · vermoeidheid {l.fatigue}/10 · spierpijn {l.soreness}/10
                      {l.notes && ` — "${l.notes}"`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Video-observaties</h2>
        {videoNotes.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen video-observaties voor deze speler.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={thCls}>Wedstrijd</th>
                  <th className={thCls}>Tijdstip</th>
                  <th className={thCls}>Observatie</th>
                </tr>
              </thead>
              <tbody>
                {videoNotes
                  .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
                  .map((n) => {
                    const link = videoLinkById.get(n.video_link_id);
                    const match = link ? matchById.get(link.match_id) : undefined;
                    return (
                      <tr key={n.id} className="border-b border-slate-100">
                        <td className={tdCls}>
                          {match ? `${formatDate(match.date)} tegen ${match.opponent}` : "—"}
                        </td>
                        <td className={`${tdCls} font-mono`}>{formatTimestamp(n.timestamp_seconds)}</td>
                        <td className={tdCls}>{n.note}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}
