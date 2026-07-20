"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, todayIso } from "@/lib/format";
import { isTrainingActivity, totalMinutes } from "@/lib/training";
import { Badge, Card, PageTitle } from "@/components/ui";
import {
  EXERCISE_PHASES,
  EXERCISE_PHASE_ICON,
  EXERCISE_PHASE_LABELS,
  Exercise,
  IndividualTraining,
  LoadEntry,
  ScheduleItem,
  TrainingPhase,
  TrainingSession,
  WarmingUp,
} from "@/lib/types";

function TrainingTile({ item, phases }: { item: ScheduleItem; phases: TrainingPhase[] }) {
  return (
    <Link href={`/training/${item.id}`}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {formatDate(item.date)}
            </div>
            <h2 className="mt-0.5 font-semibold capitalize">{item.activity}</h2>
          </div>
          {phases.length > 0 && <Badge color="green">{totalMinutes(phases)} min</Badge>}
        </div>
        {phases.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
            {phases.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate">{p.fase}</span>
                <span className="shrink-0 text-slate-400">{p.duur_minuten}&apos;</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-slate-400">Nog leeg — klik om oefeningen toe te voegen.</p>
        )}
      </Card>
    </Link>
  );
}

function loadSummary(item: ScheduleItem, load: LoadEntry[]) {
  const entries = load.filter((l) => l.date === item.date && l.session_type === "training");
  if (entries.length === 0) return null;
  const present = entries.filter((l) => !l.absent && l.rpe !== null);
  const absentCount = entries.filter((l) => l.absent).length;
  const avgRpe = present.length > 0 ? present.reduce((s, l) => s + (l.rpe ?? 0), 0) / present.length : null;
  return { total: entries.length, avgRpe, absentCount };
}

export default function TrainingPage() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [individual, setIndividual] = useState<IndividualTraining[]>([]);
  const [warmups, setWarmups] = useState<WarmingUp[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [load, setLoad] = useState<LoadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    Promise.all([
      api.list("schedule_items"),
      api.list("training_sessions"),
      api.list("individual_trainings"),
      api.list("warmups"),
      api.list("exercises"),
      api.list("load_entries"),
    ])
      .then(([si, ts, it, wu, ex, le]) => {
        setItems(si.filter((i) => isTrainingActivity(i.activity)).sort((a, b) => a.date.localeCompare(b.date)));
        setSessions(ts);
        setIndividual(it);
        setWarmups(wu);
        setExercises(ex);
        setLoad(le);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500">Laden…</p>;

  const openCount = individual.filter((t) => t.status === "open").length;
  const today = todayIso();
  const upcoming = items.filter((i) => i.date >= today);
  const past = [...items.filter((i) => i.date < today)].reverse();

  return (
    <div>
      <PageTitle
        title="Trainingsprogramma"
        subtitle="Onze eigen oefeningenbank per trainingsfase, en daaronder alle trainingen met hun fase-opbouw."
      />

      <h2 className="mb-3 font-semibold text-slate-700">Oefeningenbank</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Link href="/training/individueel">
          <Card className="h-full border-rose-200 bg-gradient-to-br from-rose-50 to-white transition-shadow hover:shadow-md">
            <div className="text-2xl">🏋️</div>
            <h3 className="mt-2 font-semibold">Individuele trainingen</h3>
            <p className="mt-1 text-sm text-slate-500">
              Persoonlijke trainingsopdrachten per speler, los van de teamtrainingen.
            </p>
            <div className="mt-3">
              <Badge color={openCount > 0 ? "amber" : "green"}>{openCount} open</Badge>
            </div>
          </Card>
        </Link>

        {EXERCISE_PHASES.map((phase) => {
          const count = exercises.filter((e) => e.phase === phase).length;
          return (
            <Link key={phase} href={`/training/oefeningen?phase=${phase}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="text-2xl">{EXERCISE_PHASE_ICON[phase]}</div>
                <h3 className="mt-2 font-semibold">{EXERCISE_PHASE_LABELS[phase]}</h3>
                <p className="mt-1 text-sm text-slate-500">Oefeningenbank doorzoeken en aanvullen.</p>
                <div className="mt-3">
                  <Badge color={count > 0 ? "green" : "slate"}>{count} oefening{count === 1 ? "" : "en"}</Badge>
                </div>
              </Card>
            </Link>
          );
        })}

        <Link href="/training/warmingups">
          <Card className="h-full border-amber-200 bg-gradient-to-br from-amber-50 to-white transition-shadow hover:shadow-md">
            <div className="text-2xl">⚽</div>
            <h3 className="mt-2 font-semibold">Warming-up wedstrijden</h3>
            <p className="mt-1 text-sm text-slate-500">
              Aparte bibliotheek: te kiezen per wedstrijd bij de wedstrijdvoorbereiding.
            </p>
            <div className="mt-3">
              <Badge color="slate">{warmups.length} routines</Badge>
            </div>
          </Card>
        </Link>
      </div>

      <h2 className="mb-3 font-semibold text-slate-700">
        Komende trainingen <span className="text-sm font-normal text-slate-500">({upcoming.length})</span>
      </h2>
      {upcoming.length === 0 ? (
        <p className="mb-8 text-sm text-slate-500">Geen komende trainingen gepland.</p>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((item) => {
            const session = sessions.find((s) => s.schedule_item_id === item.id);
            return <TrainingTile key={item.id} item={item} phases={session?.phases ?? []} />;
          })}
        </div>
      )}

      {items.length === 0 && (
        <p className="mb-8 text-sm text-slate-500">
          Nog geen trainingen in de Seizoensplanning. Voeg trainingen toe via de{" "}
          <Link href="/planning" className="text-rose-600 hover:underline">Seizoensplanning-pagina</Link>.
        </p>
      )}

      {past.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchive((v) => !v)}
            className="mb-3 flex items-center gap-2 font-semibold text-slate-700 hover:text-rose-600"
          >
            <span className={`inline-block transition-transform ${showArchive ? "rotate-90" : ""}`}>›</span>
            Afgeronde trainingen (archief)
            <span className="text-sm font-normal text-slate-500">({past.length})</span>
          </button>

          {showArchive && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((item) => {
                const session = sessions.find((s) => s.schedule_item_id === item.id);
                const phases = session?.phases ?? [];
                const summary = loadSummary(item, load);
                return (
                  <div key={item.id} className="relative">
                    <TrainingTile item={item} phases={phases} />
                    {summary && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500">
                        <span>📋 {summary.total} ingevuld</span>
                        {summary.avgRpe !== null && <span>· gem. RPE {summary.avgRpe.toFixed(1)}</span>}
                        {summary.absentCount > 0 && (
                          <span className="text-amber-600">· {summary.absentCount} afwezig</span>
                        )}
                        <Link href="/belasting" className="text-rose-600 hover:underline">
                          bekijk belasting →
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
