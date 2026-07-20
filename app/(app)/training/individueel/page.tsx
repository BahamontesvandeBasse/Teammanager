"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDateShort } from "@/lib/format";
import { Badge, Button, Card, Message, PageTitle, inputCls } from "@/components/ui";
import { IndividualTraining, Player } from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";
import {
  CATEGORY_ORDER,
  TRAINING_CATEGORY_ICON,
  TRAINING_CATEGORY_LABELS,
  TRAINING_TEMPLATES,
  TrainingTemplate,
} from "@/lib/trainingTemplates";

export default function IndividueelPage() {
  const canEdit = useCanEdit();
  const [players, setPlayers] = useState<Player[]>([]);
  const [trainings, setTrainings] = useState<IndividualTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [filterPlayer, setFilterPlayer] = useState<string>("");
  const [showDone, setShowDone] = useState(false);

  // Formulier
  const [playerId, setPlayerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  const reload = () =>
    Promise.all([api.list("players"), api.list("individual_trainings")])
      .then(([p, t]) => {
        setPlayers([...p].sort((a, b) => a.name.localeCompare(b.name, "nl")));
        setTrainings(t);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? "?";

  async function addTraining() {
    if (!playerId || !title.trim()) {
      setMsg("Kies een speler en vul een titel in.");
      setErr(true);
      return;
    }
    await api.create("individual_trainings", {
      player_id: playerId,
      title: title.trim(),
      description: description.trim() || null,
      target_date: targetDate || null,
      status: "open",
      notes: null,
      created_at: new Date().toISOString(),
      created_by: "staff",
    });
    setTitle("");
    setDescription("");
    setTargetDate("");
    await reload();
    setMsg("Trainingsopdracht toegevoegd.");
    setErr(false);
  }

  function applyTemplate(template: TrainingTemplate) {
    setTitle(template.title);
    setDescription(template.description);
    setMsg(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleStatus(t: IndividualTraining) {
    await api.update("individual_trainings", t.id, {
      status: t.status === "open" ? "voltooid" : "open",
    });
    await reload();
  }

  async function removeTraining(t: IndividualTraining) {
    if (!confirm(`Opdracht "${t.title}" voor ${playerName(t.player_id)} verwijderen?`)) return;
    await api.remove("individual_trainings", t.id);
    await reload();
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  const visible = trainings
    .filter((t) => (filterPlayer ? t.player_id === filterPlayer : true))
    .filter((t) => (showDone ? true : t.status === "open"))
    .sort((a, b) => (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"));

  const openCount = trainings.filter((t) => t.status === "open").length;

  return (
    <div>
      <Link href="/training" className="mb-2 inline-block text-sm text-rose-600 hover:underline">← Terug naar Trainingsprogramma</Link>
      <PageTitle
        title="Individuele conditionele trainingsvormen"
        subtitle="Individuele en extra trainingsopdrachten per speler, met streefdatum en status."
      />

      <div ref={formRef} />
      {canEdit && (
      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Nieuwe opdracht</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <select className={inputCls} value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="">— Kies speler —</option>
            {players.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            className={inputCls}
            placeholder="Titel (bv. Sprinttechniek verbeteren)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className={`${inputCls} md:col-span-2`}
            rows={2}
            placeholder="Omschrijving/focus (optioneel): oefeningen, aandachtspunten…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Streefdatum:</label>
            <input type="date" className={inputCls} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={addTraining}>Toevoegen</Button>
        </div>
        <Message text={msg} error={err} />
      </Card>
      )}

      {canEdit && (
      <Card className="mb-6">
        <h2 className="mb-1 font-semibold">Extra trainingen</h2>
        <p className="mb-4 text-xs text-slate-500">
          Conditieopbouw voor het voorseizoen, geschikt voor JO19 2e klasse — 3 met bal, 3 zuivere hardlooptraining, 3 in
          een alternatieve sport. Allemaal in je eentje uit te voeren, geen teamgenoten of tegenstander nodig. Klik op
          &quot;Toewijzen&quot; om de titel/omschrijving in het formulier hierboven te zetten en kies daar de speler en
          streefdatum.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat}>
              <h3 className="mb-2 text-sm font-semibold text-slate-600">
                {TRAINING_CATEGORY_ICON[cat]} {TRAINING_CATEGORY_LABELS[cat]}
              </h3>
              <div className="flex flex-col gap-2">
                {TRAINING_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                  <div key={t.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="text-sm font-medium">{t.title}</div>
                    <p className="mt-1 text-xs text-slate-500">{t.description}</p>
                    <button
                      onClick={() => applyTemplate(t)}
                      className="mt-2 text-xs font-medium text-emerald-700 hover:underline"
                    >
                      + Toewijzen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Opdrachten <span className="text-sm font-normal text-slate-500">({openCount} open)</span>
          </h2>
          <div className="flex items-center gap-3">
            <select className={inputCls} value={filterPlayer} onChange={(e) => setFilterPlayer(e.target.value)}>
              <option value="">Alle spelers</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm text-slate-600">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              toon voltooid
            </label>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-slate-500">Geen opdrachten gevonden.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((t) => (
              <div
                key={t.id}
                className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 ${
                  t.status === "voltooid" ? "border-slate-100 bg-slate-50 opacity-70" : "border-slate-200"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{playerName(t.player_id)}</span>
                    <Badge color={t.status === "open" ? "amber" : "green"}>
                      {t.status === "open" ? "Open" : "Voltooid"}
                    </Badge>
                    {t.created_by === "player" && <Badge color="blue">📱 zelf gekozen</Badge>}
                    {t.target_date && (
                      <span className="text-xs text-slate-500">streefdatum {formatDateShort(t.target_date)}</span>
                    )}
                  </div>
                  <div className={`mt-1 text-sm ${t.status === "voltooid" ? "line-through" : ""}`}>{t.title}</div>
                  {t.description && <div className="mt-0.5 text-xs text-slate-500">{t.description}</div>}
                </div>
                {canEdit && (
                <div className="flex shrink-0 items-center gap-3">
                  <Button variant="secondary" onClick={() => toggleStatus(t)}>
                    {t.status === "open" ? "✓ Voltooid" : "Heropen"}
                  </Button>
                  <button className="text-xs text-red-500 hover:underline" onClick={() => removeTraining(t)}>
                    verwijderen
                  </button>
                </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
