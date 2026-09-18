"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDateShort, todayIso } from "@/lib/format";
import { attendanceStatusFor, MISSING_LOAD_WINDOW_DAYS } from "@/lib/attendance";
import { isTrainingActivity } from "@/lib/training";
import { Badge, Card, PageTitle, tdCls, thCls } from "@/components/ui";
import { Absence, LoadEntry, Match, MatchReflection, Player, ScheduleItem } from "@/lib/types";
import { useRole } from "@/lib/auth/RoleProvider";

function isPlayed(m: Match): boolean {
  return m.score_for !== null && m.score_against !== null;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type LoadCellStatus = "filled" | "missing" | "excused";
type ReflectionCellStatus = "filled" | "missing" | "excused";

function loadCellStatus(
  playerId: string,
  date: string,
  sessionType: "training" | "wedstrijd",
  loadEntries: LoadEntry[],
  absences: Absence[]
): LoadCellStatus {
  const { entry, periodAbsent } = attendanceStatusFor(playerId, date, sessionType, loadEntries, absences);
  if (entry) return "filled";
  return periodAbsent ? "excused" : "missing";
}

function reflectionCellStatus(
  playerId: string,
  match: Match,
  reflections: MatchReflection[],
  loadEntries: LoadEntry[],
  absences: Absence[]
): ReflectionCellStatus {
  const hasReflection = reflections.some((r) => r.match_id === match.id && r.player_id === playerId);
  if (hasReflection) return "filled";
  const { status } = attendanceStatusFor(playerId, match.date, "wedstrijd", loadEntries, absences);
  return status === "present" ? "missing" : "excused";
}

function Cell({ status }: { status: "filled" | "missing" | "excused" }) {
  if (status === "filled") {
    return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700" title="Ingevuld">✓</span>;
  }
  if (status === "missing") {
    return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600" title="Nog niet ingevuld">✗</span>;
  }
  return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400" title="Afwezig — geen invoer nodig">–</span>;
}

export default function InvoerOverzichtPage() {
  const role = useRole();
  const [players, setPlayers] = useState<Player[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadEntries, setLoadEntries] = useState<LoadEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [reflections, setReflections] = useState<MatchReflection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.list("players"),
      api.list("schedule_items"),
      api.list("matches"),
      api.list("load_entries"),
      api.list("absences"),
      api.list("match_reflections"),
    ])
      .then(([p, si, m, le, a, r]) => {
        setPlayers([...p].sort((a2, b2) => a2.name.localeCompare(b2.name, "nl")));
        setScheduleItems(si);
        setMatches(m);
        setLoadEntries(le);
        setAbsences(a);
        setReflections(r);
      })
      .finally(() => setLoading(false));
  }, []);

  if (role === "speler") {
    return (
      <div>
        <PageTitle title="Geen toegang" subtitle="Het invuloverzicht is niet beschikbaar voor spelers." />
        <Link href="/" className="text-sm text-rose-600 hover:underline">← Terug naar Dashboard</Link>
      </div>
    );
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  const activePlayers = players.filter((p) => p.active);
  const today = todayIso();
  const windowStart = addDaysIso(today, -MISSING_LOAD_WINDOW_DAYS);

  // Trainingen + wedstrijden in het venster, als kolommen — alleen sessies die al
  // geweest zijn, anders zou elke speler "nog niet ingevuld" krijgen voor iets dat
  // nog niet gespeeld/getraind is.
  const loadSessions = [
    ...[...new Set(
      scheduleItems
        .filter((i) => isTrainingActivity(i.activity) && i.date >= windowStart && i.date < today)
        .map((i) => i.date)
    )].map((date) => ({ date, sessionType: "training" as const, label: "Training" })),
    ...[...new Set(
      matches.filter((m) => m.date >= windowStart && m.date < today).map((m) => m.date)
    )].map((date) => ({ date, sessionType: "wedstrijd" as const, label: "Wedstrijd" })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.sessionType.localeCompare(b.sessionType));

  const loadRows = activePlayers
    .map((player) => {
      const cells = loadSessions.map((s) => loadCellStatus(player.id, s.date, s.sessionType, loadEntries, absences));
      const missing = cells.filter((c) => c === "missing").length;
      return { player, cells, missing };
    })
    .sort((a, b) => b.missing - a.missing || a.player.name.localeCompare(b.player.name, "nl"));

  const playedMatches = [...matches].filter(isPlayed).sort((a, b) => a.date.localeCompare(b.date));

  const reflectionRows = activePlayers
    .map((player) => {
      const cells = playedMatches.map((m) => reflectionCellStatus(player.id, m, reflections, loadEntries, absences));
      const missing = cells.filter((c) => c === "missing").length;
      return { player, cells, missing };
    })
    .sort((a, b) => b.missing - a.missing || a.player.name.localeCompare(b.player.name, "nl"));

  return (
    <div>
      <PageTitle
        title="Invuloverzicht"
        subtitle={`Wie heeft belasting en wedstrijdreviews wel/niet ingevuld — belasting toont de laatste ${MISSING_LOAD_WINDOW_DAYS} dagen, reviews alle gespeelde wedstrijden dit seizoen.`}
      />

      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Belasting (RPE/minuten)</h2>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Cell status="filled" /> ingevuld</span>
            <span className="inline-flex items-center gap-1"><Cell status="missing" /> ontbreekt</span>
            <span className="inline-flex items-center gap-1"><Cell status="excused" /> afwezig</span>
          </div>
        </div>
        {loadSessions.length === 0 ? (
          <p className="text-sm text-slate-500">Geen trainingen of wedstrijden in de laatste {MISSING_LOAD_WINDOW_DAYS} dagen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={`${thCls} sticky left-0 bg-white`}>Speler</th>
                  {loadSessions.map((s) => (
                    <th key={`${s.date}|${s.sessionType}`} className={`${thCls} whitespace-nowrap text-center`}>
                      <div>{formatDateShort(s.date)}</div>
                      <div className="text-[10px] font-normal normal-case text-slate-400">
                        {s.sessionType === "training" ? "🎯" : "⚽"}
                      </div>
                    </th>
                  ))}
                  <th className={`${thCls} text-center`}>Ontbreekt</th>
                </tr>
              </thead>
              <tbody>
                {loadRows.map((row) => (
                  <tr key={row.player.id} className="border-b border-slate-100">
                    <td className={`${tdCls} sticky left-0 bg-white font-medium`}>
                      <Link href={`/spelers/${row.player.id}`} className="hover:text-rose-600 hover:underline">
                        {row.player.name}
                      </Link>
                    </td>
                    {row.cells.map((status, i) => (
                      <td key={i} className={`${tdCls} text-center`}>
                        <Cell status={status} />
                      </td>
                    ))}
                    <td className={`${tdCls} text-center`}>
                      {row.missing === 0 ? (
                        <Badge color="green">0</Badge>
                      ) : (
                        <Badge color="red">{row.missing}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Wedstrijdreviews</h2>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Cell status="filled" /> ingevuld</span>
            <span className="inline-flex items-center gap-1"><Cell status="missing" /> ontbreekt</span>
            <span className="inline-flex items-center gap-1"><Cell status="excused" /> afwezig</span>
          </div>
        </div>
        {playedMatches.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen wedstrijden gespeeld.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={`${thCls} sticky left-0 bg-white`}>Speler</th>
                  {playedMatches.map((m) => (
                    <th key={m.id} className={`${thCls} whitespace-nowrap text-center`}>
                      <div>{formatDateShort(m.date)}</div>
                      <div className="max-w-[70px] truncate text-[10px] font-normal normal-case text-slate-400" title={m.opponent}>
                        {m.opponent}
                      </div>
                    </th>
                  ))}
                  <th className={`${thCls} text-center`}>Ontbreekt</th>
                </tr>
              </thead>
              <tbody>
                {reflectionRows.map((row) => (
                  <tr key={row.player.id} className="border-b border-slate-100">
                    <td className={`${tdCls} sticky left-0 bg-white font-medium`}>
                      <Link href={`/spelers/${row.player.id}`} className="hover:text-rose-600 hover:underline">
                        {row.player.name}
                      </Link>
                    </td>
                    {row.cells.map((status, i) => (
                      <td key={i} className={`${tdCls} text-center`}>
                        <Cell status={status} />
                      </td>
                    ))}
                    <td className={`${tdCls} text-center`}>
                      {row.missing === 0 ? (
                        <Badge color="green">0</Badge>
                      ) : (
                        <Badge color="red">{row.missing}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
