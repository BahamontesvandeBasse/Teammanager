"use client";

import { useEffect, useRef, useState } from "react";
import { DrawingElement, LineStyle } from "@/lib/types";

// Staand veld (portret), doelen boven/onder — zoals Rinus.
const BOARD_W = 380;
const BOARD_H = 600;
const TOKEN_R = 14;
const BALL_R = 9;
const LINE_COLORS = ["#111827", "#dc2626", "#2563eb", "#eab308"];

type Mode = LineStyle | "player_own" | "player_opponent" | "ball";

const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: "player_own", label: "Eigen team", icon: "🔺" },
  { key: "player_opponent", label: "Tegenstander", icon: "🔵" },
  { key: "ball", label: "Bal", icon: "⚽" },
  { key: "pass", label: "Pass", icon: "➜" },
  { key: "run", label: "Looplijn", icon: "┄➜" },
  { key: "dribble", label: "Dribbel", icon: "〜➜" },
  { key: "freehand", label: "Vrij tekenen", icon: "✏️" },
];

// Oude tekeningen (vóór spelers/bal/looplijnen bestonden) hadden alleen {type, color, points}.
function normalizeElement(raw: unknown): DrawingElement {
  const r = raw as Record<string, unknown>;
  if (r && typeof r === "object" && "kind" in r) return raw as DrawingElement;
  const type = r?.type as string | undefined;
  return {
    kind: "line",
    style: type === "arrow" ? "pass" : "freehand",
    color: (r?.color as string) ?? "#111827",
    points: (r?.points as { x: number; y: number }[]) ?? [],
  };
}

function drawPitch(ctx: CanvasRenderingContext2D) {
  const w = BOARD_W;
  const h = BOARD_H;
  ctx.fillStyle = "#16a34a";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // Middenlijn (horizontaal, staand veld)
  ctx.beginPath();
  ctx.moveTo(10, h / 2);
  ctx.lineTo(w - 10, h / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();

  const boxW = 160;
  const boxH = 80;
  ctx.strokeRect(w / 2 - boxW / 2, 10, boxW, boxH);
  ctx.strokeRect(w / 2 - boxW / 2, h - 10 - boxH, boxW, boxH);
  const goalAreaW = 70;
  const goalAreaH = 30;
  ctx.strokeRect(w / 2 - goalAreaW / 2, 10, goalAreaW, goalAreaH);
  ctx.strokeRect(w / 2 - goalAreaW / 2, h - 10 - goalAreaH, goalAreaW, goalAreaH);

  // Doeltjes: net buiten de lijn, op de doellijn zelf.
  const goalDepth = 8;
  const goalMouth = 36;
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.strokeRect(w / 2 - goalMouth / 2, 10 - goalDepth, goalMouth, goalDepth);
  ctx.fillRect(w / 2 - goalMouth / 2, 10 - goalDepth, goalMouth, goalDepth);
  ctx.strokeRect(w / 2 - goalMouth / 2, h - 10, goalMouth, goalDepth);
  ctx.fillRect(w / 2 - goalMouth / 2, h - 10, goalMouth, goalDepth);
}

function drawArrowHead(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const headLen = 12;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - headLen * Math.cos(angle - Math.PI / 6), b.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(b.x - headLen * Math.cos(angle + Math.PI / 6), b.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawLine(ctx: CanvasRenderingContext2D, el: Extract<DrawingElement, { kind: "line" }>, selected?: boolean) {
  if (el.points.length === 0) return;

  if (selected) {
    // Brede gele halo onder de lijn, zodat een geselecteerde looplijn/pass
    // net zo duidelijk gemarkeerd is als een geselecteerde speler/bal.
    ctx.save();
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    ctx.beginPath();
    el.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(el.style === "run" ? [10, 7] : []);

  if (el.style === "freehand") {
    ctx.beginPath();
    el.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  if (el.points.length < 2) {
    ctx.setLineDash([]);
    return;
  }
  const a = el.points[0];
  const b = el.points[el.points.length - 1];

  if (el.style === "dribble") {
    const segs = 8;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const amp = 6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const side = i % 2 === 0 ? 1 : -1;
      ctx.lineTo(a.x + dx * t + nx * amp * side, a.y + dy * t + ny * amp * side);
    }
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  drawArrowHead(ctx, a, b);
}

function drawPlayer(ctx: CanvasRenderingContext2D, el: Extract<DrawingElement, { kind: "player" }>, selected?: boolean) {
  const color = el.team === "own" ? "#dc2626" : "#2563eb";
  ctx.fillStyle = color;
  ctx.lineWidth = selected ? 3 : 2;
  ctx.strokeStyle = selected ? "#eab308" : "white";

  if (el.team === "own") {
    // Driehoekje, punt naar boven.
    const r = TOKEN_R + 2;
    ctx.beginPath();
    ctx.moveTo(el.x, el.y - r);
    ctx.lineTo(el.x + r * 0.87, el.y + r * 0.6);
    ctx.lineTo(el.x - r * 0.87, el.y + r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(el.x, el.y, TOKEN_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (el.number) {
    ctx.fillStyle = "white";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(el.number, el.x, el.y + (el.team === "own" ? 4 : 1));
  }
}

function drawBall(ctx: CanvasRenderingContext2D, el: Extract<DrawingElement, { kind: "ball" }>, selected?: boolean) {
  ctx.beginPath();
  ctx.arc(el.x, el.y, BALL_R, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeStyle = selected ? "#eab308" : "#111827";
  ctx.stroke();
}

function drawElement(ctx: CanvasRenderingContext2D, el: DrawingElement, selected?: boolean) {
  if (el.kind === "line") drawLine(ctx, el, selected);
  else if (el.kind === "player") drawPlayer(ctx, el, selected);
  else drawBall(ctx, el, selected);
}

function renderBoard(canvas: HTMLCanvasElement, elements: DrawingElement[], selectedIndex?: number | null, preview?: DrawingElement | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = BOARD_W;
  canvas.height = BOARD_H;
  drawPitch(ctx);
  elements.forEach((el, i) => drawElement(ctx, el, i === selectedIndex));
  if (preview) drawElement(ctx, preview);
}

const LINE_HIT_TOLERANCE = 10;

function pointToSegmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToLine(p: { x: number; y: number }, points: { x: number; y: number }[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y);
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    min = Math.min(min, pointToSegmentDistance(p, points[i], points[i + 1]));
  }
  return min;
}

// Vindt het bovenste element (speler, bal, of lijn/pass/looplijn) onder het klikpunt,
// zodat alle soorten symbolen — niet alleen spelers/bal — aangeklikt en geselecteerd
// kunnen worden om ze gericht te verwijderen.
function findElementAt(elements: DrawingElement[], p: { x: number; y: number }): number | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.kind === "line") {
      if (distanceToLine(p, el.points) <= LINE_HIT_TOLERANCE) return i;
      continue;
    }
    const r = el.kind === "ball" ? BALL_R : TOKEN_R;
    if (Math.hypot(el.x - p.x, el.y - p.y) <= r + 4) return i;
  }
  return null;
}

// Compacte, niet-interactieve weergave van een opgeslagen tekening.
export function DrawingThumbnail({ strokes, className }: { strokes: unknown[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const elements = strokes.map(normalizeElement);
  useEffect(() => {
    if (ref.current) renderBoard(ref.current, elements);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);
  return <canvas ref={ref} className={className ?? "w-full max-w-[220px] rounded-lg border border-slate-200"} />;
}

// Het tekentoestel zelf (bord + gereedschap), zonder modal-chrome of opslaan/annuleren —
// zodat het zowel los ingebed (Rinus-stijl) als in een modal (TacticsBoardModal) te gebruiken is.
export function TacticsBoardEditor({
  elements,
  onChange,
}: {
  elements: DrawingElement[];
  onChange: (elements: DrawingElement[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("pass");
  const [color, setColor] = useState(LINE_COLORS[0]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const drag = useRef<
    | { kind: "line"; current: Extract<DrawingElement, { kind: "line" }> }
    | { kind: "move"; index: number; offsetX: number; offsetY: number }
    | null
  >(null);

  useEffect(() => {
    if (canvasRef.current) renderBoard(canvasRef.current, elements, selectedIndex);
  }, [elements, selectedIndex]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * BOARD_W,
      y: ((e.clientY - rect.top) / rect.height) * BOARD_H,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = pointFromEvent(e);
    (e.target as Element).setPointerCapture(e.pointerId);

    const hit = findElementAt(elements, p);
    if (hit !== null) {
      const el = elements[hit];
      setSelectedIndex(hit);
      // Lijnen (pass/looplijn/dribbel/vrij tekenen) zijn alleen te selecteren
      // en verwijderen, niet te verslepen — alleen spelers/bal hebben een x/y.
      if (el.kind !== "line") {
        drag.current = { kind: "move", index: hit, offsetX: p.x - el.x, offsetY: p.y - el.y };
      }
      return;
    }

    setSelectedIndex(null);

    if (mode === "player_own" || mode === "player_opponent" || mode === "ball") {
      const newEl: DrawingElement =
        mode === "ball"
          ? { kind: "ball", x: p.x, y: p.y }
          : { kind: "player", team: mode === "player_own" ? "own" : "opponent", x: p.x, y: p.y, number: null };
      const newIndex = elements.length;
      onChange([...elements, newEl]);
      setSelectedIndex(newIndex);
      return;
    }

    drag.current = { kind: "line", current: { kind: "line", style: mode, color, points: [p] } };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d) return;
    const p = pointFromEvent(e);

    if (d.kind === "move") {
      onChange(
        elements.map((el, i) => (i === d.index && el.kind !== "line" ? { ...el, x: p.x - d.offsetX, y: p.y - d.offsetY } : el))
      );
      return;
    }

    if (d.current.style === "freehand") d.current.points.push(p);
    else d.current.points = [d.current.points[0], p];
    if (canvasRef.current) renderBoard(canvasRef.current, elements, selectedIndex, d.current);
  }

  function handlePointerUp() {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "line" && d.current.points.length > 1) {
      onChange([...elements, d.current]);
    }
  }

  function updateSelectedNumber(value: string) {
    if (selectedIndex === null) return;
    onChange(elements.map((el, i) => (i === selectedIndex && el.kind === "player" ? { ...el, number: value.slice(0, 2) } : el)));
  }

  function removeSelected() {
    if (selectedIndex === null) return;
    onChange(elements.filter((_, i) => i !== selectedIndex));
    setSelectedIndex(null);
  }

  // Delete/Backspace verwijdert het geselecteerde symbool — niet alleen via de
  // knop hieronder. Genegeerd terwijl er in een tekstveld getypt wordt (bv.
  // het rugnummer-veld), zodat normaal bewerken niet per ongeluk een symbool wist.
  useEffect(() => {
    if (selectedIndex === null) return;
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, elements]);

  function undo() {
    onChange(elements.slice(0, -1));
    setSelectedIndex(null);
  }

  function clearAll() {
    onChange([]);
    setSelectedIndex(null);
  }

  const selectedEl = selectedIndex !== null ? elements[selectedIndex] : null;
  const isLineMode = mode === "freehand" || mode === "pass" || mode === "run" || mode === "dribble";

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => {
              setMode(m.key);
              setSelectedIndex(null);
            }}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              mode === m.key ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600"
            }`}
          >
            <span className="mr-1">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        {isLineMode && (
          <div className="flex gap-1">
            {LINE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-slate-900" : "border-white"}`}
                aria-label={c}
              />
            ))}
          </div>
        )}

        {selectedEl?.kind === "player" && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Rugnummer</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={selectedEl.number ?? ""}
              onChange={(e) => updateSelectedNumber(e.target.value)}
              className="w-14 rounded border border-slate-300 px-2 py-1 text-xs"
              placeholder="nr"
            />
          </div>
        )}

        {selectedIndex !== null && (
          <button onClick={removeSelected} className="text-xs font-medium text-red-500 hover:underline">
            verwijder geselecteerd
          </button>
        )}

        <div className="ml-auto flex gap-2">
          <button
            onClick={undo}
            disabled={elements.length === 0}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
          >
            ↩ Ongedaan maken
          </button>
          <button
            onClick={clearAll}
            disabled={elements.length === 0}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
          >
            Wis alles
          </button>
        </div>
      </div>

      <p className="mb-2 text-xs text-slate-500">
        {mode === "player_own" || mode === "player_opponent"
          ? "Klik op het veld om een speler te plaatsen. Klik een geplaatste speler aan om een rugnummer te geven of te verslepen."
          : mode === "ball"
            ? "Klik op het veld om de bal te plaatsen."
            : "Sleep over het veld om te tekenen."}
      </p>

      <canvas
        ref={canvasRef}
        width={BOARD_W}
        height={BOARD_H}
        className="touch-none rounded-lg border border-slate-200"
        style={{ width: "100%", maxWidth: BOARD_W, aspectRatio: `${BOARD_W} / ${BOARD_H}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}

export function TacticsBoardModal({
  title,
  initialStrokes,
  onClose,
  onSave,
}: {
  title: string;
  initialStrokes: unknown[];
  onClose: () => void;
  onSave: (elements: DrawingElement[]) => void;
}) {
  const [elements, setElements] = useState<DrawingElement[]>(() => initialStrokes.map(normalizeElement));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Tekening — {title}</h3>
          <button onClick={onClose} className="text-sm text-slate-500 hover:underline">sluiten</button>
        </div>

        <TacticsBoardEditor elements={elements} onChange={setElements} />

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Annuleren
          </button>
          <button onClick={() => onSave(elements)} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
