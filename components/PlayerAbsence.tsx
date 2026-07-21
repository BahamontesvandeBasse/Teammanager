"use client";

import { AbsenceStatus } from "@/lib/absence";
import { daysBetweenIso, formatDateShort, todayIso } from "@/lib/format";

export function AbsenceChip({ status }: { status: AbsenceStatus | null }) {
  if (!status) return null;
  const { kind, absence } = status;
  const current = kind === "current";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
        current ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200"
      }`}
    >
      <span aria-hidden>{current ? "🚫" : "🗓️"}</span>
      {current ? `Afwezig t/m ${formatDateShort(absence.until)}` : `Afwezig vanaf ${formatDateShort(absence.from)}`}
    </span>
  );
}

export function AbsenceBanner({ status }: { status: AbsenceStatus | null }) {
  if (!status) return null;
  const { kind, absence } = status;
  const current = kind === "current";
  const today = todayIso();
  const days = current ? daysBetweenIso(today, absence.until) : daysBetweenIso(today, absence.from);
  const dayLabel = `${days} ${days === 1 ? "dag" : "dagen"}`;

  return (
    <div
      className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 ${
        current ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${
          current ? "bg-rose-100" : "bg-amber-100"
        }`}
        aria-hidden
      >
        {current ? "🚫" : "🗓️"}
      </div>
      <div>
        <div className={`text-sm font-semibold ${current ? "text-rose-800" : "text-amber-800"}`}>
          {current ? "Momenteel afwezig" : "Binnenkort afwezig"}
        </div>
        <div className="mt-0.5 text-xs text-slate-600">
          {formatDateShort(absence.from)} t/m {formatDateShort(absence.until)}
          {" — "}
          {current ? `nog ${dayLabel}` : `over ${dayLabel}`}
          {absence.reason && <span> · {absence.reason}</span>}
        </div>
      </div>
    </div>
  );
}
