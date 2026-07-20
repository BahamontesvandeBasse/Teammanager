"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { isoWeek, todayIso } from "@/lib/format";
import { Badge, Button, Card, Message, PageTitle, inputCls, tdCls, thCls } from "@/components/ui";
import { Absence, LoadEntry, Match, Message as ChatMessage, Player, ScheduleItem } from "@/lib/types";

type LoadDraft = {
  minutes: string;
  rpe: string;
  fatigue: string;
  soreness: string;
  injuryFlag: boolean;
  notes: string;
  absent: boolean;
};

const EMPTY_DRAFT: LoadDraft = { minutes: "", rpe: "", fatigue: "", soreness: "", injuryFlag: false, notes: "", absent: false };

const STAFF_SENDER_NAME = "Staf";
const CHART_COLORS = [
  "#059669", "#dc2626", "#2563eb", "#d97706", "#7c3aed",
  "#db2777", "#0891b2", "#65a30d", "#ea580c", "#4f46e5",
  "#0d9488", "#c026d3", "#84cc16", "#e11d48", "#0284c7",
];
const AGENDA_WINDOW_DAYS_PAST = 14;
const AGENDA_WINDOW_DAYS_FUTURE = 30;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BelastingPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [entries, setEntries] = useState<LoadEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayIso());
  const [sessionType, setSessionType] = useState<"training" | "wedstrijd">("training");
  const [drafts, setDrafts] = useState<Record<string, LoadDraft>>({});
  const [agendaChoice, setAgendaChoice] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chatPlayer, setChatPlayer] = useState<string>("");
  const [chatBody, setChatBody] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  const reload = () =>
    Promise.all([
      api.list("players"),
      api.list("load_entries"),
      api.list("messages"),
      api.list("schedule_items"),
      api.list("matches"),
      api.list("absences"),
    ])
      .then(([p, e, m, si, ma, ab]) => {
        setPlayers([...p].sort((a, b) => a.name.localeCompare(b.name, "nl")));
        setEntries(e);
        setMessages(m);
        setScheduleItems(si);
        setMatches(ma);
        setAbsences(ab);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  const activePlayers = players.filter((p) => p.active);

  // Trainingen/toernooien + wedstrijden rond vandaag, als snelkeuze i.p.v. een kale datum.
  const agendaOptions = useMemo(() => {
    const from = addDaysIso(todayIso(), -AGENDA_WINDOW_DAYS_PAST);
    const until = addDaysIso(todayIso(), AGENDA_WINDOW_DAYS_FUTURE);
    const fromSchedule = scheduleItems
      .filter((s) => s.date >= from && s.date <= until)
      .map((s) => ({
        value: `sched:${s.id}`,
        date: s.date,
        label: `${s.date} — ${s.activity}`,
        sessionType: s.activity.toLowerCase().includes("training") ? ("training" as const) : ("wedstrijd" as const),
      }));
    const fromMatches = matches
      .filter((m) => m.date >= from && m.date <= until)
      .map((m) => ({
        value: `match:${m.id}`,
        date: m.date,
        label: `${m.date} — Wedstrijd ${m.opponent} (${m.home_away === "home" ? "thuis" : "uit"})`,
        sessionType: "wedstrijd" as const,
      }));
    return [...fromSchedule, ...fromMatches].sort((a, b) => a.date.localeCompare(b.date));
  }, [scheduleItems, matches]);

  // Zet de datum en vinkt alvast "afwezig" aan voor spelers met een lopende afwezigheidsperiode
  // (Planning-scherm) — blijft handmatig te overschrijven. Wordt aangeroepen bij het kiezen van
  // een datum, niet automatisch bij elke reload, zodat lopende invoer niet verloren gaat.
  function applyDate(newDate: string) {
    setDate(newDate);
    const d: Record<string, LoadDraft> = {};
    for (const p of activePlayers) {
      const absent = absences.some((a) => a.player_id === p.id && newDate >= a.from && newDate <= a.until);
      d[p.id] = { ...EMPTY_DRAFT, absent };
    }
    setDrafts(d);
  }

  function selectAgendaItem(value: string) {
    setAgendaChoice(value);
    const option = agendaOptions.find((o) => o.value === value);
    if (!option) return;
    applyDate(option.date);
    setSessionType(option.sessionType);
  }

  function setDraft(playerId: string, field: "minutes" | "rpe" | "fatigue" | "soreness" | "notes", value: string) {
    setDrafts((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] ?? EMPTY_DRAFT), [field]: value },
    }));
  }

  function toggleAbsent(playerId: string) {
    setDrafts((prev) => {
      const current = prev[playerId] ?? EMPTY_DRAFT;
      return { ...prev, [playerId]: { ...current, absent: !current.absent } };
    });
  }

  function toggleInjuryFlag(playerId: string) {
    setDrafts((prev) => {
      const current = prev[playerId] ?? EMPTY_DRAFT;
      return { ...prev, [playerId]: { ...current, injuryFlag: !current.injuryFlag } };
    });
  }

  function fillAll(minutes: string) {
    const d: Record<string, LoadDraft> = {};
    for (const p of activePlayers) {
      const current = drafts[p.id] ?? EMPTY_DRAFT;
      d[p.id] = { ...current, minutes: current.absent ? "" : minutes };
    }
    setDrafts(d);
  }

  async function save() {
    setBusy(true);
    try {
      const rows = activePlayers
        .map((p) => {
          const d = drafts[p.id];
          if (!d) return null;

          if (d.absent) {
            return {
              player_id: p.id,
              date,
              session_type: sessionType,
              absent: true,
              minutes: null,
              rpe: null,
              notes: null,
              fatigue: null,
              soreness: null,
              injury_flag: false,
              reported_by: "staff" as const,
            };
          }

          const minutes = parseInt(d.minutes, 10) || 0;
          const rpe = parseInt(d.rpe, 10) || 0;
          if (minutes <= 0 || rpe <= 0) return null;
          const fatigueRaw = parseInt(d.fatigue, 10);
          const sorenessRaw = parseInt(d.soreness, 10);
          return {
            player_id: p.id,
            date,
            session_type: sessionType,
            absent: false,
            minutes,
            rpe: Math.min(10, Math.max(1, rpe)),
            notes: d.notes.trim() || null,
            fatigue: fatigueRaw >= 1 && fatigueRaw <= 10 ? fatigueRaw : null,
            soreness: sorenessRaw >= 1 && sorenessRaw <= 10 ? sorenessRaw : null,
            injury_flag: d.injuryFlag,
            reported_by: "staff" as const,
          };
        })
        .filter(Boolean) as Omit<LoadEntry, "id">[];

      if (rows.length === 0) {
        setMsg("Vul voor minstens één speler minuten & RPE in, of markeer als afwezig.");
        setErr(true);
        return;
      }
      await api.create("load_entries", rows);
      setDrafts({});
      await reload();
      const absentCount = rows.filter((r) => r.absent).length;
      setMsg(
        `Belasting opgeslagen voor ${rows.length} spelers (${sessionType} op ${date})${
          absentCount ? `, waarvan ${absentCount} afwezig` : ""
        }.`
      );
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entry: LoadEntry) {
    await api.remove("load_entries", entry.id);
    await reload();
  }

  async function sendStaffMessage() {
    if (!chatPlayer || !chatBody.trim()) return;
    setChatBusy(true);
    try {
      await api.create("messages", {
        player_id: chatPlayer,
        sender: "staff",
        sender_name: STAFF_SENDER_NAME,
        body: chatBody.trim(),
        created_at: new Date().toISOString(),
      });
      setChatBody("");
      await reload();
    } finally {
      setChatBusy(false);
    }
  }

  // Meest recente invoer per speler (voor het teamoverzicht bovenaan)
  const latestByPlayer = useMemo(() => {
    const map = new Map<string, LoadEntry>();
    for (const e of entries) {
      const current = map.get(e.player_id);
      if (!current || e.date > current.date) map.set(e.player_id, e);
    }
    return map;
  }, [entries]);

  // Rollend 7-daags venster t.o.v. vandaag, om acute stijgingen in belasting te signaleren.
  // Plus de laatste weken als trend (voor de sparkline) en een advies voor de komende training.
  const teamOverview = useMemo(() => {
    const today = todayIso();
    const daysAgo = (iso: string) =>
      Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86400000);

    return activePlayers
      .map((p) => {
        let thisWeek = 0;
        let prevWeek = 0;
        const byWeek = new Map<string, number>();
        for (const e of entries) {
          if (e.player_id !== p.id || e.absent) continue;
          const age = daysAgo(e.date);
          const load = (e.minutes ?? 0) * (e.rpe ?? 0);
          if (age >= 0 && age <= 6) thisWeek += load;
          else if (age >= 7 && age <= 13) prevWeek += load;
          const w = isoWeek(e.date);
          byWeek.set(w, (byWeek.get(w) ?? 0) + load);
        }
        const trend = [...byWeek.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6)
          .map(([, load]) => load);

        const change = prevWeek > 0 ? ((thisWeek - prevWeek) / prevWeek) * 100 : thisWeek > 0 ? 100 : 0;
        const latest = latestByPlayer.get(p.id);
        const lowRecovery = (latest?.fatigue && latest.fatigue <= 4) || (latest?.soreness && latest.soreness <= 4);

        let risk: "red" | "amber" | "green" | "slate" = "slate";
        let advice = "❔ Nog geen data";
        if (latest?.injury_flag) {
          risk = "red";
          advice = "🚑 Rustig aan — blessure gemeld";
        } else if (thisWeek === 0 && prevWeek === 0) {
          risk = "slate";
          advice = "❔ Nog geen data";
        } else if (lowRecovery) {
          risk = "red";
          advice = "😴 Lichtere training — laag herstel";
        } else if (change > 30) {
          risk = "red";
          advice = "⚠️ Rustiger programma — belasting steeg sterk";
        } else if (change > 15) {
          risk = "amber";
          advice = "🟡 Normaal, in de gaten houden";
        } else if (change < -20) {
          risk = "green";
          advice = "🟢 Ruimte om intensiteit op te bouwen";
        } else {
          risk = "green";
          advice = "✅ Normale intensiteit";
        }

        return { player: p, change, risk, advice, trend };
      })
      .sort((a, b) => {
        const order = { red: 0, amber: 1, green: 2, slate: 3 };
        if (order[a.risk] !== order[b.risk]) return order[a.risk] - order[b.risk];
        return b.change - a.change;
      });
  }, [activePlayers, entries, latestByPlayer]);

  function toggleSelectedPlayer(id: string) {
    setSelectedPlayerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAllPlayers() {
    setSelectedPlayerIds(players.map((p) => p.id));
  }

  function clearSelectedPlayers() {
    setSelectedPlayerIds([]);
  }

  // Weekbelasting (som van minuten × RPE per week) per geselecteerde speler, samengevoegd
  // tot één dataset (per week een kolom per speler) zodat de grafiek meerdere lijnen kan tonen.
  const chartData = useMemo(() => {
    if (selectedPlayerIds.length === 0) return [];
    const byPlayerWeek = new Map<string, Map<string, number>>();
    const weeks = new Set<string>();
    entries
      .filter((e) => selectedPlayerIds.includes(e.player_id) && !e.absent)
      .forEach((e) => {
        const w = isoWeek(e.date);
        weeks.add(w);
        const perWeek = byPlayerWeek.get(e.player_id) ?? new Map<string, number>();
        perWeek.set(w, (perWeek.get(w) ?? 0) + (e.minutes ?? 0) * (e.rpe ?? 0));
        byPlayerWeek.set(e.player_id, perWeek);
      });
    return [...weeks]
      .sort()
      .map((w) => {
        const row: Record<string, string | number> = { week: w.split("-")[1] };
        for (const id of selectedPlayerIds) {
          row[id] = byPlayerWeek.get(id)?.get(w) ?? 0;
        }
        return row;
      });
  }, [entries, selectedPlayerIds]);

  const playerEntries = entries
    .filter((e) => selectedPlayerIds.includes(e.player_id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  if (loading) return <p className="text-slate-500">Laden…</p>;

  return (
    <div>
      <PageTitle
        title="Fysieke belasting"
        subtitle="Per training/wedstrijd: minuten en RPE (ervaren inspanning, 1–10). Belasting = minuten × RPE."
      />

      {activePlayers.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-1 font-semibold">Team overzicht</h2>
          <p className="mb-3 text-xs text-slate-500">
            Trend in belasting per speler (laatste weken) en een advies voor de intensiteit van de komende training.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={thCls}>Speler</th>
                  <th className={thCls}>Trend</th>
                  <th className={thCls}>Advies komende training</th>
                </tr>
              </thead>
              <tbody>
                {teamOverview.map(({ player, risk, advice, trend }) => (
                  <tr key={player.id} className="border-b border-slate-100">
                    <td className={`${tdCls} font-medium`}>{player.name}</td>
                    <td className={tdCls}>
                      <Sparkline values={trend} color={risk} />
                    </td>
                    <td className={tdCls}>
                      <Badge color={risk}>{advice}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Sessie invoeren (staf)</h2>
          <Link href="/belasting/print" className="text-xs text-rose-600 hover:underline">
            🖨️ Print blanco formulier →
          </Link>
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">Kies uit planning (optioneel)</label>
          <select
            className={`${inputCls} w-full max-w-md`}
            value={agendaChoice}
            onChange={(e) => selectAgendaItem(e.target.value)}
          >
            <option value="">— Of vul datum/type hieronder handmatig in —</option>
            {agendaOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input type="date" className={inputCls} value={date} onChange={(e) => { setAgendaChoice(""); applyDate(e.target.value); }} />
          <select className={inputCls} value={sessionType} onChange={(e) => setSessionType(e.target.value as "training" | "wedstrijd")}>
            <option value="training">Training</option>
            <option value="wedstrijd">Wedstrijd</option>
          </select>
          <Button variant="secondary" onClick={() => fillAll("90")}>
            Vul alle minuten (90)
          </Button>
        </div>
        {activePlayers.some((p) => drafts[p.id]?.absent) && (
          <p className="mb-3 text-xs text-amber-600">
            Alvast afwezig aangevinkt op basis van bekende afwezigheidsperiodes — controleer en pas aan waar nodig.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={thCls}>Speler</th>
                <th className={thCls}>Afwezig</th>
                <th className={thCls}>Minuten</th>
                <th className={thCls}>RPE (1–10)</th>
                <th className={thCls}>Vermoeidheid (1–10)</th>
                <th className={thCls}>Spierpijn (1–10)</th>
                <th className={thCls}>Blessure</th>
              </tr>
            </thead>
            <tbody>
              {activePlayers.map((p) => {
                const d = drafts[p.id] ?? EMPTY_DRAFT;
                return (
                  <tr key={p.id} className={`border-b border-slate-100 ${d.absent ? "opacity-60" : ""}`}>
                    <td className={`${tdCls} font-medium`}>{p.name}</td>
                    <td className={tdCls}>
                      <input type="checkbox" checked={d.absent} onChange={() => toggleAbsent(p.id)} />
                    </td>
                    <td className={tdCls}>
                      <input type="number" min={0} max={180} className={`${inputCls} w-20`} value={d.minutes} placeholder="0"
                        disabled={d.absent} onChange={(e) => setDraft(p.id, "minutes", e.target.value)} />
                    </td>
                    <td className={tdCls}>
                      <input type="number" min={1} max={10} className={`${inputCls} w-20`} value={d.rpe} placeholder="—"
                        disabled={d.absent} onChange={(e) => setDraft(p.id, "rpe", e.target.value)} />
                    </td>
                    <td className={tdCls}>
                      <input type="number" min={1} max={10} className={`${inputCls} w-20`} value={d.fatigue} placeholder="—"
                        disabled={d.absent} onChange={(e) => setDraft(p.id, "fatigue", e.target.value)} />
                    </td>
                    <td className={tdCls}>
                      <input type="number" min={1} max={10} className={`${inputCls} w-20`} value={d.soreness} placeholder="—"
                        disabled={d.absent} onChange={(e) => setDraft(p.id, "soreness", e.target.value)} />
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1">
                        <input type="checkbox" checked={d.injuryFlag} disabled={d.absent} onChange={() => toggleInjuryFlag(p.id)} />
                        {d.injuryFlag && (
                          <input
                            type="text"
                            className={`${inputCls} w-32`}
                            placeholder="Toelichting"
                            value={d.notes}
                            onChange={(e) => setDraft(p.id, "notes", e.target.value)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Button onClick={save} disabled={busy}>{busy ? "Opslaan…" : "Opslaan"}</Button>
        </div>
        <Message text={msg} error={err} />
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Belastingtrend per speler</h2>
        <div className="mb-4">
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              onClick={selectAllPlayers}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Alle spelers
            </button>
            <button
              onClick={clearSelectedPlayers}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              disabled={selectedPlayerIds.length === 0}
            >
              Wissen
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {players.map((p, i) => {
              const active = selectedPlayerIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleSelectedPlayer(p.id)}
                  className="rounded-full border px-3 py-1 text-xs font-medium"
                  style={
                    active
                      ? { backgroundColor: CHART_COLORS[i % CHART_COLORS.length], borderColor: CHART_COLORS[i % CHART_COLORS.length], color: "white" }
                      : { backgroundColor: "white", borderColor: "#cbd5e1", color: "#334155" }
                  }
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {selectedPlayerIds.length > 0 && chartData.length === 0 && (
          <p className="text-sm text-slate-500">Nog geen belasting-invoer voor de gekozen speler(s).</p>
        )}

        {chartData.length > 0 && (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} label={{ value: "week", position: "insideBottomRight", offset: -4, fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip labelFormatter={(l) => `Week ${l}`} />
                  {selectedPlayerIds.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                  {selectedPlayerIds.map((id, i) => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      name={players.find((p) => p.id === id)?.name ?? id}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Weekbelasting = som van (minuten × RPE) per week. Let op grote sprongen (&gt;30% stijging week-op-week) — die verhogen blessurerisico.
            </p>
          </>
        )}

        {playerEntries.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold text-slate-600">Laatste registraties</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={thCls}>Speler</th>
                  <th className={thCls}>Datum</th>
                  <th className={thCls}>Type</th>
                  <th className={thCls}>Minuten</th>
                  <th className={thCls}>RPE</th>
                  <th className={thCls}>Belasting</th>
                  <th className={thCls}>Vermoeidheid</th>
                  <th className={thCls}>Spierpijn</th>
                  <th className={thCls}>Blessure</th>
                  <th className={thCls}></th>
                </tr>
              </thead>
              <tbody>
                {playerEntries.map((e) => (
                  <tr key={e.id} className={`border-b border-slate-100 ${e.absent ? "opacity-60" : ""}`}>
                    <td className={`${tdCls} font-medium`}>{players.find((p) => p.id === e.player_id)?.name ?? "—"}</td>
                    <td className={tdCls}>{e.date}</td>
                    <td className={tdCls}>{e.session_type}</td>
                    {e.absent ? (
                      <td className={tdCls} colSpan={5}>
                        <Badge color="slate">🚫 Afwezig</Badge>
                      </td>
                    ) : (
                      <>
                        <td className={tdCls}>{e.minutes}</td>
                        <td className={tdCls}>{e.rpe}</td>
                        <td className={`${tdCls} font-medium`}>{(e.minutes ?? 0) * (e.rpe ?? 0)}</td>
                        <td className={tdCls}>{e.fatigue ? <ScaleBadge value={e.fatigue} lowIsBad /> : "—"}</td>
                        <td className={tdCls}>{e.soreness ? <ScaleBadge value={e.soreness} lowIsBad /> : "—"}</td>
                        <td className={tdCls}>
                          {e.injury_flag ? (
                            <div>
                              <Badge color="red">⚠️</Badge>
                              {e.notes && <div className="mt-1 max-w-[200px] text-xs text-red-700">{e.notes}</div>}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </>
                    )}
                    <td className={tdCls}>
                      <button className="text-xs text-red-500 hover:underline" onClick={() => removeEntry(e)}>
                        verwijderen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-1 font-semibold">Berichten met spelers 💬</h2>
        <p className="mb-3 text-xs text-slate-500">
          Spelers kunnen via hun mobiele invulscherm berichten sturen; hier lees en beantwoord je ze per speler.
        </p>
        <select className={`${inputCls} mb-4 w-full max-w-md`} value={chatPlayer} onChange={(e) => setChatPlayer(e.target.value)}>
          <option value="">— Kies een speler —</option>
          {players.map((p) => {
            const count = messages.filter((m) => m.player_id === p.id).length;
            return (
              <option key={p.id} value={p.id}>
                {p.name}{count > 0 ? ` (${count})` : ""}
              </option>
            );
          })}
        </select>

        {chatPlayer && (
          <>
            <div className="mb-3 flex max-h-80 flex-col gap-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
              {messages.filter((m) => m.player_id === chatPlayer).length === 0 && (
                <p className="text-sm text-slate-400">Nog geen berichten met deze speler.</p>
              )}
              {messages
                .filter((m) => m.player_id === chatPlayer)
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "staff" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        m.sender === "staff" ? "bg-rose-600 text-white" : "bg-white border border-slate-200"
                      }`}
                    >
                      {m.sender === "player" && <div className="mb-0.5 text-xs font-semibold opacity-70">{m.sender_name}</div>}
                      {m.body}
                    </div>
                  </div>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                className={`${inputCls} flex-1`}
                placeholder="Typ een bericht…"
                value={chatBody}
                onChange={(e) => setChatBody(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendStaffMessage()}
              />
              <Button onClick={sendStaffMessage} disabled={chatBusy || !chatBody.trim()}>Stuur</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function ScaleBadge({ value, lowIsBad }: { value: number; lowIsBad?: boolean }) {
  const bad = lowIsBad ? value <= 4 : value >= 7;
  const ok = value >= 5 && value <= 6;
  return <Badge color={bad ? "red" : ok ? "amber" : "green"}>{value}/10</Badge>;
}

const SPARKLINE_STROKE: Record<"red" | "amber" | "green" | "slate", string> = {
  red: "#dc2626",
  amber: "#d97706",
  green: "#059669",
  slate: "#94a3b8",
};

// Simpele lijn van de laatste weken belasting per speler — geen assen/cijfers, alleen het verloop.
function Sparkline({ values, color }: { values: number[]; color: "red" | "amber" | "green" | "slate" }) {
  if (values.length === 0) return <span className="text-xs text-slate-400">–</span>;
  if (values.length === 1) {
    return (
      <svg width={80} height={24}>
        <circle cx={40} cy={12} r={3} fill={SPARKLINE_STROKE[color]} />
      </svg>
    );
  }

  const w = 80;
  const h = 24;
  const pad = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const lastX = pad + (values.length - 1) * stepX;
  const lastY = h - pad - ((values[values.length - 1] - min) / range) * (h - pad * 2);

  return (
    <svg width={w} height={h}>
      <polyline points={points} fill="none" stroke={SPARKLINE_STROKE[color]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={SPARKLINE_STROKE[color]} />
    </svg>
  );
}
