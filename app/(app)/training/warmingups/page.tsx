"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Card, Message, PageTitle, inputCls } from "@/components/ui";
import { WarmingUp } from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

export default function WarmingUpsPage() {
  const canEdit = useCanEdit();
  const [warmups, setWarmups] = useState<WarmingUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = () =>
    api
      .list("warmups")
      .then((w) => setWarmups([...w].sort((a, b) => a.name.localeCompare(b.name, "nl"))))
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  function startEdit(w: WarmingUp) {
    setEditingId(w.id);
    setName(w.name);
    setDescription(w.description ?? "");
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
  }

  async function save() {
    if (!name.trim()) {
      setMsg("Vul een naam in.");
      setErr(true);
      return;
    }
    try {
      if (editingId) {
        await api.update("warmups", editingId, { name: name.trim(), description: description.trim() || null });
      } else {
        await api.create("warmups", { name: name.trim(), description: description.trim() || null });
      }
      resetForm();
      await reload();
      setMsg(editingId ? "Warming-up bijgewerkt." : "Warming-up toegevoegd.");
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    }
  }

  async function remove(w: WarmingUp) {
    if (!confirm(`Warming-up "${w.name}" verwijderen?`)) return;
    await api.remove("warmups", w.id);
    if (editingId === w.id) resetForm();
    await reload();
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  return (
    <div>
      <Link href="/training" className="mb-2 inline-block text-sm text-rose-600 hover:underline">← Terug naar Trainingsprogramma</Link>
      <PageTitle
        title="Warming-ups"
        subtitle="Bibliotheek met warming-up routines. Kies er per wedstrijd één bij de wedstrijdvoorbereiding."
      />

      {canEdit && (
      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">{editingId ? "Warming-up bewerken" : "Nieuwe warming-up"}</h2>
        <div className="grid gap-3">
          <input
            className={inputCls}
            placeholder="Naam (bv. Activatie met bal)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className={inputCls}
            rows={4}
            placeholder="Oefeningen/opbouw (optioneel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={save}>{editingId ? "Opslaan" : "Toevoegen"}</Button>
          {editingId && (
            <button className="text-xs text-slate-500 hover:underline" onClick={resetForm}>
              annuleren
            </button>
          )}
        </div>
        <Message text={msg} error={err} />
      </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">
          Alle warming-ups <span className="text-sm font-normal text-slate-500">({warmups.length})</span>
        </h2>
        {warmups.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen warming-ups toegevoegd.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {warmups.map((w) => (
              <div key={w.id} className="rounded-lg border border-slate-200 p-3">
                <div className="font-medium">{w.name}</div>
                {w.description && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{w.description}</p>}
                {canEdit && (
                <div className="mt-2 flex gap-3">
                  <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => startEdit(w)}>
                    bewerken
                  </button>
                  <button className="text-xs text-red-500 hover:underline" onClick={() => remove(w)}>
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
