"use client";

import { Absence, Player, StaffMember } from "@/lib/types";
import { formatDateShort, todayIso } from "@/lib/format";

const MS_DAY = 86400000;
const MONTHS_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS_DAY);
}

function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(iso: string): string {
  const d = toDate(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function addMonths(iso: string, months: number): string {
  const d = toDate(iso);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type Row = {
  id: string;
  name: string;
  absences: Absence[];
};

function TimelineSection({
  title,
  rows,
  rangeStart,
  rangeEnd,
  today,
  onRemove,
  onEdit,
}: {
  title: string;
  rows: Row[];
  rangeStart: string;
  rangeEnd: string;
  today: string;
  onRemove?: (a: Absence) => void;
  onEdit?: (a: Absence) => void;
}) {
  const totalDays = daysBetween(rangeStart, rangeEnd);

  const months: { iso: string; leftPct: number }[] = [];
  let cursor = startOfMonth(rangeStart);
  while (cursor <= rangeEnd) {
    months.push({ iso: cursor, leftPct: (daysBetween(rangeStart, cursor) / totalDays) * 100 });
    cursor = addMonths(cursor, 1);
  }

  const todayPct = (daysBetween(rangeStart, today) / totalDays) * 100;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">
        {title} <span className="font-normal text-slate-400">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">Geen afwezigheden geregistreerd.</p>
      ) : (
        <div className="rounded-lg border border-slate-100">
          {/* Maandlabels */}
          <div className="relative h-6 border-b border-slate-100 pl-32">
            <div className="relative h-full">
              {months.map((m) => (
                <div
                  key={m.iso}
                  className="absolute top-0 border-l border-slate-100 pl-1 text-[11px] uppercase text-slate-500"
                  style={{ left: `${m.leftPct}%` }}
                >
                  {MONTHS_SHORT[toDate(m.iso).getMonth()]}
                </div>
              ))}
            </div>
          </div>

          {rows.map((row, i) => (
            <div
              key={row.id}
              className={`relative flex items-stretch pl-32 ${i > 0 ? "border-t border-slate-50" : ""}`}
            >
              <div className="absolute left-0 top-0 flex h-full w-32 items-center truncate pr-2 text-xs font-medium text-slate-700">
                {row.name}
              </div>
              <div className="relative h-9 w-full">
                {/* maand-gridlines */}
                {months.map((m) => (
                  <div key={m.iso} className="absolute top-0 h-full border-l border-slate-50" style={{ left: `${m.leftPct}%` }} />
                ))}
                {/* vandaag-lijn */}
                {todayPct >= 0 && todayPct <= 100 && (
                  <div className="absolute top-0 h-full border-l border-dashed border-rose-300" style={{ left: `${todayPct}%` }} />
                )}
                {row.absences.map((a) => {
                  const clampedFrom = a.from < rangeStart ? rangeStart : a.from;
                  const clampedUntil = a.until > rangeEnd ? rangeEnd : a.until;
                  const leftPct = (daysBetween(rangeStart, clampedFrom) / totalDays) * 100;
                  const widthPct = Math.max(
                    ((daysBetween(clampedFrom, clampedUntil) + 1) / totalDays) * 100,
                    1.2
                  );
                  const active = today >= a.from && today <= a.until;
                  const past = a.until < today;
                  const color = active
                    ? "bg-rose-500 hover:bg-rose-600"
                    : past
                    ? "bg-slate-300 hover:bg-slate-400"
                    : "bg-amber-400 hover:bg-amber-500";
                  return (
                    <div
                      key={a.id}
                      className={`group absolute top-1/2 flex h-5 -translate-y-1/2 items-center justify-center rounded-md ${color} px-1 shadow-sm transition-colors ${onEdit ? "cursor-pointer" : ""}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={`${formatDateShort(a.from)} t/m ${formatDateShort(a.until)}${a.reason ? ` — ${a.reason}` : ""}${onEdit ? " (klik om te bewerken)" : ""}`}
                      onClick={() => onEdit?.(a)}
                    >
                      {onRemove && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(a);
                          }}
                          className="invisible absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] leading-none text-red-500 shadow ring-1 ring-slate-200 group-hover:visible"
                          title="Verwijderen"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AbsenceTimeline({
  players,
  staff,
  absences,
  onRemove,
  onEdit,
}: {
  players: Player[];
  staff: StaffMember[];
  absences: Absence[];
  onRemove?: (a: Absence) => void;
  onEdit?: (a: Absence) => void;
}) {
  const today = todayIso();

  const playerRows: Row[] = players
    .map((p) => ({ id: p.id, name: p.name, absences: absences.filter((a) => a.player_id === p.id) }))
    .filter((r) => r.absences.length > 0)
    .sort((a, b) => a.absences[0].from.localeCompare(b.absences[0].from));

  const staffRows: Row[] = staff
    .map((s) => ({ id: s.id, name: s.name, absences: absences.filter((a) => a.staff_id === s.id) }))
    .filter((r) => r.absences.length > 0)
    .sort((a, b) => a.absences[0].from.localeCompare(b.absences[0].from));

  if (absences.length === 0) {
    return <p className="text-sm text-slate-500">Nog geen afwezigheden geregistreerd.</p>;
  }

  const allDates = absences.flatMap((a) => [a.from, a.until]);
  const earliest = allDates.reduce((min, d) => (d < min ? d : min), today);
  const latest = allDates.reduce((max, d) => (d > max ? d : max), today);
  const rangeStart = startOfMonth(addDays(earliest, -3));
  const rangeEnd = addDays(addMonths(startOfMonth(latest), 1), -1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" /> nu afwezig
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> gepland
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" /> afgelopen
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 border-l border-dashed border-rose-300" /> vandaag
        </span>
      </div>
      <TimelineSection title="Spelers" rows={playerRows} rangeStart={rangeStart} rangeEnd={rangeEnd} today={today} onRemove={onRemove} onEdit={onEdit} />
      <TimelineSection title="Staf" rows={staffRows} rangeStart={rangeStart} rangeEnd={rangeEnd} today={today} onRemove={onRemove} onEdit={onEdit} />
    </div>
  );
}
