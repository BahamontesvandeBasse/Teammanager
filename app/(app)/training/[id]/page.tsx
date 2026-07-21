"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { totalMinutes } from "@/lib/training";
import { Badge, Button, Card, Message, PageTitle, inputCls } from "@/components/ui";
import { DrawingThumbnail } from "@/components/TacticsBoard";
import {
  EXERCISE_PHASES,
  EXERCISE_PHASE_ICON,
  EXERCISE_PHASE_LABELS,
  EXERCISE_SOURCE_LABELS,
  Exercise,
  ExercisePhase,
  ScheduleItem,
  TrainingPhase,
  TrainingSession,
} from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

export default function TrainingSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const canEdit = useCanEdit();
  const { id } = use(params);

  const [item, setItem] = useState<ScheduleItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [phases, setPhases] = useState<TrainingPhase[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [pickPhase, setPickPhase] = useState<ExercisePhase>(EXERCISE_PHASES[0]);
  const [pickExerciseId, setPickExerciseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([api.list("schedule_items"), api.list("training_sessions"), api.list("exercises")])
      .then(([items, sessions, ex]) => {
        const found = items.find((i) => i.id === id) ?? null;
        if (!found) {
          setNotFound(true);
          return;
        }
        setItem(found);
        const existing = sessions.find((s) => s.schedule_item_id === id) ?? null;
        setSession(existing);
        setPhases(existing ? existing.phases : []);
        setExercises(ex);
      })
      .finally(() => setLoading(false));
  }, [id]);

  function updatePhase(index: number, field: "fase" | "wat" | "duur_minuten", value: string) {
    setDirty(true);
    setPhases((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, [field]: field === "duur_minuten" ? parseInt(value, 10) || 0 : value } : p
      )
    );
  }

  function addPhase() {
    setDirty(true);
    setPhases((prev) => [...prev, { fase: "", wat: "", duur_minuten: 0, exercise_id: null }]);
  }

  function addExerciseFromBank() {
    const exercise = exercises.find((e) => e.id === pickExerciseId);
    if (!exercise) return;
    setDirty(true);
    setPhases((prev) => [
      ...prev,
      {
        fase: EXERCISE_PHASE_LABELS[exercise.phase],
        wat: exercise.title,
        duur_minuten: exercise.duration_minutes,
        exercise_id: exercise.id,
      },
    ]);
    setPickExerciseId("");
  }

  function removePhase(index: number) {
    setDirty(true);
    setPhases((prev) => prev.filter((_, i) => i !== index));
  }

  function movePhase(index: number, dir: -1 | 1) {
    setDirty(true);
    setPhases((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    try {
      if (session) {
        await api.update("training_sessions", session.id, { phases });
      } else {
        const [created] = await api.create("training_sessions", { schedule_item_id: id, phases });
        setSession(created);
      }
      setDirty(false);
      setMsg("Trainingsschema opgeslagen.");
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    }
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;
  if (notFound || !item) {
    return (
      <div>
        <PageTitle title="Training niet gevonden" />
        <Link href="/training" className="text-sm text-rose-600 hover:underline">← Terug naar Trainingsprogramma</Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/training" className="mb-2 inline-block text-sm text-rose-600 hover:underline">← Terug naar Trainingsprogramma</Link>
      <PageTitle title={item.activity} subtitle={`${formatDate(item.date)}${item.kickoff_time ? ` · aanvang ${item.kickoff_time}` : ""}`} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge color="green">⏱ {totalMinutes(phases)} min totaal</Badge>
        <Badge>{phases.length} onderdeel{phases.length === 1 ? "" : "en"}</Badge>
        {canEdit && (
        <div className="ml-auto flex gap-2">
          <Button onClick={save} disabled={!dirty}>{dirty ? "Opslaan" : "Opgeslagen ✓"}</Button>
        </div>
        )}
      </div>

      <Message text={msg} error={err} />

      <fieldset disabled={!canEdit} className="contents">
      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Oefening toevoegen uit de bank</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Fase</label>
            <select
              className={inputCls}
              value={pickPhase}
              onChange={(e) => {
                setPickPhase(e.target.value as ExercisePhase);
                setPickExerciseId("");
              }}
            >
              {EXERCISE_PHASES.map((p) => (
                <option key={p} value={p}>{EXERCISE_PHASE_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[14rem]">
            <label className="mb-1 block text-xs font-medium text-slate-600">Oefening</label>
            <select className={`${inputCls} w-full`} value={pickExerciseId} onChange={(e) => setPickExerciseId(e.target.value)}>
              <option value="">— Kies een oefening —</option>
              {exercises.filter((e) => e.phase === pickPhase).map((e) => (
                <option key={e.id} value={e.id}>{e.title} ({e.duration_minutes} min)</option>
              ))}
            </select>
          </div>
          <Button variant="secondary" onClick={addExerciseFromBank} disabled={!pickExerciseId}>
            + Toevoegen aan training
          </Button>
          <Link href={`/training/oefeningen?phase=${pickPhase}`} className="text-xs text-rose-600 hover:underline">
            bank beheren →
          </Link>
          <button className="text-xs text-slate-500 hover:underline" onClick={addPhase}>
            of voeg een losse fase toe zonder de bank
          </button>
        </div>
      </Card>

      {phases.length === 0 ? (
        <p className="text-sm text-slate-500">Nog geen onderdelen in deze training.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {phases.map((p, i) => {
            const exercise = p.exercise_id ? exercises.find((e) => e.id === p.exercise_id) ?? null : null;
            const phaseKey = EXERCISE_PHASES.find((ph) => EXERCISE_PHASE_LABELS[ph] === p.fase);
            const descLines = exercise?.description.split(/\n+/).map((l) => l.trim()).filter(Boolean) ?? [];

            return (
              <Card key={i} className="relative">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">
                    {i + 1}
                  </div>

                  <div className="min-w-[16rem] flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge color="slate">
                        {phaseKey ? `${EXERCISE_PHASE_ICON[phaseKey]} ` : ""}
                        {p.fase || "Fase"}
                      </Badge>
                      {exercise && <Badge color="blue">{exercise.subcategory}</Badge>}
                      {exercise && <Badge color={exercise.source === "ai" ? "green" : "amber"}>{EXERCISE_SOURCE_LABELS[exercise.source]}</Badge>}
                    </div>

                    <input
                      className="w-full bg-transparent text-lg font-semibold text-slate-900 outline-none"
                      value={p.wat}
                      placeholder="Titel/inhoud"
                      onChange={(e) => updatePhase(i, "wat", e.target.value)}
                    />

                    {exercise ? (
                      descLines.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                          {descLines.map((line, li) => (
                            <li key={li}>{line}</li>
                          ))}
                        </ul>
                      )
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">Losse fase — niet gekoppeld aan de oefeningenbank.</p>
                    )}

                    {exercise && exercise.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {exercise.tags.map((t) => (
                          <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">#{t}</span>
                        ))}
                      </div>
                    )}

                    {exercise && (
                      <Link
                        href={`/training/oefeningen?phase=${exercise.phase}`}
                        className="mt-2 inline-block text-xs text-rose-600 hover:underline"
                      >
                        bewerk in de bank →
                      </Link>
                    )}
                  </div>

                  {exercise && exercise.drawing && exercise.drawing.length > 0 && (
                    <div className="shrink-0">
                      <DrawingThumbnail strokes={exercise.drawing} />
                    </div>
                  )}

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        className={`${inputCls} w-16 text-right`}
                        value={p.duur_minuten || ""}
                        onChange={(e) => updatePhase(i, "duur_minuten", e.target.value)}
                      />
                      <span className="text-xs text-slate-500">min</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                        onClick={() => movePhase(i, -1)}
                        disabled={i === 0}
                        title="Omhoog"
                      >
                        ↑
                      </button>
                      <button
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                        onClick={() => movePhase(i, 1)}
                        disabled={i === phases.length - 1}
                        title="Omlaag"
                      >
                        ↓
                      </button>
                    </div>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => removePhase(i)}>
                      verwijderen
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button className="text-xs text-slate-500 hover:underline" onClick={addPhase}>
          + Losse fase toevoegen
        </button>
        <Button onClick={save} disabled={!dirty}>{dirty ? "Opslaan" : "Opgeslagen ✓"}</Button>
      </div>
      </fieldset>
    </div>
  );
}
