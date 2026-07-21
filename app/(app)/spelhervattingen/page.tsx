"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Button, Card, Message, PageTitle, inputCls } from "@/components/ui";
import { DrawingThumbnail, TacticsBoardEditor } from "@/components/TacticsBoard";
import {
  DrawingElement,
  Player,
  SET_PIECE_CATEGORIES,
  SET_PIECE_CATEGORY_LABELS,
  SET_PIECE_SIDES,
  SET_PIECE_SIDE_LABELS,
  SetPiece,
  SetPieceCategory,
  SetPieceSide,
} from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

export default function SpelhervattingenPage() {
  const canEdit = useCanEdit();
  const [setPieces, setSetPieces] = useState<SetPiece[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const [category, setCategory] = useState<SetPieceCategory>(SET_PIECE_CATEGORIES[0]);
  const [side, setSide] = useState<SetPieceSide>("attacking");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [drawing, setDrawing] = useState<DrawingElement[]>([]);

  const reload = () =>
    Promise.all([api.list("set_pieces"), api.list("players")])
      .then(([sp, p]) => {
        setSetPieces([...sp].sort((a, b) => a.title.localeCompare(b.title, "nl")));
        setPlayers(p);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  function resetForm() {
    setTitle("");
    setDescription("");
    setDrawing([]);
  }

  async function add() {
    if (!title.trim()) {
      setMsg("Vul een titel in.");
      setErr(true);
      return;
    }
    try {
      await api.create("set_pieces", {
        category,
        side,
        title: title.trim(),
        description: description.trim(),
        drawing,
        approved: true,
        suggested_by: "staff",
        suggested_by_player_id: null,
        created_at: new Date().toISOString(),
      });
      resetForm();
      await reload();
      setMsg("Spelhervatting toegevoegd.");
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    }
  }

  async function approve(sp: SetPiece) {
    await api.update("set_pieces", sp.id, { approved: true });
    await reload();
  }

  async function remove(sp: SetPiece) {
    if (!confirm(`"${sp.title}" verwijderen?`)) return;
    await api.remove("set_pieces", sp.id);
    await reload();
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  const suggestions = setPieces.filter((sp) => !sp.approved);
  const approved = setPieces.filter((sp) => sp.approved);

  function suggesterName(sp: SetPiece): string {
    if (sp.suggested_by === "staff") return "Staf";
    return players.find((p) => p.id === sp.suggested_by_player_id)?.name ?? "Speler";
  }

  return (
    <div>
      <PageTitle
        title="Spelhervattingen"
        subtitle="Corners, vrije trappen, aftrap, inworp en keeperbal — los van de wedstrijdvoorbereiding. Spelers en staf kunnen voorstellen; de staf keurt goed of verwijdert. Kies vervolgens per wedstrijd welke gelden bij Wedstrijdvoorbereiding."
      />

      <Message text={msg} error={err} />

      {canEdit && suggestions.length > 0 && (
        <Card className="mb-6 mt-4 border-amber-200">
          <h2 className="mb-1 font-semibold">
            Suggesties <span className="text-sm font-normal text-slate-500">({suggestions.length})</span>
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Voorgesteld door spelers of staf — keur goed om beschikbaar te maken bij een wedstrijdvoorbereiding, of verwijder.
          </p>
          <div className="flex flex-col gap-2">
            {suggestions.map((sp) => (
              <div key={sp.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge color="amber">{SET_PIECE_CATEGORY_LABELS[sp.category]}</Badge>
                      <Badge color={sp.side === "attacking" ? "green" : "blue"}>{SET_PIECE_SIDE_LABELS[sp.side]}</Badge>
                      <span className="text-xs text-slate-500">voorgesteld door {suggesterName(sp)}</span>
                    </div>
                    <div className="mt-1 font-medium">{sp.title}</div>
                    {sp.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{sp.description}</p>}
                    {sp.drawing.length > 0 && (
                      <div className="mt-2">
                        <DrawingThumbnail strokes={sp.drawing} className="w-full max-w-[160px] rounded-lg border border-slate-200" />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button className="text-xs font-medium text-green-700 hover:underline" onClick={() => approve(sp)}>
                      ✓ Goedkeuren
                    </button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => remove(sp)}>
                      verwijderen
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {canEdit && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">Nieuwe spelhervatting toevoegen</h2>
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tekenen (optioneel)</label>
              <TacticsBoardEditor elements={drawing} onChange={setDrawing} />
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Categorie</label>
                <select className={`${inputCls} w-full`} value={category} onChange={(e) => setCategory(e.target.value as SetPieceCategory)}>
                  {SET_PIECE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{SET_PIECE_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Aanvallen of verdedigen</label>
                <div className="flex gap-2">
                  {SET_PIECE_SIDES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        side === s ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600"
                      }`}
                    >
                      {SET_PIECE_SIDE_LABELS[s]}
                    </button>
                  ))}
                </div>
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
                  placeholder="Wie staat waar, wie neemt 'm, looplijnen…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="mt-1">
                <Button onClick={add}>Toevoegen aan bank</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {SET_PIECE_CATEGORIES.map((cat) => {
        const inCategory = approved.filter((sp) => sp.category === cat);
        if (inCategory.length === 0) return null;
        return (
          <Card key={cat} className="mb-6">
            <h2 className="mb-3 font-semibold">{SET_PIECE_CATEGORY_LABELS[cat]}</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {SET_PIECE_SIDES.map((s) => {
                const items = inCategory.filter((sp) => sp.side === s);
                return (
                  <div key={s}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-700">{SET_PIECE_SIDE_LABELS[s]}</h3>
                    {items.length === 0 ? (
                      <p className="text-xs text-slate-400">Nog geen spelhervattingen.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {items.map((sp) => (
                          <div key={sp.id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium">{sp.title}</div>
                              {canEdit && (
                                <button className="shrink-0 text-xs text-red-500 hover:underline" onClick={() => remove(sp)}>
                                  verwijderen
                                </button>
                              )}
                            </div>
                            {sp.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">{sp.description}</p>}
                            {sp.drawing.length > 0 && (
                              <div className="mt-2">
                                <DrawingThumbnail strokes={sp.drawing} className="w-full max-w-[160px] rounded-lg border border-slate-200" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {approved.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">
            Nog geen goedgekeurde spelhervattingen. {canEdit ? "Voeg er hierboven één toe." : "Vraag de staf om er één toe te voegen."}
          </p>
        </Card>
      )}
    </div>
  );
}
