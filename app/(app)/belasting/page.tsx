"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { isoWeek, todayIso } from "@/lib/format";
import { playerAbsenceStatus } from "@/lib/absence";
import { Badge, Button, Card, Message, PageTitle, Sparkline, inputCls, tdCls, thCls } from "@/components/ui";
import { Absence, LoadEntry, Match, Player, ScheduleItem } from "@/lib/types";
import { useCanEdit, useRole } from "@/lib/auth/RoleProvider";

type LoadDraft = {
  minutes: string;
  rpe: string;
  fatigue: string;
  injuryFlag: boolean;
  notes: string;
  absent: boolean;
};

const EMPTY_DRAFT: LoadDraft = { minutes: "", rpe: "", fatigue: "", injuryFlag: false, notes: "", absent: false };

const CHART_COLORS = [
  "#059669", "#dc2626", "#2563eb", "#d97706", "#7c3aed",
  "#db2777", "#0891b2", "#65a30d", "#ea580c", "#4f46e5",
  "#0d9488", "#c026d3", "#84cc16", "#e11d48", "#0284c7",
];
const AGENDA_WINDOW_DAYS_PAST = 14;
const AGENDA_WINDOW_DAYS_FUTURE = 30;
// Losse key voor de team-gemiddelde-lijn in chartData, gegarandeerd geen player-id.
const TEAM_AVG_KEY = "__team_avg";

// Welk cijfer de trendgrafiek laat zien. "load"/"minutes" worden per week
// opgeteld (totaal die week); "rpe"/"fatigue" worden per week gemiddeld
// (een gemiddelde van meerdere sessies optellen zou geen zinnig cijfer geven).
type Metric = "load" | "rpe" | "minutes" | "fatigue";
const METRIC_OPTIONS: { value: Metric; label: string; agg: "sum" | "avg" }[] = [
  { value: "load", label: "Belasting (minuten × RPE)", agg: "sum" },
  { value: "rpe", label: "RPE (1-10)", agg: "avg" },
  { value: "minutes", label: "Minuten", agg: "sum" },
  { value: "fatigue", label: "Vermoeidheid (1-10)", agg: "avg" },
];
function metricValue(e: LoadEntry, metric: Metric): number | null {
  if (metric === "load") return (e.minutes ?? 0) * (e.rpe ?? 0);
  if (metric === "rpe") return e.rpe;
  if (metric === "minutes") return e.minutes;
  return e.fatigue;
}

const WEEK_WINDOW_OPTIONS: { value: string; label: string; weeks: number | null }[] = [
  { value: "3", label: "Laatste 3 weken", weeks: 3 },
  { value: "6", label: "Laatste 6 weken", weeks: 6 },
  { value: "10", label: "Laatste 10 weken", weeks: 10 },
  { value: "12", label: "Laatste 12 weken", weeks: 12 },
  { value: "all", label: "Hele seizoen", weeks: null },
];

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BelastingPage() {
  const canEdit = useCanEdit();
  const role = useRole();
  const [players, setPlayers] = useState<Player[]>([]);
  const [entries, setEntries] = useState<LoadEntry[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayIso());
  const [sessionType, setSessionType] = useState<"training" | "wedstrijd">("training");
  const [drafts, setDrafts] = useState<Record<string, LoadDraft>>({});
  const [agendaChoice, setAgendaChoice] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [metric, setMetric] = useState<Metric>("load");
  const [weekWindow, setWeekWindow] = useState("10");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRawEntries, setShowRawEntries] = useState(false);
  const [correctionSession, setCorrectionSession] = useState("");

  const reload = () =>
    Promise.all([
      api.list("players"),
      api.list("load_entries"),
      api.list("schedule_items"),
      api.list("matches"),
      api.list("absences"),
    ])
      .then(([p, e, si, ma, ab]) => {
        setPlayers([...p].sort((a, b) => a.name.localeCompare(b.name, "nl")));
        setEntries(e);
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

  // Bouwt de invoertabel voor een datum+type: waar al invoer bestaat wordt die
  // teruggezet (zo wordt "Sessie invoeren" ook meteen het scherm om een eerder
  // ingevulde sessie te corrigeren — zie save()), de rest krijgt alvast
  // "afwezig" aangevinkt op basis van een lopende afwezigheidsperiode
  // (Planning-scherm), blijft handmatig te overschrijven.
  function buildDrafts(newDate: string, newSessionType: "training" | "wedstrijd"): Record<string, LoadDraft> {
    const d: Record<string, LoadDraft> = {};
    for (const p of activePlayers) {
      const existing = entries.find((e) => e.player_id === p.id && e.date === newDate && e.session_type === newSessionType);
      if (existing) {
        d[p.id] = {
          minutes: existing.minutes != null ? String(existing.minutes) : "",
          rpe: existing.rpe != null ? String(existing.rpe) : "",
          fatigue: existing.fatigue != null ? String(existing.fatigue) : "",
          injuryFlag: existing.injury_flag,
          notes: existing.notes ?? "",
          absent: existing.absent,
        };
      } else {
        const absent = absences.some((a) => a.player_id === p.id && newDate >= a.from && newDate <= a.until);
        d[p.id] = { ...EMPTY_DRAFT, absent };
      }
    }
    return d;
  }

  function applyDate(newDate: string) {
    setDate(newDate);
    setDrafts(buildDrafts(newDate, sessionType));
  }

  function applySessionType(newSessionType: "training" | "wedstrijd") {
    setSessionType(newSessionType);
    setDrafts(buildDrafts(date, newSessionType));
  }

  function selectAgendaItem(value: string) {
    setAgendaChoice(value);
    const option = agendaOptions.find((o) => o.value === value);
    if (!option) return;
    setDate(option.date);
    setSessionType(option.sessionType);
    setDrafts(buildDrafts(option.date, option.sessionType));
  }

  // Sessie die nu in het invoerformulier staat heeft al opgeslagen invoer —
  // "Opslaan" werkt dan bijwerkend i.p.v. nieuwe rijen aan te maken (zie save()).
  const existingForCurrentSession = entries.filter((e) => e.date === date && e.session_type === sessionType);

  function setDraft(playerId: string, field: "minutes" | "rpe" | "fatigue" | "notes", value: string) {
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
      const toCreate: Omit<LoadEntry, "id">[] = [];
      const toUpdate: { id: string; patch: Partial<Omit<LoadEntry, "id" | "reported_by">> }[] = [];

      for (const p of activePlayers) {
        const d = drafts[p.id];
        if (!d) continue;
        const existing = entries.find((e) => e.player_id === p.id && e.date === date && e.session_type === sessionType);

        let base: Omit<LoadEntry, "id" | "player_id" | "reported_by">;
        if (d.absent) {
          base = { date, session_type: sessionType, absent: true, minutes: null, rpe: null, notes: null, fatigue: null, soreness: null, injury_flag: false };
        } else {
          const minutes = parseInt(d.minutes, 10) || 0;
          const rpe = parseInt(d.rpe, 10) || 0;
          if (minutes <= 0 || rpe <= 0) continue; // te leeg om (opnieuw) op te slaan; bestaande invoer blijft dan ongewijzigd
          const fatigueRaw = parseInt(d.fatigue, 10);
          // Vermoeidheid en spierpijn zijn samengevoegd tot één vermoeidheidscijfer
          // (1 = geen vermoeidheid, 10 = veel vermoeidheid) — soreness krijgt dezelfde
          // waarde mee zodat oudere/andere plekken die nog naar soreness kijken blijven werken.
          const fatigue = fatigueRaw >= 1 && fatigueRaw <= 10 ? fatigueRaw : null;
          base = { date, session_type: sessionType, absent: false, minutes, rpe: Math.min(10, Math.max(1, rpe)), notes: d.notes.trim() || null, fatigue, soreness: fatigue, injury_flag: d.injuryFlag };
        }

        if (existing) {
          // Alleen de ingevoerde velden bijwerken — reported_by (wie 'm oorspronkelijk
          // meldde, staf of speler zelf) blijft staan zoals het was.
          toUpdate.push({ id: existing.id, patch: base });
        } else {
          toCreate.push({ player_id: p.id, reported_by: "staff", ...base });
        }
      }

      if (toCreate.length === 0 && toUpdate.length === 0) {
        setMsg("Vul voor minstens één speler minuten & RPE in, of markeer als afwezig.");
        setErr(true);
        return;
      }
      if (toCreate.length > 0) await api.create("load_entries", toCreate);
      await Promise.all(toUpdate.map((u) => api.update("load_entries", u.id, u.patch)));
      await reload();
      const total = toCreate.length + toUpdate.length;
      const absentCount = [...toCreate, ...toUpdate.map((u) => u.patch)].filter((r) => r.absent).length;
      setMsg(
        `Belasting opgeslagen voor ${total} spelers (${sessionType} op ${date})${toUpdate.length > 0 ? ` — ${toUpdate.length} bijgewerkt` : ""}${
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
        // Seizoenstotalen: los van het rollende 7-daagse venster hierboven, telt
        // gewoon alles mee wat ooit is ingevoerd voor deze speler.
        let seasonSessions = 0;
        let seasonRpeSum = 0;
        let seasonLoad = 0;
        let seasonInjuries = 0;
        for (const e of entries) {
          if (e.player_id !== p.id) continue;
          if (e.injury_flag) seasonInjuries++;
          if (e.absent) continue;
          const age = daysAgo(e.date);
          const load = (e.minutes ?? 0) * (e.rpe ?? 0);
          if (age >= 0 && age <= 6) thisWeek += load;
          else if (age >= 7 && age <= 13) prevWeek += load;
          const w = isoWeek(e.date);
          byWeek.set(w, (byWeek.get(w) ?? 0) + load);
          seasonSessions++;
          seasonRpeSum += e.rpe ?? 0;
          seasonLoad += load;
        }
        const trend = [...byWeek.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6)
          .map(([, load]) => load);
        const seasonAvgRpe = seasonSessions > 0 ? seasonRpeSum / seasonSessions : null;

        const change = prevWeek > 0 ? ((thisWeek - prevWeek) / prevWeek) * 100 : thisWeek > 0 ? 100 : 0;
        const latest = latestByPlayer.get(p.id);
        // Schaal is net als RPE: 1 = heel licht, 10 = maximaal — dus hoge waarden zijn slecht herstel.
        const lowRecovery = !!latest?.fatigue && latest.fatigue >= 7;

        const absenceStatus = playerAbsenceStatus(p.id, absences, today);

        let risk: "red" | "amber" | "green" | "slate" = "slate";
        let advice = "❔ Nog geen data";
        if (absenceStatus?.kind === "current") {
          risk = "red";
          advice = `🚫 Niet inzetbaar${absenceStatus.absence.reason ? ` — ${absenceStatus.absence.reason}` : " — afwezig"}`;
        } else if (latest?.injury_flag) {
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

        return { player: p, change, risk, advice, trend, seasonSessions, seasonAvgRpe, seasonLoad, seasonInjuries };
      })
      .sort((a, b) => {
        const order = { red: 0, amber: 1, green: 2, slate: 3 };
        if (order[a.risk] !== order[b.risk]) return order[a.risk] - order[b.risk];
        return b.change - a.change;
      });
  }, [activePlayers, entries, latestByPlayer, absences]);

  function toggleSelectedPlayer(id: string) {
    setSelectedPlayerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAllPlayers() {
    setSelectedPlayerIds(players.map((p) => p.id));
  }

  function clearSelectedPlayers() {
    setSelectedPlayerIds([]);
  }

  // Gekozen cijfer (belasting/RPE/minuten/vermoeidheid) per week per geselecteerde
  // speler, samengevoegd tot één dataset (per week een kolom per speler) zodat de
  // grafiek meerdere lijnen kan tonen en spelers onderling vergeleken kunnen worden.
  // Plus een team-gemiddelde (over alle actieve spelers, los van de selectie) als
  // referentielijn — zonder dat is moeilijk te zien of iemands cijfer hoog/laag is
  // t.o.v. de rest van het team. Beperkt tot de gekozen periode (laatste N weken).
  const metricAgg = METRIC_OPTIONS.find((m) => m.value === metric)!.agg;
  const metricLabel = METRIC_OPTIONS.find((m) => m.value === metric)!.label;
  const chartData = useMemo(() => {
    if (selectedPlayerIds.length === 0) return [];
    const byPlayerWeek = new Map<string, Map<string, { sum: number; count: number }>>();
    const teamByWeek = new Map<string, { sum: number; count: number }>();
    const activeIds = new Set(activePlayers.map((p) => p.id));
    const weeks = new Set<string>();
    entries
      .filter((e) => !e.absent)
      .forEach((e) => {
        const value = metricValue(e, metric);
        if (value === null) return;
        const w = isoWeek(e.date);
        if (selectedPlayerIds.includes(e.player_id)) {
          weeks.add(w);
          const perWeek = byPlayerWeek.get(e.player_id) ?? new Map<string, { sum: number; count: number }>();
          const cell = perWeek.get(w) ?? { sum: 0, count: 0 };
          cell.sum += value;
          cell.count += 1;
          perWeek.set(w, cell);
          byPlayerWeek.set(e.player_id, perWeek);
        }
        if (activeIds.has(e.player_id)) {
          weeks.add(w);
          const cell = teamByWeek.get(w) ?? { sum: 0, count: 0 };
          cell.sum += value;
          cell.count += 1;
          teamByWeek.set(w, cell);
        }
      });

    const windowWeeks = WEEK_WINDOW_OPTIONS.find((o) => o.value === weekWindow)?.weeks ?? null;
    const sortedWeeks = [...weeks].sort();
    const limitedWeeks = windowWeeks === null ? sortedWeeks : sortedWeeks.slice(-windowWeeks);

    return limitedWeeks.map((w) => {
      const row: Record<string, string | number> = { week: w.split("-")[1] };
      for (const id of selectedPlayerIds) {
        const cell = byPlayerWeek.get(id)?.get(w);
        row[id] = cell ? Math.round((metricAgg === "sum" ? cell.sum : cell.sum / cell.count) * 10) / 10 : 0;
      }
      const teamCell = teamByWeek.get(w);
      row[TEAM_AVG_KEY] = teamCell ? Math.round((teamCell.sum / teamCell.count) * 10) / 10 : 0;
      return row;
    });
  }, [entries, selectedPlayerIds, activePlayers, metric, metricAgg, weekWindow]);

  // Alle sessies (datum + type) waar minstens één invoer voor bestaat, nieuwste eerst —
  // basis voor de sessiekiezer bij de ruwe invoer (corrigeren), los van de speler-selectie
  // die hierboven voor de trendgrafiek gebruikt wordt.
  const sessionOptions = useMemo(() => {
    const map = new Map<string, { date: string; session_type: "training" | "wedstrijd"; count: number }>();
    for (const e of entries) {
      const key = `${e.date}|${e.session_type}`;
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { date: e.date, session_type: e.session_type, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [entries]);

  const correctionEntries = entries
    .filter((e) => `${e.date}|${e.session_type}` === correctionSession)
    .sort((a, b) => (players.find((p) => p.id === a.player_id)?.name ?? "").localeCompare(players.find((p) => p.id === b.player_id)?.name ?? "", "nl"));

  if (loading) return <p className="text-slate-500">Laden…</p>;

  // Spelers zien hun eigen belasting op hun spelersprofiel — de belasting van
  // teamgenoten en het invoerscherm zijn niet voor hen bedoeld.
  if (role === "speler") {
    return (
      <div>
        <PageTitle title="Geen toegang" subtitle="Belasting is niet beschikbaar voor spelers — bekijk je eigen gegevens op je spelersprofiel." />
        <Link href="/" className="text-sm text-rose-600 hover:underline">← Terug naar Dashboard</Link>
      </div>
    );
  }

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
            Trend in belasting per speler (laatste weken), een advies voor de komende training, en de seizoenstotalen.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={thCls}>Speler</th>
                  <th className={thCls}>Trend</th>
                  <th className={thCls}>Advies komende training</th>
                  <th className={thCls}>Sessies</th>
                  <th className={thCls}>Gem. RPE</th>
                  <th className={thCls}>Totale belasting</th>
                  <th className={thCls}>Blessures</th>
                </tr>
              </thead>
              <tbody>
                {teamOverview.map(({ player, risk, advice, trend, seasonSessions, seasonAvgRpe, seasonLoad, seasonInjuries }) => (
                  <tr key={player.id} className="border-b border-slate-100">
                    <td className={`${tdCls} font-medium`}>{player.name}</td>
                    <td className={tdCls}>
                      <Sparkline values={trend} color={risk} />
                    </td>
                    <td className={tdCls}>
                      <Badge color={risk}>{advice}</Badge>
                    </td>
                    <td className={tdCls}>{seasonSessions}</td>
                    <td className={tdCls}>{seasonAvgRpe !== null ? seasonAvgRpe.toFixed(1) : "—"}</td>
                    <td className={tdCls}>{seasonLoad.toLocaleString("nl-NL")}</td>
                    <td className={tdCls}>
                      {seasonInjuries > 0 ? <Badge color="red">{seasonInjuries}×</Badge> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canEdit && (
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
          <select className={inputCls} value={sessionType} onChange={(e) => applySessionType(e.target.value as "training" | "wedstrijd")}>
            <option value="training">Training</option>
            <option value="wedstrijd">Wedstrijd</option>
          </select>
          <Button variant="secondary" onClick={() => fillAll("90")}>
            Vul alle minuten (90)
          </Button>
        </div>
        {existingForCurrentSession.length > 0 && (
          <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            ✏️ Deze sessie is al ingevuld ({existingForCurrentSession.length} speler
            {existingForCurrentSession.length === 1 ? "" : "s"}) — de bestaande invoer staat hieronder, pas aan en
            sla opnieuw op om te corrigeren.
          </p>
        )}
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
                        title="1 = geen vermoeidheid, 10 = veel vermoeidheid"
                        disabled={d.absent} onChange={(e) => setDraft(p.id, "fatigue", e.target.value)} />
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
      )}

      <Card>
        <h2 className="mb-1 font-semibold">Trend per speler</h2>
        <p className="mb-3 text-xs text-slate-500">
          Kies een cijfer en een periode, en vergelijk één of meerdere spelers met elkaar en met het team-gemiddelde.
        </p>
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">Cijfer</span>
            <select className={inputCls} value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
              {METRIC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">Periode</span>
            <select className={inputCls} value={weekWindow} onChange={(e) => setWeekWindow(e.target.value)}>
              {WEEK_WINDOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
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
          <p className="text-sm text-slate-500">Nog geen invoer voor de gekozen speler(s) in deze periode.</p>
        )}

        {chartData.length > 0 && (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} label={{ value: "week", position: "insideBottomRight", offset: -4, fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} label={{ value: metricLabel, angle: -90, position: "insideLeft", fontSize: 12 }} />
                  <Tooltip labelFormatter={(l) => `Week ${l}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey={TEAM_AVG_KEY}
                    name="Team-gemiddelde"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
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
              {metricAgg === "sum"
                ? `${metricLabel}: totaal per week.`
                : `${metricLabel}: gemiddelde per week.`}{" "}
              De gestippelde lijn is het team-gemiddelde (alle actieve spelers) ter vergelijking.
              {metric === "load" && " Let op grote sprongen (>30% stijging week-op-week) — die verhogen blessurerisico."}
            </p>
          </>
        )}

        {sessionOptions.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowRawEntries((v) => !v)}
              className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-rose-600"
            >
              <span className={`text-xs transition-transform ${showRawEntries ? "rotate-90" : ""}`} aria-hidden>›</span>
              Ruwe invoer per sessie (voor correcties)
            </button>
            {showRawEntries && (
            <div className="mt-2">
              <select
                className={`${inputCls} w-full max-w-md`}
                value={correctionSession}
                onChange={(e) => setCorrectionSession(e.target.value)}
              >
                <option value="">— Kies een sessie —</option>
                {sessionOptions.map((o) => (
                  <option key={`${o.date}|${o.session_type}`} value={`${o.date}|${o.session_type}`}>
                    {o.date} — {o.session_type} ({o.count} invoer{o.count === 1 ? "" : "en"})
                  </option>
                ))}
              </select>

              {correctionSession && (
                <div className="mt-3 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className={thCls}>Speler</th>
                      <th className={thCls}>Minuten</th>
                      <th className={thCls}>RPE</th>
                      <th className={thCls}>Belasting</th>
                      <th className={thCls}>Vermoeidheid</th>
                      <th className={thCls}>Blessure</th>
                      <th className={thCls}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {correctionEntries.map((e) => (
                      <tr key={e.id} className={`border-b border-slate-100 ${e.absent ? "opacity-60" : ""}`}>
                        <td className={`${tdCls} font-medium`}>{players.find((p) => p.id === e.player_id)?.name ?? "—"}</td>
                        {e.absent ? (
                          <td className={tdCls} colSpan={4}>
                            <Badge color="slate">🚫 Afwezig</Badge>
                          </td>
                        ) : (
                          <>
                            <td className={tdCls}>{e.minutes}</td>
                            <td className={tdCls}>{e.rpe}</td>
                            <td className={`${tdCls} font-medium`}>{(e.minutes ?? 0) * (e.rpe ?? 0)}</td>
                            <td className={tdCls}>
                              {e.fatigue ? <ScaleBadge value={e.fatigue} /> : "—"}
                            </td>
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
                          {canEdit && (
                            <button className="text-xs text-red-500 hover:underline" onClick={() => removeEntry(e)}>
                              verwijderen
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// Zelfde richting als RPE: 1 = heel licht, 10 = maximaal — dus hoge waarden zijn slecht.
function ScaleBadge({ value, icon }: { value: number; icon?: string }) {
  const bad = value >= 7;
  const ok = value >= 5 && value <= 6;
  return <Badge color={bad ? "red" : ok ? "amber" : "green"}>{icon ? `${icon} ` : ""}{value}/10</Badge>;
}

