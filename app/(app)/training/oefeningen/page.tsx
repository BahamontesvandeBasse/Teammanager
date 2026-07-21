"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Badge, Button, Card, Message, PageTitle, inputCls } from "@/components/ui";
import { DrawingThumbnail, TacticsBoardEditor } from "@/components/TacticsBoard";
import {
  DrawingElement,
  EXERCISE_PHASES,
  EXERCISE_PHASE_ICON,
  EXERCISE_PHASE_LABELS,
  EXERCISE_SOURCE_LABELS,
  EXERCISE_SUBCATEGORIES,
  Exercise,
  ExercisePhase,
  ExerciseSource,
} from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

function sourceBadgeColor(source: ExerciseSource): "slate" | "green" | "amber" | "blue" {
  if (source === "ai") return "green";
  if (source === "rinus") return "blue";
  if (source === "feeton") return "amber";
  return "slate";
}

export default function OefeningenPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Laden…</p>}>
      <OefeningenPageInner />
    </Suspense>
  );
}

function OefeningenPageInner() {
  const canEdit = useCanEdit();
  const searchParams = useSearchParams();
  const initialPhase = searchParams.get("phase") as ExercisePhase | null;

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [phaseFilter, setPhaseFilter] = useState<ExercisePhase>(
    initialPhase && EXERCISE_PHASES.includes(initialPhase) ? initialPhase : EXERCISE_PHASES[0]
  );
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formPhase, setFormPhase] = useState<ExercisePhase>(phaseFilter);
  const [formSubcategory, setFormSubcategory] = useState(EXERCISE_SUBCATEGORIES[phaseFilter][0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("10");
  const [source, setSource] = useState<ExerciseSource>("handmatig");
  const [tags, setTags] = useState("");
  const [theme, setTheme] = useState("");
  const [drawing, setDrawing] = useState<DrawingElement[]>([]);

  const reload = () =>
    api
      .list("exercises")
      .then((rows) => setExercises([...rows].sort((a, b) => a.title.localeCompare(b.title, "nl"))))
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  function selectPhaseFilter(p: ExercisePhase) {
    setPhaseFilter(p);
    setSubcategoryFilter("");
    if (!editingId) setFormPhase(p);
  }

  function resetForm() {
    setEditingId(null);
    setFormPhase(phaseFilter);
    setFormSubcategory(EXERCISE_SUBCATEGORIES[phaseFilter][0]);
    setTitle("");
    setDescription("");
    setDuration("10");
    setSource("handmatig");
    setTags("");
    setTheme("");
    setDrawing([]);
  }

  function startEdit(ex: Exercise) {
    setEditingId(ex.id);
    setFormPhase(ex.phase);
    setFormSubcategory(ex.subcategory);
    setTitle(ex.title);
    setDescription(ex.description);
    setDuration(String(ex.duration_minutes));
    setSource(ex.source);
    setTags(ex.tags.join(", "));
    setDrawing(ex.drawing ?? []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generateWithAI() {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: formPhase, subcategory: formSubcategory, theme: theme.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Genereren mislukt");
      setTitle(body.title);
      setDescription(body.description);
      setDuration(String(body.duration_minutes));
      setSource("ai");
      setMsg("AI-voorstel ingevuld — pas aan waar nodig en klik op Opslaan.");
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!title.trim()) {
      setMsg("Vul een titel in.");
      setErr(true);
      return;
    }
    const payload = {
      phase: formPhase,
      subcategory: formSubcategory,
      title: title.trim(),
      description: description.trim(),
      duration_minutes: parseInt(duration, 10) || 10,
      source,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      drawing,
    };
    try {
      if (editingId) {
        await api.update("exercises", editingId, payload);
      } else {
        await api.create("exercises", { ...payload, created_at: new Date().toISOString() });
      }
      resetForm();
      await reload();
      setMsg(editingId ? "Oefening bijgewerkt." : "Oefening toegevoegd aan de bank.");
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    }
  }

  async function remove(ex: Exercise) {
    if (!confirm(`Oefening "${ex.title}" verwijderen uit de bank?`)) return;
    await api.remove("exercises", ex.id);
    if (editingId === ex.id) resetForm();
    await reload();
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  const visible = exercises
    .filter((e) => e.phase === phaseFilter)
    .filter((e) => (subcategoryFilter ? e.subcategory === subcategoryFilter : true))
    .filter((e) =>
      search.trim()
        ? `${e.title} ${e.description}`.toLowerCase().includes(search.trim().toLowerCase())
        : true
    );

  return (
    <div>
      <Link href="/training" className="mb-2 inline-block text-sm text-rose-600 hover:underline">← Terug naar Trainingsprogramma</Link>
      <PageTitle
        title="Oefeningenbank"
        subtitle="Onze eigen verzameling oefeningen per trainingsfase — handmatig toegevoegd, met AI gegenereerd, of overgetypt uit Rinus/Feeton."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {EXERCISE_PHASES.map((p) => (
          <button
            key={p}
            onClick={() => selectPhaseFilter(p)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              phaseFilter === p
                ? "border-rose-600 bg-rose-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:border-rose-300"
            }`}
          >
            <span aria-hidden>{EXERCISE_PHASE_ICON[p]}</span>
            {EXERCISE_PHASE_LABELS[p]}
            <span className="text-xs opacity-70">({exercises.filter((e) => e.phase === p).length})</span>
          </button>
        ))}
      </div>

      {canEdit && (
      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">{editingId ? "Oefening bewerken" : "Nieuwe oefening"}</h2>
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Oefening tekenen</label>
            <TacticsBoardEditor elements={drawing} onChange={setDrawing} />
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Fase</label>
              <select
                className={`${inputCls} w-full`}
                value={formPhase}
                onChange={(e) => {
                  const p = e.target.value as ExercisePhase;
                  setFormPhase(p);
                  setFormSubcategory(EXERCISE_SUBCATEGORIES[p][0]);
                }}
              >
                {EXERCISE_PHASES.map((p) => (
                  <option key={p} value={p}>{EXERCISE_PHASE_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Sub-categorie</label>
              <select className={`${inputCls} w-full`} value={formSubcategory} onChange={(e) => setFormSubcategory(e.target.value)}>
                {EXERCISE_SUBCATEGORIES[formPhase].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Titel</label>
              <input className={`${inputCls} w-full`} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Omschrijving</label>
              <textarea
                className={`${inputCls} w-full`}
                rows={3}
                placeholder="Opstelling, uitvoering, coaching-aandachtspunten"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Duur (min)</label>
              <input
                type="number"
                min={1}
                className={`${inputCls} w-full`}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Herkomst</label>
              <select className={`${inputCls} w-full`} value={source} onChange={(e) => setSource(e.target.value as ExerciseSource)}>
                {Object.entries(EXERCISE_SOURCE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tags (komma-gescheiden, optioneel)</label>
              <input className={`${inputCls} w-full`} value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <label className="mb-1 block text-xs font-medium text-slate-600">Thema/leerdoel voor AI (optioneel)</label>
              <input
                className={`${inputCls} w-full`}
                placeholder="bv. passing onder druk"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              />
              <div className="mt-2">
                <Button variant="secondary" onClick={generateWithAI} disabled={generating}>
                  {generating ? "Bezig…" : "✨ Genereer met AI"}
                </Button>
              </div>
            </div>

            <div className="mt-1 flex items-center gap-3">
              <Button onClick={save}>{editingId ? "Opslaan" : "Toevoegen aan bank"}</Button>
              {editingId && (
                <button className="text-xs text-slate-500 hover:underline" onClick={resetForm}>
                  annuleren
                </button>
              )}
            </div>
            <Message text={msg} error={err} />
          </div>
        </div>
      </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            {EXERCISE_PHASE_LABELS[phaseFilter]} <span className="text-sm font-normal text-slate-500">({visible.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select className={inputCls} value={subcategoryFilter} onChange={(e) => setSubcategoryFilter(e.target.value)}>
              <option value="">Alle sub-categorieën</option>
              {EXERCISE_SUBCATEGORIES[phaseFilter].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="Zoeken…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen oefeningen in deze categorie.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {visible.map((ex) => (
              <div key={ex.id} className="overflow-hidden rounded-lg border border-slate-200">
                {ex.drawing && ex.drawing.length > 0 ? (
                  <DrawingThumbnail strokes={ex.drawing} className="block w-full" />
                ) : (
                  <div className="flex aspect-[380/600] w-full items-center justify-center bg-slate-50 text-slate-400">
                    <span className="text-3xl" aria-hidden>🎨</span>
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold leading-snug">{ex.title}</div>
                    <span className="shrink-0 text-xs font-medium text-slate-500">{ex.duration_minutes}&apos;</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge>{ex.subcategory}</Badge>
                    <Badge color={sourceBadgeColor(ex.source)}>{EXERCISE_SOURCE_LABELS[ex.source]}</Badge>
                  </div>
                  {ex.description && (
                    <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">{ex.description}</p>
                  )}
                  {ex.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {ex.tags.map((t) => (
                        <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">#{t}</span>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                  <div className="mt-2 flex gap-3">
                    <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => startEdit(ex)}>
                      bewerken
                    </button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => remove(ex)}>
                      verwijderen
                    </button>
                  </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
