"use client";

import { use, useEffect, useRef, useState } from "react";
import { formatDate, formatDateShort, todayIso } from "@/lib/format";
import { DrawingThumbnail, TacticsBoardEditor } from "@/components/TacticsBoard";
import { DrawingElement, IndividualTraining, LoadEntry, Message, SET_PIECE_CATEGORIES, SET_PIECE_CATEGORY_LABELS, SET_PIECE_SIDE_LABELS, SetPiece, SetPieceCategory, SetPieceSide } from "@/lib/types";
import {
  CATEGORY_ORDER,
  TRAINING_CATEGORY_ICON,
  TRAINING_CATEGORY_LABELS,
  TRAINING_TEMPLATES,
  TrainingTemplate,
} from "@/lib/trainingTemplates";

type ApiData = {
  player: { id: string; name: string };
  entries: LoadEntry[];
  messages: Message[];
  trainings: IndividualTraining[];
  setPieces: SetPiece[];
  currentAbsence: { until: string; reason: string | null } | null;
};

export default function PlayerCheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [data, setData] = useState<ApiData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const [date, setDate] = useState(todayIso());
  const [sessionType, setSessionType] = useState<"training" | "wedstrijd">("training");
  const [minutes, setMinutes] = useState("90");
  const [rpe, setRpe] = useState<number | null>(null);
  const [fatigue, setFatigue] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [injuryFlag, setInjuryFlag] = useState(false);
  const [notes, setNotes] = useState("");

  const [chatBody, setChatBody] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [loggingTraining, setLoggingTraining] = useState<string | null>(null);
  const [trainingMsg, setTrainingMsg] = useState<string | null>(null);
  const checkinRef = useRef<HTMLDivElement>(null);

  const [spCategory, setSpCategory] = useState<SetPieceCategory>(SET_PIECE_CATEGORIES[0]);
  const [spSide, setSpSide] = useState<SetPieceSide>("attacking");
  const [spTitle, setSpTitle] = useState("");
  const [spDescription, setSpDescription] = useState("");
  const [spDrawing, setSpDrawing] = useState<DrawingElement[]>([]);
  const [spDrawingOpen, setSpDrawingOpen] = useState(false);
  const [spBusy, setSpBusy] = useState(false);
  const [spMsg, setSpMsg] = useState<string | null>(null);

  const reload = () =>
    fetch(`/api/mijn/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true);
          return;
        }
        setData(await r.json());
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  function selectSessionType(t: "training" | "wedstrijd") {
    setSessionType(t);
    setMinutes(t === "training" ? "90" : "80");
  }

  async function submit() {
    if (!rpe) {
      setMsg("Vul in ieder geval in hoe zwaar het was (RPE).");
      setErr(true);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/mijn/${token}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          session_type: sessionType,
          minutes: parseInt(minutes, 10) || 0,
          rpe,
          fatigue,
          soreness,
          injury_flag: injuryFlag,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Opslaan mislukt");
      }
      setMsg("Bedankt! Je invoer is opgeslagen. 💪");
      setErr(false);
      setRpe(null);
      setFatigue(null);
      setSoreness(null);
      setInjuryFlag(false);
      setNotes("");
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setSaving(false);
    }
  }

  async function logExtraTraining(template: TrainingTemplate) {
    setLoggingTraining(template.id);
    try {
      const res = await fetch(`/api/mijn/${token}/extra-training`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: template.title, description: template.description }),
      });
      if (!res.ok) throw new Error("Opslaan mislukt");
      setTrainingMsg(`"${template.title}" gelogd! Wil je hieronder ook je belasting invullen? (optioneel)`);
      await reload();
      checkinRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setTrainingMsg("Er ging iets mis, probeer het nog eens.");
    } finally {
      setLoggingTraining(null);
    }
  }

  async function submitSetPiece() {
    if (!spTitle.trim()) {
      setSpMsg("Vul een titel in.");
      return;
    }
    setSpBusy(true);
    try {
      const res = await fetch(`/api/mijn/${token}/set-piece-suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: spCategory,
          side: spSide,
          title: spTitle.trim(),
          description: spDescription.trim(),
          drawing: spDrawing,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Versturen mislukt");
      }
      setSpMsg("Bedankt! De staf bekijkt je voorstel.");
      setSpTitle("");
      setSpDescription("");
      setSpDrawing([]);
      setSpDrawingOpen(false);
      await reload();
    } catch (e) {
      setSpMsg((e as Error).message);
    } finally {
      setSpBusy(false);
    }
  }

  async function sendMessage() {
    if (!chatBody.trim()) return;
    setChatBusy(true);
    try {
      await fetch(`/api/mijn/${token}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: chatBody.trim() }),
      });
      setChatBody("");
      await reload();
    } finally {
      setChatBusy(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Laden…</div>;
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <div className="text-3xl">🔗❌</div>
          <p className="mt-2 font-semibold">Deze link is niet (meer) geldig.</p>
          <p className="text-sm text-slate-500">Vraag de trainer om een nieuwe link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="bg-rose-700 px-4 py-5 text-white">
        <div className="text-xs uppercase tracking-wide text-rose-100">Sv Steenwijkerwold JO19-1</div>
        <h1 className="text-xl font-bold">Hoi {data.player.name} 👋</h1>
      </header>

      <main className="mx-auto max-w-md px-4 pt-5">
        {data.currentAbsence && (
          <section className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="font-semibold">🚫 Je staat als afwezig geregistreerd</div>
            <p className="mt-1">
              Tot en met {formatDate(data.currentAbsence.until)}
              {data.currentAbsence.reason ? ` — ${data.currentAbsence.reason}` : ""}. De intensiteit-invoer hieronder staat
              daarom uit. Klopt dit niet (meer)? Stuur de staf een bericht onderaan deze pagina.
            </p>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 font-semibold">Extra trainingen 🎯</h2>
          <p className="mb-3 text-xs text-slate-500">
            Vrijblijvend — kies er zelf één om in je eentje te doen. Vul daarna hieronder optioneel je belasting in.
          </p>
          <div className="flex flex-col gap-3">
            {CATEGORY_ORDER.map((cat) => (
              <div key={cat}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {TRAINING_CATEGORY_ICON[cat]} {TRAINING_CATEGORY_LABELS[cat]}
                </h3>
                <div className="flex flex-col gap-2">
                  {TRAINING_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                    <div key={t.id} className="rounded-lg border border-slate-200 p-2.5">
                      <div className="text-sm font-medium">{t.title}</div>
                      <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>
                      <button
                        onClick={() => logExtraTraining(t)}
                        disabled={loggingTraining === t.id}
                        className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 disabled:opacity-50"
                      >
                        {loggingTraining === t.id ? "Bezig…" : "✓ Ik doe/deed deze"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {trainingMsg && (
            <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{trainingMsg}</div>
          )}

          {data.trainings.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Jouw laatste extra trainingen</h3>
              <div className="flex flex-col gap-1">
                {data.trainings.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex justify-between text-xs text-slate-600">
                    <span>{t.title}</span>
                    <span className="shrink-0 text-slate-500">{t.target_date ? formatDateShort(t.target_date) : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 font-semibold">Spelhervattingen 🚩</h2>
          <p className="mb-3 text-xs text-slate-500">
            Heb je een idee voor een corner, vrije trap, aftrap, inworp of keeperbal? Stel &apos;m voor — de staf bekijkt en keurt goed.
          </p>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <select
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={spCategory}
                onChange={(e) => setSpCategory(e.target.value as SetPieceCategory)}
              >
                {SET_PIECE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{SET_PIECE_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
              <div className="flex gap-1">
                {(["attacking", "defending"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpSide(s)}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium ${
                      spSide === s ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600"
                    }`}
                  >
                    {SET_PIECE_SIDE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              placeholder="Titel, bv. 'Korte corner naar de rand'"
              value={spTitle}
              onChange={(e) => setSpTitle(e.target.value)}
            />
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              rows={2}
              placeholder="Omschrijving (optioneel)"
              value={spDescription}
              onChange={(e) => setSpDescription(e.target.value)}
            />

            {spDrawingOpen ? (
              <div className="rounded-lg border border-slate-200 p-2">
                <TacticsBoardEditor elements={spDrawing} onChange={setSpDrawing} />
                <button
                  onClick={() => setSpDrawingOpen(false)}
                  className="mt-2 text-xs text-slate-500 hover:underline"
                >
                  tekening inklappen
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSpDrawingOpen(true)}
                className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500"
              >
                {spDrawing.length > 0 ? "✏️ Tekening bewerken" : "🎨 Tekening toevoegen (optioneel)"}
              </button>
            )}

            <button
              onClick={submitSetPiece}
              disabled={spBusy || !spTitle.trim()}
              className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
            >
              {spBusy ? "Bezig…" : "Voorstel versturen"}
            </button>
            {spMsg && <div className="text-xs text-slate-600">{spMsg}</div>}
          </div>

          {data.setPieces.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Jouw voorstellen</h3>
              <div className="flex flex-col gap-2">
                {data.setPieces.map((sp) => (
                  <div key={sp.id} className="flex items-center gap-2 text-xs text-slate-600">
                    {sp.drawing.length > 0 && (
                      <DrawingThumbnail strokes={sp.drawing} className="h-9 w-6 shrink-0 rounded border border-slate-200" />
                    )}
                    <span className="flex-1">{sp.title}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-medium ${sp.approved ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                      {sp.approved ? "goedgekeurd" : "voorgesteld"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div ref={checkinRef} />
        <fieldset disabled={!!data.currentAbsence} className={data.currentAbsence ? "opacity-50" : ""}>
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">1</span>
            <h2 className="font-semibold">Intensiteit tijdens de training</h2>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-slate-500">Datum</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-slate-500">Minuten</span>
              <input
                type="number"
                min={0}
                max={180}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <div className="text-sm">
              <span className="mb-1 block text-xs text-slate-500">Type</span>
              <div className="flex gap-1">
                {(["training", "wedstrijd"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => selectSessionType(t)}
                    title={t}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium ${
                      sessionType === t ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600"
                    }`}
                  >
                    {t === "training" ? "🏃 Tr." : "🏆 Wed."}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ScaleField
            label="Hoe zwaar was het?"
            value={rpe}
            onChange={setRpe}
            count={10}
            renderLabel={(i) => String(i)}
            caption="1 = heel licht · 10 = maximaal"
          />
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">2</span>
            <h2 className="font-semibold">Gevoel na de training</h2>
          </div>

          <ScaleField label="Vermoeidheid" value={fatigue} onChange={setFatigue} count={10} renderLabel={(i) => String(i)} caption="moe · fris" />
          <ScaleField label="Spierpijn" value={soreness} onChange={setSoreness} count={10} renderLabel={(i) => String(i)} caption="veel pijn · niks" last />
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">3</span>
            <h2 className="font-semibold">Pijntjes/blessures</h2>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={injuryFlag} onChange={(e) => setInjuryFlag(e.target.checked)} />
            Ik heb ergens pijn/een blessure
          </label>

          {injuryFlag && (
            <textarea
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={2}
              placeholder="Waar doet het pijn en sinds wanneer?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              autoFocus
            />
          )}

          <button
            onClick={submit}
            disabled={saving}
            className="mt-4 w-full rounded-lg bg-rose-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Bezig…" : "Versturen"}
          </button>

          {msg && (
            <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${err ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
              {msg}
            </div>
          )}
        </section>
        </fieldset>

        {data.entries.length > 0 && (
          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold">Jouw laatste invoer</h2>
            <div className="flex flex-col gap-2">
              {data.entries.map((e) => (
                <div key={e.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex justify-between font-medium">
                    <span>{e.date} · {e.session_type}</span>
                    <span>RPE {e.rpe}</span>
                  </div>
                  {e.injury_flag && <div className="mt-1 text-xs text-red-600">⚠️ pijn/blessure gemeld</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Berichten met de staf 💬</h2>
          <div className="mb-3 flex max-h-80 flex-col gap-2 overflow-y-auto">
            {data.messages.length === 0 && (
              <p className="text-sm text-slate-500">Nog geen berichten. Stuur gerust een vraag naar de staf.</p>
            )}
            {data.messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === "player" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.sender === "player" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.sender === "staff" && <div className="mb-0.5 text-xs font-semibold opacity-70">{m.sender_name ?? "Staf"}</div>}
                  {m.body}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Typ een bericht…"
              value={chatBody}
              onChange={(e) => setChatBody(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button
              onClick={sendMessage}
              disabled={chatBusy || !chatBody.trim()}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Stuur
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function ScaleField({
  label,
  value,
  onChange,
  count,
  renderLabel,
  caption,
  last,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  count: number;
  renderLabel: (i: number) => string;
  caption?: string;
  last?: boolean;
}) {
  return (
    <div className={last ? "" : "mb-3"}>
      <span className="mb-1 block text-sm text-slate-600">{label}</span>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: count }, (_, i) => i + 1).map((i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`rounded-lg border py-2 text-base font-semibold leading-none ${
              value === i ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-700"
            }`}
          >
            {renderLabel(i)}
          </button>
        ))}
      </div>
      {caption && (
        <div className="mt-0.5 flex justify-between text-xs text-slate-500">
          <span>{caption.split(" · ")[0]}</span>
          <span>{caption.split(" · ")[1]}</span>
        </div>
      )}
    </div>
  );
}
