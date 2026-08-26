"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ParsedMatch } from "@/lib/parse";
import { formatDateShort, todayIso } from "@/lib/format";
import { Badge, Button, Card, Message, PageTitle, inputCls, tdCls, thCls } from "@/components/ui";
import { AbsenceTimeline } from "@/components/AbsenceTimeline";
import { Absence, Club, Match, Player, ScheduleItem, StaffMember } from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

type AgendaRow =
  | { kind: "schedule"; date: string; item: ScheduleItem }
  | { kind: "match"; date: string; match: Match };

type TypeFilter = "alle" | "wedstrijd" | "training";

function sortMatches(list: Match[]): Match[] {
  return [...list].sort((a, b) => `${a.date} ${a.kickoff_time}`.localeCompare(`${b.date} ${b.kickoff_time}`));
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

// Compacte, inklapbare kaart voor beheertools (import/toevoegen) — dicht
// standaard, zodat de aandacht naar het programma zelf gaat in plaats van
// naar de invoervelden.
function CollapsibleCard({
  title,
  subtitle,
  defaultOpen = false,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={className}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <span className={`text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
          ›
        </span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </Card>
  );
}

export default function ProgrammaPage() {
  const canEdit = useCanEdit();

  const [matches, setMatches] = useState<Match[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const [preview, setPreview] = useState<ParsedMatch[] | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const [fetchingClubId, setFetchingClubId] = useState<string | null>(null);
  const [fetchAllBusy, setFetchAllBusy] = useState(false);

  const [newKind, setNewKind] = useState<"wedstrijd" | "activiteit">("wedstrijd");

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

  const [absFormOpen, setAbsFormOpen] = useState(false);
  const [editingAbsenceId, setEditingAbsenceId] = useState<string | null>(null);
  const [absPerson, setAbsPerson] = useState(""); // "player:<id>" of "staff:<id>"
  const [absFrom, setAbsFrom] = useState("");
  const [absUntil, setAbsUntil] = useState("");
  const [absReason, setAbsReason] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("alle");

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

  // ---------- Wedstrijden importeren / handmatig toevoegen ----------

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleScreenshot(file: File) {
    setImageBusy(true);
    const timeout = AbortSignal.timeout(45000);
    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/parse-schedule-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
        signal: timeout,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Herkennen mislukt.");
      setPreview(body.matches);
      setMsg(null);
    } catch (e) {
      if ((e as Error).name === "TimeoutError") {
        flash("Herkennen duurde te lang (45s) en is afgebroken. Probeer het opnieuw, eventueel met een kleinere/duidelijkere screenshot.", true);
      } else {
        flash((e as Error).message, true);
      }
    } finally {
      setImageBusy(false);
      if (imageRef.current) imageRef.current.value = "";
    }
  }

  useEffect(() => {
    function onWindowPaste(e: ClipboardEvent) {
      if (imageBusy) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) {
        e.preventDefault();
        handleScreenshot(f);
      }
    }
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [imageBusy]);

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
        possession_pct: null,
        shots_for: null,
        shots_against: null,
        shots_on_target_for: null,
        shots_on_target_against: null,
        corners_for: null,
        corners_against: null,
        fouls_for: null,
        fouls_against: null,
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

  // ---------- Activiteiten (trainingen/toernooien) ----------

  const agendaRows: AgendaRow[] = useMemo(() => {
    const scheduleRows: AgendaRow[] = scheduleItems.map((item) => ({ kind: "schedule", date: item.date, item }));
    const matchRows: AgendaRow[] = matches.map((match) => ({ kind: "match", date: match.date, match }));
    return [...scheduleRows, ...matchRows];
  }, [scheduleItems, matches]);

  const filteredAgendaRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agendaRows.filter((r) => {
      if (typeFilter === "wedstrijd" && r.kind !== "match") return false;
      if (typeFilter === "training" && r.kind !== "schedule") return false;
      if (!q) return true;
      const haystack = r.kind === "match" ? r.match.opponent : r.item.activity;
      return haystack.toLowerCase().includes(q);
    });
  }, [agendaRows, typeFilter, search]);

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

  async function updateField(item: ScheduleItem, field: "notes" | "kickoff_time", value: string) {
    await api.update("schedule_items", item.id, { [field]: value.trim() || null });
    await reload();
  }

  async function removeItem(item: ScheduleItem) {
    if (!confirm(`"${item.activity}" op ${formatDateShort(item.date)} verwijderen?`)) return;
    await api.remove("schedule_items", item.id);
    await reload();
  }

  function resetAbsenceForm() {
    setEditingAbsenceId(null);
    setAbsPerson("");
    setAbsFrom("");
    setAbsUntil("");
    setAbsReason("");
    setAbsFormOpen(false);
  }

  function startEditAbsence(a: Absence) {
    setEditingAbsenceId(a.id);
    setAbsPerson(a.player_id ? `player:${a.player_id}` : `staff:${a.staff_id}`);
    setAbsFrom(a.from);
    setAbsUntil(a.until);
    setAbsReason(a.reason ?? "");
    setAbsFormOpen(true);
  }

  async function saveAbsence() {
    if (!absPerson || !absFrom || !absUntil) {
      flash("Kies een persoon en een van/tot-datum.", true);
      return;
    }
    if (absUntil < absFrom) {
      flash("De tot-datum ligt voor de van-datum.", true);
      return;
    }
    const [kind, id] = absPerson.split(":");
    const patch = {
      player_id: kind === "player" ? id : null,
      staff_id: kind === "staff" ? id : null,
      from: absFrom,
      until: absUntil,
      reason: absReason.trim() || null,
    };
    try {
      if (editingAbsenceId) {
        await api.update("absences", editingAbsenceId, patch);
        flash("Afwezigheid bijgewerkt.");
      } else {
        await api.create("absences", { ...patch, reported_by: "staff" as const, acknowledged: true });
        flash("Afwezigheid toegevoegd.");
      }
      resetAbsenceForm();
      await reload();
    } catch (e) {
      flash((e as Error).message, true);
    }
  }

  async function removeAbsence(a: Absence) {
    await api.remove("absences", a.id);
    if (editingAbsenceId === a.id) resetAbsenceForm();
    await reload();
  }

  async function acknowledgeAbsence(a: Absence) {
    await api.update("absences", a.id, { acknowledged: true });
    await reload();
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  const today = todayIso();
  const awayOpponents = new Set(matches.filter((m) => m.home_away === "away").map((m) => m.opponent.toLowerCase()));
  const relevantClubs = clubs.filter((c) => awayOpponents.has(c.name.toLowerCase()));
  const hasMissingTravel = relevantClubs.some((c) => c.travel_time_minutes == null);
  const hasActiveAbsence = absences.some((a) => today >= a.from && today <= a.until);
  const newPlayerAbsences = absences
    .filter((a) => a.reported_by === "player" && !a.acknowledged)
    .sort((a, b) => a.from.localeCompare(b.from));
  const { upcoming: upcomingAgenda, past: pastAgenda } = splitByDate(filteredAgendaRows, (r) => r.date, today);

  function agendaRow(row: AgendaRow, showResult: boolean) {
    const absentNames = absentNamesForDate(row.date);
    const afwezigCell =
      absentNames.length === 0 ? (
        <span className="text-xs text-slate-500">–</span>
      ) : (
        <span className="text-xs text-amber-700">{absentNames.join(", ")}</span>
      );

    if (row.kind === "match") {
      const { match } = row;
      const played = match.date <= today;
      const activity = `Wedstrijd ${match.opponent} (${match.home_away === "home" ? "thuis" : "uit"})`;
      return (
        <tr key={`match-${match.id}`} className="border-b border-slate-100 bg-blue-50/30">
          <td className={tdCls}>{formatDateShort(match.date)}</td>
          <td className={tdCls}>
            <Badge color="blue">{activity}</Badge>
          </td>
          <td className={`${tdCls} font-medium text-slate-700`}>{match.kickoff_time || "–"}</td>
          {showResult && (
            <td className={tdCls}>
              {played ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    className={`${inputCls} w-12 text-xs`}
                    defaultValue={match.score_for ?? ""}
                    placeholder="-"
                    onBlur={(e) =>
                      e.target.value !== String(match.score_for ?? "") && updateScore(match, "score_for", e.target.value)
                    }
                  />
                  <span className="text-slate-500">–</span>
                  <input
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    className={`${inputCls} w-12 text-xs`}
                    defaultValue={match.score_against ?? ""}
                    placeholder="-"
                    onBlur={(e) =>
                      e.target.value !== String(match.score_against ?? "") &&
                      updateScore(match, "score_against", e.target.value)
                    }
                  />
                </div>
              ) : (
                <Badge>gepland</Badge>
              )}
            </td>
          )}
          <td className={tdCls}>{afwezigCell}</td>
          <td className={`${tdCls} max-w-xs whitespace-normal break-words text-xs text-slate-500`}>
            {match.notes ?? match.competition ?? "–"}
          </td>
          <td className={tdCls}>
            <div className="flex flex-col gap-0.5">
              <Link href={`/wedstrijden?match=${match.id}`} className="text-xs font-medium text-emerald-600 hover:underline">
                Bekijk →
              </Link>
              {match.score_for !== null && match.score_against !== null && (
                <Link href={`/resultaten?match=${match.id}`} className="text-xs font-medium text-rose-600 hover:underline">
                  🎥 Analyse →
                </Link>
              )}
              {canEdit && (
                <button className="text-left text-xs text-red-500 hover:underline" onClick={() => removeMatch(match)}>
                  verwijderen
                </button>
              )}
            </div>
          </td>
        </tr>
      );
    }

    const item = row.item;
    const activityLabel = item.home_away ? `${item.activity} (${item.home_away === "home" ? "thuis" : "uit"})` : item.activity;
    return (
      <tr key={`item-${item.id}`} className="border-b border-slate-100">
        <td className={tdCls}>{formatDateShort(item.date)}</td>
        <td className={tdCls}>
          <Badge color={activityColor(item.activity)}>{activityLabel}</Badge>
        </td>
        <td className={tdCls}>
          {canEdit ? (
            <input
              type="time"
              className={`${inputCls} w-28`}
              defaultValue={item.kickoff_time ?? ""}
              onBlur={(e) =>
                e.target.value !== (item.kickoff_time ?? "") && updateField(item, "kickoff_time", e.target.value)
              }
            />
          ) : (
            <span className="font-medium text-slate-700">{item.kickoff_time || "–"}</span>
          )}
        </td>
        {showResult && (
          <td className={tdCls}>
            <span className="text-xs text-slate-500">–</span>
          </td>
        )}
        <td className={tdCls}>{afwezigCell}</td>
        <td className={tdCls}>
          {canEdit ? (
            <input
              type="text"
              className={`${inputCls} w-full max-w-xs text-xs`}
              placeholder="Opmerking"
              defaultValue={item.notes ?? ""}
              onBlur={(e) => e.target.value !== (item.notes ?? "") && updateField(item, "notes", e.target.value)}
            />
          ) : (
            <span className="block max-w-xs whitespace-normal break-words text-xs text-slate-600">
              {item.notes || "–"}
            </span>
          )}
        </td>
        <td className={tdCls}>
          {canEdit && (
            <button className="text-xs text-red-500 hover:underline" onClick={() => removeItem(item)}>
              verwijderen
            </button>
          )}
        </td>
      </tr>
    );
  }

  function agendaTable(list: AgendaRow[], emptyText: string, showResult: boolean) {
    if (list.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={thCls}>Datum</th>
              <th className={thCls}>Activiteit</th>
              <th className={thCls}>Aftrap</th>
              {showResult && <th className={thCls}>Uitslag</th>}
              <th className={thCls}>Afwezig</th>
              <th className={thCls}>Opmerking</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>{list.map((row) => agendaRow(row, showResult))}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="Programma"
        subtitle="Wedstrijden, trainingen en toernooien op één plek, gesplitst in aankomend en afgerond."
      />

      <Message text={msg} error={err} />

      {canEdit && newPlayerAbsences.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <h2 className="mb-1 font-semibold text-amber-900">
            Nieuwe afwezigheidsmeldingen van spelers ({newPlayerAbsences.length})
          </h2>
          <p className="mb-3 text-xs text-amber-800">
            Deze zijn direct actief, maar zijn nog niet door de staf bekeken.
          </p>
          <div className="flex flex-col gap-2">
            {newPlayerAbsences.map((a) => {
              const name = players.find((p) => p.id === a.player_id)?.name ?? "?";
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2"
                >
                  <span className="text-sm">
                    <span className="font-medium">{name}</span> — {formatDateShort(a.from)} t/m {formatDateShort(a.until)}
                    {a.reason && <span className="text-slate-500"> ({a.reason})</span>}
                  </span>
                  <button
                    onClick={() => acknowledgeAbsence(a)}
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    ✓ gezien
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <CollapsibleCard
        title="Afwezigheid beheren"
        subtitle={hasActiveAbsence ? "Er is nu iemand afwezig" : "Niemand momenteel afwezig"}
        defaultOpen={hasActiveAbsence}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Een periode hier toevoegen zet de persoon automatisch als afwezig bij elke training/wedstrijd in die periode — geen losse regels meer nodig.
            Klik in de tijdlijn op een bestaande balk om &apos;m te bewerken, bijvoorbeeld als iemand eerder terug is.
          </p>
          {canEdit && (
            <button
              onClick={() => (absFormOpen ? resetAbsenceForm() : setAbsFormOpen(true))}
              className="shrink-0 text-xs font-medium text-emerald-600 hover:underline"
            >
              {absFormOpen ? "Sluiten" : "+ Toevoegen"}
            </button>
          )}
        </div>
        {canEdit && absFormOpen && (
          <div className="mb-2 mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <select className={inputCls} value={absPerson} onChange={(e) => setAbsPerson(e.target.value)} disabled={!!editingAbsenceId}>
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
            <div className="flex items-center gap-3">
              <Button onClick={saveAbsence}>{editingAbsenceId ? "Bijwerken" : "Toevoegen"}</Button>
              {editingAbsenceId && (
                <button className="text-xs text-slate-500 hover:underline" onClick={resetAbsenceForm}>
                  annuleren
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-5">
          <AbsenceTimeline
            players={players}
            staff={staff}
            absences={absences}
            onRemove={canEdit ? removeAbsence : undefined}
            onEdit={canEdit ? startEditAbsence : undefined}
          />
        </div>
      </CollapsibleCard>

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-2">
        <input
          type="text"
          className={`${inputCls} max-w-xs`}
          placeholder="Zoeken op tegenstander of activiteit…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1">
          {([
            ["alle", "Alles"],
            ["wedstrijd", "Wedstrijden"],
            ["training", "Trainingen"],
          ] as [TypeFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                typeFilter === value ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <CollapsibleCard
        title={
          <>
            Aankomend <span className="text-sm font-normal text-slate-500">({upcomingAgenda.length})</span>
          </>
        }
        defaultOpen
        className="mb-6"
      >
        {agendaTable(upcomingAgenda, "Niets aankomend gepland.", false)}
      </CollapsibleCard>

      <CollapsibleCard
        title={
          <>
            Afgerond <span className="text-sm font-normal text-slate-500">({pastAgenda.length})</span>
          </>
        }
        className="mb-6"
      >
        {agendaTable(pastAgenda, "Nog niets geweest.", true)}
      </CollapsibleCard>

      {canEdit && (
        <>
          <CollapsibleCard
            title="Activiteit toevoegen of wedstrijden importeren"
            subtitle="Screenshot van het programma, of handmatig een wedstrijd/training/toernooi"
            className="mt-6"
          >
            <div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Wedstrijden importeren via screenshot</h3>
                <div
                  className={`flex h-24 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 text-center text-xs ${
                    imageBusy ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-300 text-slate-500"
                  }`}
                >
                  {imageBusy ? (
                    "Bezig met herkennen…"
                  ) : (
                    <>
                      <span className="font-medium">Druk ergens op deze pagina Ctrl+V om een screenshot te plakken</span>
                      <span>
                        of{" "}
                        <button
                          type="button"
                          className="font-medium text-rose-600 underline"
                          onClick={() => imageRef.current?.click()}
                        >
                          kies een foto
                        </button>
                      </span>
                    </>
                  )}
                </div>
                <input
                  ref={imageRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={imageBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleScreenshot(f);
                  }}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Op de telefoon: kies een screenshot uit je foto's. Op de laptop: maak een printscreen van het programma
                  (bv. van voetbal.nl) en druk op deze pagina op Ctrl+V. AI leest de wedstrijden eruit.
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold">Eén activiteit handmatig toevoegen</h3>
              <div className="mb-3 flex gap-2">
                <button
                  onClick={() => setNewKind("wedstrijd")}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    newKind === "wedstrijd" ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600"
                  }`}
                >
                  Wedstrijd
                </button>
                <button
                  onClick={() => setNewKind("activiteit")}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    newKind === "activiteit" ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600"
                  }`}
                >
                  Training / toernooi
                </button>
              </div>

              {newKind === "wedstrijd" ? (
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
              ) : (
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
                    className={`${inputCls} lg:col-span-3`}
                    placeholder="Opmerking (optioneel)"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                  />
                </div>
              )}
              <div className="mt-3">
                <Button onClick={() => (newKind === "wedstrijd" ? addMatch() : addItem())}>Toevoegen</Button>
              </div>
            </div>
          </CollapsibleCard>

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
            <CollapsibleCard
              title="Reistijden uitwedstrijden 🚗"
              subtitle={hasMissingTravel ? "Nog niet voor alle clubs ingevuld" : "Voor alle clubs ingevuld"}
              defaultOpen={hasMissingTravel}
              className="mt-6"
            >
              <div className="mb-3 flex items-center justify-end">
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
            </CollapsibleCard>
          )}
        </>
      )}
    </div>
  );
}
