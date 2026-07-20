"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ParsedMatch, parseMatchesFile, parseMatchesText } from "@/lib/parse";
import { formatDateShort, isoWeek, todayIso } from "@/lib/format";
import { computeMatchTimes, computeScheduleItemTimes } from "@/lib/schedule";
import { Badge, Button, Card, Message, PageTitle, inputCls, tdCls, thCls } from "@/components/ui";
import { AbsenceTimeline } from "@/components/AbsenceTimeline";
import { Absence, Club, Match, Player, ScheduleItem, StaffMember } from "@/lib/types";

type Tab = "wedstrijden" | "agenda";

type AgendaRow =
  | { kind: "schedule"; date: string; item: ScheduleItem }
  | { kind: "match"; date: string; match: Match };

function sortMatches(list: Match[]): Match[] {
  return [...list].sort((a, b) => `${a.date} ${a.kickoff_time}`.localeCompare(`${b.date} ${b.kickoff_time}`));
}

function weekNumber(dateIso: string): string {
  const match = isoWeek(dateIso).match(/-W(\d+)$/);
  return match ? String(parseInt(match[1], 10)) : "?";
}

function activityColor(activity: string): "green" | "blue" | "amber" | "slate" {
  const a = activity.toLowerCase();
  if (a.includes("wedstrijd")) return "blue";
  if (a.includes("toermooi") || a.includes("toernooi")) return "amber";
  if (a.includes("training")) return "green";
  return "slate";
}

function splitByDate<T>(list: T[], dateOf: (t: T) => string, today: string): { upcoming: T[]; past: T[] } {
  const upcoming = list.filter((t) => dateOf(t) >= today).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const past = list.filter((t) => dateOf(t) < today).sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  return { upcoming, past };
}

export default function ProgrammaPage() {
  const [tab, setTab] = useState<Tab>("wedstrijden");

  const [matches, setMatches] = useState<Match[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<ParsedMatch[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [fetchingClubId, setFetchingClubId] = useState<string | null>(null);
  const [fetchAllBusy, setFetchAllBusy] = useState(false);

  const [newDate, setNewDate] = useState("");
  const [newKickoff, setNewKickoff] = useState("");
  const [newOpponent, setNewOpponent] = useState("");
  const [newHomeAway, setNewHomeAway] = useState<"home" | "away">("home");
  const [newCompetition, setNewCompetition] = useState("");

  const [newItemDate, setNewItemDate] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [newItemKickoff, setNewItemKickoff] = useState("");
  const [newItemHomeAway, setNewItemHomeAway] = useState<"" | "home" | "away">("");
  const [newTravel, setNewTravel] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const [absPerson, setAbsPerson] = useState(""); // "player:<id>" of "staff:<id>"
  const [absFrom, setAbsFrom] = useState("");
  const [absUntil, setAbsUntil] = useState("");
  const [absReason, setAbsReason] = useState("");

  const reload = () =>
    Promise.all([
      api.list("matches"),
      api.list("clubs"),
      api.list("schedule_items"),
      api.list("players"),
      api.list("staff"),
      api.list("absences"),
    ])
      .then(([m, c, si, p, s, a]) => {
        setMatches(sortMatches(m));
        setClubs(c);
        setScheduleItems(si);
        setPlayers([...p].sort((x, y) => x.name.localeCompare(y.name, "nl")));
        setStaff([...s].sort((x, y) => x.name.localeCompare(y.name, "nl")));
        setAbsences(a);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  function flash(text: string, isError = false) {
    setMsg(text);
    setErr(isError);
  }

  // ---------- Wedstrijden ----------

  async function handleFile(file: File) {
    try {
      const parsed = parseMatchesFile(await file.arrayBuffer());
      if (parsed.length === 0) {
        flash("Geen wedstrijden herkend. Verwacht kolommen zoals datum, tijd en wedstrijd/thuis/uit.", true);
        return;
      }
      setPreview(parsed);
      setMsg(null);
    } catch (e) {
      flash((e as Error).message, true);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handlePaste() {
    const parsed = parseMatchesText(pasteText);
    if (parsed.length === 0) {
      flash("Geen wedstrijden herkend in de geplakte tekst. Elke wedstrijd heeft een datum, tijd en twee teamnamen nodig.", true);
      return;
    }
    setPreview(parsed);
    setMsg(null);
  }

  async function confirmImport(replace: boolean) {
    if (!preview) return;
    try {
      if (replace) await api.clear("matches");
      await api.create("matches", preview);
      const existingClubNames = new Set(clubs.map((c) => c.name.toLowerCase()));
      const newClubs = [...new Set(
        preview.filter((m) => m.home_away === "away").map((m) => m.opponent)
      )]
        .filter((name) => !existingClubNames.has(name.toLowerCase()))
        .map((name) => ({ name, address: null, travel_time_minutes: null }));
      if (newClubs.length > 0) await api.create("clubs", newClubs);

      setPreview(null);
      setPasteText("");
      await reload();
      flash(`${preview.length} wedstrijden geïmporteerd. Vul hieronder de reistijden in voor de uitwedstrijden.`);
    } catch (e) {
      flash((e as Error).message, true);
    }
  }

  async function addMatch() {
    if (!newDate || !newKickoff || !newOpponent.trim()) {
      flash("Vul datum, aftrap en tegenstander in.", true);
      return;
    }
    try {
      await api.create("matches", {
        date: newDate,
        kickoff_time: newKickoff,
        home_away: newHomeAway,
        opponent: newOpponent.trim(),
        competition: newCompetition.trim() || null,
        notes: null,
        score_for: null,
        score_against: null,
      });
      if (newHomeAway === "away") {
        const existingClubNames = new Set(clubs.map((c) => c.name.toLowerCase()));
        if (!existingClubNames.has(newOpponent.trim().toLowerCase())) {
          await api.create("clubs", { name: newOpponent.trim(), address: null, travel_time_minutes: null });
        }
      }
      setNewDate("");
      setNewKickoff("");
      setNewOpponent("");
      setNewHomeAway("home");
      setNewCompetition("");
      await reload();
      flash("Wedstrijd toegevoegd aan het programma.");
    } catch (e) {
      flash((e as Error).message, true);
    }
  }

  async function updateTravelTime(club: Club, value: string) {
    const minutes = value === "" ? null : parseInt(value, 10);
    await api.update("clubs", club.id, { travel_time_minutes: isNaN(minutes as number) ? null : minutes });
    await reload();
  }

  async function updateClubAddress(club: Club, value: string) {
    await api.update("clubs", club.id, { address: value.trim() || null });
    await reload();
  }

  async function fetchTravelTime(club: Club) {
    const destination = club.address?.trim() || club.name;
    setFetchingClubId(club.id);
    try {
      const { minutes } = await api.travelTime(destination);
      await api.update("clubs", club.id, { travel_time_minutes: minutes });
      await reload();
    } catch (e) {
      flash((e as Error).message, true);
    } finally {
      setFetchingClubId(null);
    }
  }

  async function fetchAllTravelTimes() {
    setFetchAllBusy(true);
    try {
      for (const club of relevantClubs) {
        await fetchTravelTime(club);
      }
      flash("Reistijden opgehaald via Google Maps.");
    } finally {
      setFetchAllBusy(false);
    }
  }

  async function updateScore(m: Match, field: "score_for" | "score_against", value: string) {
    const n = value === "" ? null : parseInt(value, 10);
    await api.update("matches", m.id, { [field]: isNaN(n as number) ? null : n });
    await reload();
  }

  async function removeMatch(m: Match) {
    if (!confirm(`Wedstrijd tegen ${m.opponent} op ${formatDateShort(m.date)} verwijderen?`)) return;
    await api.remove("matches", m.id);
    await reload();
  }

  // ---------- Agenda (trainingen/toernooien + wedstrijden samengevoegd) ----------

  const agendaRows: AgendaRow[] = useMemo(() => {
    const scheduleRows: AgendaRow[] = scheduleItems.map((item) => ({ kind: "schedule", date: item.date, item }));
    const matchRows: AgendaRow[] = matches.map((match) => ({ kind: "match", date: match.date, match }));
    return [...scheduleRows, ...matchRows];
  }, [scheduleItems, matches]);

  function absentNamesForDate(date: string): string[] {
    return absences
      .filter((a) => date >= a.from && date <= a.until)
      .map((a) => {
        if (a.player_id) return players.find((p) => p.id === a.player_id)?.name ?? "?";
        return staff.find((s) => s.id === a.staff_id)?.name ?? "?";
      });
  }

  async function addItem() {
    if (!newItemDate || !newActivity.trim()) {
      flash("Vul een datum en activiteit in.", true);
      return;
    }
    try {
      await api.create("schedule_items", {
        date: newItemDate,
        activity: newActivity.trim(),
        kickoff_time: newItemKickoff || null,
        home_away: newItemHomeAway || null,
        travel_time_minutes: newTravel === "" ? null : parseInt(newTravel, 10),
        notes: newNotes.trim() || null,
      });
      setNewItemDate("");
      setNewActivity("");
      setNewItemKickoff("");
      setNewItemHomeAway("");
      setNewTravel("");
      setNewNotes("");
      await reload();
      flash("Toegevoegd aan de seizoensplanning.");
    } catch (e) {
      flash((e as Error).message, true);
    }
  }

  async function updateField(
    item: ScheduleItem,
    field: "notes" | "kickoff_time" | "home_away" | "travel_time_minutes",
    value: string
  ) {
    let patch: Partial<ScheduleItem>;
    if (field === "travel_time_minutes") {
      patch = { travel_time_minutes: value === "" ? null : parseInt(value, 10) };
    } else if (field === "home_away") {
      patch = { home_away: value === "" ? null : (value as "home" | "away") };
    } else {
      patch = { [field]: value.trim() || null };
    }
    await api.update("schedule_items", item.id, patch);
    await reload();
  }

  async function removeItem(item: ScheduleItem) {
    if (!confirm(`"${item.activity}" op ${formatDateShort(item.date)} verwijderen?`)) return;
    await api.remove("schedule_items", item.id);
    await reload();
  }

  async function addAbsence() {
    if (!absPerson || !absFrom || !absUntil) {
      flash("Kies een persoon en een van/tot-datum.", true);
      return;
    }
    if (absUntil < absFrom) {
      flash("De tot-datum ligt voor de van-datum.", true);
      return;
    }
    const [kind, id] = absPerson.split(":");
    try {
      await api.create("absences", {
        player_id: kind === "player" ? id : null,
        staff_id: kind === "staff" ? id : null,
        from: absFrom,
        until: absUntil,
        reason: absReason.trim() || null,
      });
      setAbsPerson("");
      setAbsFrom("");
      setAbsUntil("");
      setAbsReason("");
      await reload();
      flash("Afwezigheid toegevoegd.");
    } catch (e) {
      flash((e as Error).message, true);
    }
  }

  async function removeAbsence(a: Absence) {
    await api.remove("absences", a.id);
    await reload();
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  const today = todayIso();
  const awayOpponents = new Set(matches.filter((m) => m.home_away === "away").map((m) => m.opponent.toLowerCase()));
  const relevantClubs = clubs.filter((c) => awayOpponents.has(c.name.toLowerCase()));
  const { upcoming: upcomingMatches, past: pastMatches } = splitByDate(matches, (m) => m.date, today);
  const { upcoming: upcomingAgenda, past: pastAgenda } = splitByDate(agendaRows, (r) => r.date, today);

  function matchRow(m: Match) {
    const played = m.date <= today;
    return (
      <tr key={m.id} className="border-b border-slate-100">
        <td className={tdCls}>{formatDateShort(m.date)}</td>
        <td className={tdCls}>{m.kickoff_time}</td>
        <td className={`${tdCls} font-medium`}>{m.opponent}</td>
        <td className={tdCls}>
          <Badge color={m.home_away === "home" ? "green" : "blue"}>
            {m.home_away === "home" ? "Thuis" : "Uit"}
          </Badge>
        </td>
        <td className={tdCls}>
          {played ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                className={`${inputCls} w-14`}
                defaultValue={m.score_for ?? ""}
                placeholder="-"
                onBlur={(e) =>
                  e.target.value !== String(m.score_for ?? "") && updateScore(m, "score_for", e.target.value)
                }
              />
              <span className="text-slate-400">–</span>
              <input
                type="number"
                min={0}
                className={`${inputCls} w-14`}
                defaultValue={m.score_against ?? ""}
                placeholder="-"
                onBlur={(e) =>
                  e.target.value !== String(m.score_against ?? "") &&
                  updateScore(m, "score_against", e.target.value)
                }
              />
            </div>
          ) : (
            <Badge>gepland</Badge>
          )}
        </td>
        <td className={tdCls}>
          <Link href={`/wedstrijden?match=${m.id}`} className="text-xs font-medium text-rose-600 hover:underline">
            Bekijk →
          </Link>
        </td>
        <td className={tdCls}>
          <button className="text-xs text-red-500 hover:underline" onClick={() => removeMatch(m)}>
            verwijderen
          </button>
        </td>
      </tr>
    );
  }

  function matchTable(list: Match[], emptyText: string) {
    if (list.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={thCls}>Datum</th>
              <th className={thCls}>Aftrap</th>
              <th className={thCls}>Tegenstander</th>
              <th className={thCls}>Thuis/uit</th>
              <th className={thCls}>Uitslag</th>
              <th className={thCls}></th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>{list.map(matchRow)}</tbody>
        </table>
      </div>
    );
  }

  function agendaRow(row: AgendaRow) {
    const absentNames = absentNamesForDate(row.date);
    const afwezigCell =
      absentNames.length === 0 ? (
        <span className="text-xs text-slate-400">–</span>
      ) : (
        <span className="text-xs text-amber-700">{absentNames.join(", ")}</span>
      );

    if (row.kind === "match") {
      const { match } = row;
      const times = computeMatchTimes(match, clubs);
      const activity = `Wedstrijd ${match.opponent} (${match.home_away === "home" ? "thuis" : "uit"})`;
      return (
        <tr key={`match-${match.id}`} className="border-b border-slate-100 bg-blue-50/30">
          <td className={tdCls}>{weekNumber(match.date)}</td>
          <td className={tdCls}>{formatDateShort(match.date)}</td>
          <td className={tdCls}>
            <Badge color="blue">{activity}</Badge>
          </td>
          <td className={tdCls}>{match.kickoff_time}</td>
          <td className={tdCls}>
            <span className="text-xs text-slate-500">{match.home_away === "home" ? "Thuis" : "Uit"}</span>
          </td>
          <td className={tdCls}>
            {match.home_away === "away" ? (
              <span className="text-xs text-slate-500">{times.travelMinutes ?? "?"} min</span>
            ) : (
              <span className="text-xs text-slate-400">–</span>
            )}
          </td>
          <td className={tdCls}>
            {times.depart ? (
              <Badge color="amber">{times.depart}</Badge>
            ) : times.arrive && match.home_away === "home" ? (
              <span className="text-xs text-slate-500">aanwezig {times.arrive} (thuis)</span>
            ) : (
              <span className="text-xs text-amber-600">vul reistijd in bij Wedstrijden</span>
            )}
          </td>
          <td className={tdCls}>{afwezigCell}</td>
          <td className={`${tdCls} min-w-[16rem] text-slate-500`}>{match.notes ?? match.competition ?? "–"}</td>
          <td className={tdCls}>
            <Link href={`/wedstrijden?match=${match.id}`} className="text-xs font-medium text-emerald-600 hover:underline">
              Bekijk →
            </Link>
          </td>
        </tr>
      );
    }

    const item = row.item;
    const times = computeScheduleItemTimes(item);
    return (
      <tr key={`item-${item.id}`} className="border-b border-slate-100">
        <td className={tdCls}>{weekNumber(item.date)}</td>
        <td className={tdCls}>{formatDateShort(item.date)}</td>
        <td className={tdCls}>
          <Badge color={activityColor(item.activity)}>{item.activity}</Badge>
        </td>
        <td className={tdCls}>
          <input
            type="time"
            className={`${inputCls} w-24`}
            defaultValue={item.kickoff_time ?? ""}
            onBlur={(e) =>
              e.target.value !== (item.kickoff_time ?? "") &&
              updateField(item, "kickoff_time", e.target.value)
            }
          />
        </td>
        <td className={tdCls}>
          <select
            className={inputCls}
            defaultValue={item.home_away ?? ""}
            onChange={(e) => updateField(item, "home_away", e.target.value)}
          >
            <option value="">–</option>
            <option value="home">Thuis</option>
            <option value="away">Uit</option>
          </select>
        </td>
        <td className={tdCls}>
          {item.home_away === "away" ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                className={`${inputCls} w-20`}
                defaultValue={item.travel_time_minutes ?? ""}
                placeholder="?"
                onBlur={(e) =>
                  e.target.value !== String(item.travel_time_minutes ?? "") &&
                  updateField(item, "travel_time_minutes", e.target.value)
                }
              />
              <span className="text-xs text-slate-500">min</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">–</span>
          )}
        </td>
        <td className={tdCls}>
          {times.depart ? (
            <Badge color="amber">{times.depart}</Badge>
          ) : times.arrive && item.home_away === "home" ? (
            <span className="text-xs text-slate-500">aanwezig {times.arrive} (thuis)</span>
          ) : times.arrive && item.home_away === "away" ? (
            <span className="text-xs text-amber-600">vul reistijd in</span>
          ) : (
            <span className="text-xs text-slate-400">–</span>
          )}
        </td>
        <td className={tdCls}>{afwezigCell}</td>
        <td className={`${tdCls} min-w-[22rem]`}>
          <input
            type="text"
            className={`${inputCls} w-full min-w-[22rem]`}
            defaultValue={item.notes ?? ""}
            onBlur={(e) =>
              e.target.value !== (item.notes ?? "") && updateField(item, "notes", e.target.value)
            }
          />
        </td>
        <td className={tdCls}>
          <button className="text-xs text-red-500 hover:underline" onClick={() => removeItem(item)}>
            verwijderen
          </button>
        </td>
      </tr>
    );
  }

  function agendaTable(list: AgendaRow[], emptyText: string) {
    if (list.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={thCls}>Week</th>
              <th className={thCls}>Datum</th>
              <th className={thCls}>Activiteit</th>
              <th className={thCls}>Aftrap</th>
              <th className={thCls}>Thuis/uit</th>
              <th className={thCls}>Reistijd</th>
              <th className={thCls}>Vertrektijd</th>
              <th className={thCls}>Afwezig</th>
              <th className={thCls}>Opmerking</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>{list.map(agendaRow)}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="Programma"
        subtitle="Wedstrijden, trainingen en toernooien op één plek, gesplitst in aankomend en verleden."
      />

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setTab("wedstrijden")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "wedstrijden" ? "bg-rose-600 text-white" : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"}`}
        >
          Wedstrijden
        </button>
        <button
          onClick={() => setTab("agenda")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "agenda" ? "bg-rose-600 text-white" : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"}`}
        >
          Agenda
        </button>
      </div>

      <Message text={msg} error={err} />

      {tab === "wedstrijden" && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">Plakken vanaf voetbal.nl</h2>
              <textarea
                className={`${inputCls} h-40 w-full font-mono text-xs`}
                placeholder={"Selecteer het programma op voetbal.nl, kopieer het en plak het hier.\nBijv.:\nza 6 sep 2025 14:30\nSteenwijkerwold JO19-1 - FC Wolvega JO19-1"}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="mt-3">
                <Button onClick={handlePaste} disabled={!pasteText.trim()}>Tekst verwerken</Button>
              </div>
            </Card>

            <Card>
              <h2 className="mb-3 font-semibold">Of upload Excel/CSV</h2>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <p className="mt-2 text-xs text-slate-500">
                Kolommen worden automatisch herkend: datum, tijd, en “wedstrijd” (Team A - Team B) of aparte thuis/uit-kolommen.
                Thuis of uit wordt bepaald aan de hand van de teamnaam (Steenwijkerwold).
              </p>
            </Card>
          </div>

          <Card className="mt-6">
            <h2 className="mb-3 font-semibold">Eén wedstrijd handmatig toevoegen</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input type="date" className={inputCls} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <input type="time" className={inputCls} value={newKickoff} onChange={(e) => setNewKickoff(e.target.value)} />
              <input
                type="text"
                className={inputCls}
                placeholder="Tegenstander"
                value={newOpponent}
                onChange={(e) => setNewOpponent(e.target.value)}
              />
              <select
                className={inputCls}
                value={newHomeAway}
                onChange={(e) => setNewHomeAway(e.target.value as "home" | "away")}
              >
                <option value="home">Thuis</option>
                <option value="away">Uit</option>
              </select>
              <input
                type="text"
                className={inputCls}
                placeholder="Competitie (optioneel)"
                value={newCompetition}
                onChange={(e) => setNewCompetition(e.target.value)}
              />
            </div>
            <div className="mt-3">
              <Button onClick={addMatch}>Toevoegen</Button>
            </div>
          </Card>

          {preview && (
            <Card className="mt-6 border-amber-200">
              <h2 className="mb-3 font-semibold">Controleer de import ({preview.length} wedstrijden)</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className={thCls}>Datum</th>
                      <th className={thCls}>Aftrap</th>
                      <th className={thCls}>Tegenstander</th>
                      <th className={thCls}>Thuis/uit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((m, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className={tdCls}>{formatDateShort(m.date)}</td>
                        <td className={tdCls}>{m.kickoff_time}</td>
                        <td className={`${tdCls} font-medium`}>{m.opponent}</td>
                        <td className={tdCls}>
                          <Badge color={m.home_away === "home" ? "green" : "blue"}>
                            {m.home_away === "home" ? "Thuis" : "Uit"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex gap-3">
                {matches.length > 0 && (
                  <Button onClick={() => confirmImport(true)} variant="danger">
                    Vervang huidig programma
                  </Button>
                )}
                <Button onClick={() => confirmImport(false)}>
                  {matches.length > 0 ? "Voeg toe aan programma" : "Importeer"}
                </Button>
                <Button variant="secondary" onClick={() => setPreview(null)}>Annuleren</Button>
              </div>
            </Card>
          )}

          {relevantClubs.length > 0 && (
            <Card className="mt-6">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Reistijden uitwedstrijden 🚗</h2>
                <Button variant="secondary" onClick={fetchAllTravelTimes} disabled={fetchAllBusy}>
                  {fetchAllBusy ? "Ophalen…" : "Alles ophalen via Google Maps"}
                </Button>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Eenmalig per club: vul optioneel het exacte adres van het sportpark in voor de nauwkeurigste route, en klik op
                &quot;ophalen&quot; om de reistijd automatisch te berekenen vanaf {" "}
                <span className="font-medium">Oldemarktseweg 92, Steenwijkerwold</span>. Zonder adres wordt op clubnaam gezocht.
                Wordt gebruikt om de vertrektijd te berekenen: aanwezig = 1 uur voor aftrap, vertrek = aanwezig − reistijd.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {relevantClubs.map((c) => (
                  <div key={c.id} className="rounded-lg border border-slate-100 px-3 py-2">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{c.name}</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          className={`${inputCls} w-16`}
                          defaultValue={c.travel_time_minutes ?? ""}
                          placeholder="?"
                          onBlur={(e) => e.target.value !== String(c.travel_time_minutes ?? "") && updateTravelTime(c, e.target.value)}
                        />
                        <span className="text-xs text-slate-500">min</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className={`${inputCls} flex-1 text-xs`}
                        placeholder="Adres sportpark (optioneel, voor nauwkeurigere route)"
                        defaultValue={c.address ?? ""}
                        onBlur={(e) => e.target.value !== (c.address ?? "") && updateClubAddress(c, e.target.value)}
                      />
                      <button
                        onClick={() => fetchTravelTime(c)}
                        disabled={fetchingClubId === c.id}
                        className="whitespace-nowrap rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:border-emerald-600 hover:text-emerald-600 disabled:opacity-50"
                      >
                        {fetchingClubId === c.id ? "Ophalen…" : "Ophalen"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="mt-6">
            <h2 className="mb-3 font-semibold">
              Aankomende wedstrijden <span className="text-sm font-normal text-slate-500">({upcomingMatches.length})</span>
            </h2>
            {matchTable(upcomingMatches, "Geen aankomende wedstrijden.")}
          </Card>

          <Card className="mt-6">
            <h2 className="mb-3 font-semibold">
              Gespeelde wedstrijden <span className="text-sm font-normal text-slate-500">({pastMatches.length})</span>
            </h2>
            {matchTable(pastMatches, "Nog geen wedstrijden gespeeld.")}
          </Card>
        </>
      )}

      {tab === "agenda" && (
        <>
          <Card>
            <h2 className="mb-3 font-semibold">Training of toernooi toevoegen</h2>
            <p className="mb-3 text-xs text-slate-500">
              Voor wedstrijden: gebruik het tabblad <button className="font-medium text-emerald-600 hover:underline" onClick={() => setTab("wedstrijden")}>Wedstrijden</button> — ze verschijnen dan automatisch hieronder.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                type="date"
                className={inputCls}
                value={newItemDate}
                onChange={(e) => setNewItemDate(e.target.value)}
              />
              <input
                type="text"
                className={inputCls}
                placeholder="Activiteit (bv. training 11, GEMPO Toermooi)"
                value={newActivity}
                onChange={(e) => setNewActivity(e.target.value)}
              />
              <input
                type="time"
                className={inputCls}
                placeholder="Aftrap"
                value={newItemKickoff}
                onChange={(e) => setNewItemKickoff(e.target.value)}
              />
              <select
                className={inputCls}
                value={newItemHomeAway}
                onChange={(e) => setNewItemHomeAway(e.target.value as "" | "home" | "away")}
              >
                <option value="">Thuis/uit (n.v.t.)</option>
                <option value="home">Thuis</option>
                <option value="away">Uit</option>
              </select>
              <input
                type="number"
                min={0}
                className={inputCls}
                placeholder="Reistijd (min)"
                value={newTravel}
                onChange={(e) => setNewTravel(e.target.value)}
              />
              <input
                type="text"
                className={`${inputCls} lg:col-span-2`}
                placeholder="Opmerking (optioneel)"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
              <Button onClick={addItem}>Toevoegen</Button>
            </div>
          </Card>

          <Card className="mt-6">
            <h2 className="mb-1 font-semibold">Afwezigheid beheren</h2>
            <p className="mb-3 text-xs text-slate-500">
              Een periode hier toevoegen zet de persoon automatisch als afwezig bij elke training/wedstrijd in die periode — geen losse regels meer nodig.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <select className={inputCls} value={absPerson} onChange={(e) => setAbsPerson(e.target.value)}>
                <option value="">— Kies speler/staflid —</option>
                <optgroup label="Spelers">
                  {players.map((p) => (
                    <option key={p.id} value={`player:${p.id}`}>{p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Staf">
                  {staff.map((s) => (
                    <option key={s.id} value={`staff:${s.id}`}>{s.name}</option>
                  ))}
                </optgroup>
              </select>
              <input type="date" className={inputCls} value={absFrom} onChange={(e) => setAbsFrom(e.target.value)} />
              <input type="date" className={inputCls} value={absUntil} onChange={(e) => setAbsUntil(e.target.value)} />
              <input
                type="text"
                className={inputCls}
                placeholder="Reden (optioneel)"
                value={absReason}
                onChange={(e) => setAbsReason(e.target.value)}
              />
              <Button onClick={addAbsence}>Toevoegen</Button>
            </div>

            <div className="mt-5">
              <AbsenceTimeline players={players} staff={staff} absences={absences} onRemove={removeAbsence} />
            </div>
          </Card>

          <Card className="mt-6">
            <h2 className="mb-3 font-semibold">
              Aankomend <span className="text-sm font-normal text-slate-500">({upcomingAgenda.length})</span>
            </h2>
            {agendaTable(upcomingAgenda, "Niets aankomend gepland.")}
          </Card>

          <Card className="mt-6">
            <h2 className="mb-3 font-semibold">
              Verleden <span className="text-sm font-normal text-slate-500">({pastAgenda.length})</span>
            </h2>
            {agendaTable(pastAgenda, "Nog niets geweest.")}
          </Card>
        </>
      )}
    </div>
  );
}
