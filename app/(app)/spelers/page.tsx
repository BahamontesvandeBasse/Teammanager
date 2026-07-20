"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { parsePlayersFile } from "@/lib/parse";
import { generateToken } from "@/lib/token";
import { POSITION_PRESETS } from "@/lib/positions";
import { Badge, Button, Card, Message, PageTitle, inputCls } from "@/components/ui";
import { AbsenceChip } from "@/components/PlayerAbsence";
import { ageFromBirthdate, todayIso } from "@/lib/format";
import { playerAbsenceStatus } from "@/lib/absence";
import { Absence, Player, StaffMember } from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

function sortPlayers(list: Player[]): Player[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Tenue Sv Steenwijkerwold: rood shirt met 2 diagonale zwarte banen (rechtsboven → linksonder).
const JERSEY_STYLE = {
  backgroundImage:
    "linear-gradient(45deg, #e11d48 0%, #e11d48 29%, #000 29%, #000 43%, #e11d48 43%, #e11d48 53%, #000 53%, #000 67%, #e11d48 67%, #e11d48 100%)",
};

export default function SpelersPage() {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("");
  const [editingPositionsFor, setEditingPositionsFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () =>
    Promise.all([api.list("players"), api.list("staff"), api.list("absences")])
      .then(([p, s, a]) => {
        setPlayers(sortPlayers(p));
        setStaff(s);
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

  async function handleFile(file: File, replace: boolean) {
    try {
      const parsed = parsePlayersFile(await file.arrayBuffer());
      if (parsed.length === 0) {
        flash("Geen spelers gevonden in dit bestand. Controleer of er een kolom met namen in staat.", true);
        return;
      }
      if (replace) {
        if (!confirm(`Huidige lijst (${players.length} spelers) vervangen door ${parsed.length} geïmporteerde spelers?`)) return;
        await api.clear("players");
      }
      await api.create("players", parsed);
      await reload();
      flash(`${parsed.length} spelers geïmporteerd.`);
    } catch (e) {
      flash((e as Error).message, true);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addPlayer() {
    if (!newName.trim()) return;
    const num = parseInt(newNumber, 10);
    await api.create("players", {
      name: newName.trim(),
      shirt_number: isNaN(num) ? null : num,
      positions: [],
      birthdate: null,
      parent_contact: null,
      active: true,
      token: generateToken(),
      ai_summary: null,
      ai_summary_generated_at: null,
    });
    setNewName("");
    setNewNumber("");
    await reload();
  }

  async function toggleActive(p: Player) {
    await api.update("players", p.id, { active: !p.active });
    await reload();
  }

  async function updateShirtNumber(p: Player, value: string) {
    await api.update("players", p.id, { shirt_number: value === "" ? null : parseInt(value, 10) || null });
    await reload();
  }

  async function togglePosition(p: Player, code: string) {
    const positions = p.positions.includes(code) ? p.positions.filter((c) => c !== code) : [...p.positions, code];
    await api.update("players", p.id, { positions });
    await reload();
  }

  async function addStaff() {
    if (!newStaffName.trim()) return;
    await api.create("staff", {
      name: newStaffName.trim(),
      role: newStaffRole.trim() || null,
      contact: null,
      birthdate: null,
    });
    setNewStaffName("");
    setNewStaffRole("");
    await reload();
  }

  async function updateStaffRole(s: StaffMember, value: string) {
    await api.update("staff", s.id, { role: value || null });
    await reload();
  }

  async function removeStaff(s: StaffMember) {
    if (!confirm(`${s.name} uit de staf verwijderen?`)) return;
    await api.remove("staff", s.id);
    await reload();
  }

  async function removePlayer(p: Player) {
    if (!confirm(`${p.name} verwijderen? Ook z'n statistieken en beurten worden losgekoppeld.`)) return;
    await api.remove("players", p.id);
    await reload();
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  const today = todayIso();

  return (
    <div>
      <PageTitle
        title="Spelers"
        subtitle="Importeer de spelerslijst uit Sportlink (Excel) of voeg spelers handmatig toe."
      />

      {canEdit && (
      <Card className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Speler toevoegen</h2>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs font-medium text-slate-400 hover:text-rose-600 hover:underline"
            title="Handig bij de start van het seizoen — importeer de hele lijst in één keer"
          >
            of importeer via Excel/CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f, players.length > 0);
            }}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            className={inputCls}
            placeholder="Naam"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          />
          <input
            className={`${inputCls} w-28`}
            placeholder="Rugnummer"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          />
          <Button onClick={addPlayer}>Toevoegen</Button>
        </div>
        <Message text={msg} error={err} />
      </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">
          Selectie <span className="text-sm font-normal text-slate-500">({players.filter((p) => p.active).length} actief van {players.length})</span>
        </h2>
        {players.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen spelers. Importeer een Excel of voeg spelers toe.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {players.map((p) => {
              const absenceStatus = playerAbsenceStatus(p.id, absences, today);
              return (
              <div
                key={p.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/spelers/${p.id}`)}
                onKeyDown={(e) => e.key === "Enter" && router.push(`/spelers/${p.id}`)}
                className={`group flex cursor-pointer flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  absenceStatus?.kind === "current"
                    ? "border-rose-200 hover:border-rose-300"
                    : absenceStatus?.kind === "upcoming"
                    ? "border-amber-200 hover:border-amber-300"
                    : "border-slate-200 hover:border-rose-300"
                } ${!p.active ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-inner ${
                        p.shirt_number ? "text-white" : "bg-slate-100 text-slate-400"
                      }`}
                      style={p.shirt_number ? JERSEY_STYLE : undefined}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        className="w-full bg-transparent text-center outline-none [text-shadow:0_1px_2px_rgba(0,0,0,0.5)] disabled:cursor-default"
                        defaultValue={p.shirt_number ?? ""}
                        placeholder="?"
                        disabled={!canEdit}
                        onBlur={(e) => e.target.value !== String(p.shirt_number ?? "") && updateShirtNumber(p, e.target.value)}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold leading-tight">{p.name}</div>
                      {p.birthdate && (
                        <div className="text-xs text-slate-400">{ageFromBirthdate(p.birthdate)} jaar</div>
                      )}
                      {canEdit ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleActive(p);
                          }}
                          title="Klik om te wisselen"
                        >
                          <Badge color={p.active ? "green" : "slate"}>{p.active ? "Actief" : "Inactief"}</Badge>
                        </button>
                      ) : (
                        <Badge color={p.active ? "green" : "slate"}>{p.active ? "Actief" : "Inactief"}</Badge>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removePlayer(p);
                      }}
                      className="shrink-0 text-xs text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      title="Verwijderen"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {absenceStatus && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <AbsenceChip status={absenceStatus} />
                  </div>
                )}

                <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-1">
                  {p.positions.map((pos) => (
                    <span
                      key={pos}
                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700"
                    >
                      {pos}
                      {canEdit && (
                        <button onClick={() => togglePosition(p, pos)} className="text-slate-400 hover:text-red-500">
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {canEdit && (
                    <button
                      onClick={() => setEditingPositionsFor(editingPositionsFor === p.id ? null : p.id)}
                      className="rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-xs text-slate-500 hover:border-rose-500 hover:text-rose-600"
                    >
                      +
                    </button>
                  )}
                </div>

                {canEdit && editingPositionsFor === p.id && (
                  <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 p-2">
                    {POSITION_PRESETS.map((code) => (
                      <button
                        key={code}
                        onClick={() => togglePosition(p, code)}
                        className={`rounded-lg border px-2 py-1 text-xs font-medium ${
                          p.positions.includes(code)
                            ? "border-rose-600 bg-rose-600 text-white"
                            : "border-slate-300 bg-white text-slate-600"
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                    <button onClick={() => setEditingPositionsFor(null)} className="ml-1 text-xs text-slate-500 hover:underline">
                      klaar
                    </button>
                  </div>
                )}

                <div className="mt-auto text-right text-xs font-medium text-rose-600 opacity-0 transition-opacity group-hover:opacity-100">
                  profiel →
                </div>
              </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-1 font-semibold">
          Staf <span className="text-sm font-normal text-slate-500">({staff.length})</span>
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Trainers, leiders en begeleiding — staat los van de spelerslijst en telt niet mee in de was- en rijrotatie.
        </p>
        {canEdit && (
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            className={inputCls}
            placeholder="Naam"
            value={newStaffName}
            onChange={(e) => setNewStaffName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addStaff()}
          />
          <input
            className={`${inputCls} w-64`}
            placeholder="Taak (bv. Coach, Trainer)"
            value={newStaffRole}
            onChange={(e) => setNewStaffRole(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addStaff()}
          />
          <Button onClick={addStaff}>Toevoegen</Button>
        </div>
        )}
        {staff.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen stafleden toegevoegd.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...staff].sort((a, b) => a.name.localeCompare(b.name, "nl")).map((s) => (
              <div
                key={s.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/staf/${s.id}`)}
                onKeyDown={(e) => e.key === "Enter" && router.push(`/staf/${s.id}`)}
                className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                      {initials(s.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold leading-tight">{s.name}</div>
                      {s.birthdate && (
                        <div className="text-xs text-slate-400">{ageFromBirthdate(s.birthdate)} jaar</div>
                      )}
                      <input
                        className="w-full truncate bg-transparent text-xs text-slate-400 outline-none placeholder:text-slate-300 disabled:cursor-default"
                        defaultValue={s.role ?? ""}
                        placeholder="Taak toevoegen"
                        disabled={!canEdit}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => e.target.value !== (s.role ?? "") && updateStaffRole(s, e.target.value)}
                      />
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeStaff(s);
                      }}
                      className="shrink-0 text-xs text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      title="Verwijderen"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="mt-auto text-right text-xs font-medium text-rose-600 opacity-0 transition-opacity group-hover:opacity-100">
                  profiel →
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
