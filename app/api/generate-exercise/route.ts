import { NextRequest, NextResponse } from "next/server";
import { EXERCISE_PHASE_LABELS, ExercisePhase } from "@/lib/types";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ontbreekt. Zet deze in .env.local om oefeningen met AI te kunnen genereren." },
      { status: 400 }
    );
  }

  const { phase, subcategory, theme } = await req.json();
  if (!phase || !subcategory) {
    return NextResponse.json({ error: "phase en subcategory zijn verplicht" }, { status: 400 });
  }
  const phaseLabel = EXERCISE_PHASE_LABELS[phase as ExercisePhase] ?? phase;

  const prompt = `Je bent een KNVB-jeugdtrainer die een oefeningenbank samenstelt voor een JO19-team (Sv Steenwijkerwold, 2e klasse).

Bedenk één concrete voetbaloefening voor:
- Trainingsfase: ${phaseLabel}
- Sub-categorie: ${subcategory}
${theme ? `- Thema/leerdoel: ${theme}` : ""}

Antwoord UITSLUITEND met geldige JSON, exact in dit formaat, zonder markdown-codeblok eromheen:
{"title": "korte titel (max 6 woorden)", "description": "praktische omschrijving: opstelling, uitvoering, coaching-aandachtspunten (3-5 zinnen)", "duration_minutes": <getal tussen 5 en 30>}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Claude API-fout (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const text: string = data.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Kon geen geldig voorstel uit het AI-antwoord halen.");
    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      title: String(parsed.title ?? "").slice(0, 200),
      description: String(parsed.description ?? ""),
      duration_minutes:
        Number.isFinite(parsed.duration_minutes) && parsed.duration_minutes > 0 ? Math.round(parsed.duration_minutes) : 10,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
