import { NextRequest, NextResponse } from "next/server";
import { getStore, isValidEntity } from "@/lib/db";
import { canWriteEntity, redactForRole, resolveRole } from "@/lib/auth/access";
import { auth } from "@/lib/auth";

type Params = { params: Promise<{ entity: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { entity } = await params;
  if (!isValidEntity(entity)) return NextResponse.json({ error: "Onbekende entiteit" }, { status: 404 });
  try {
    const role = await resolveRole();
    const rows = await getStore().list(entity);
    return NextResponse.json(await redactForRole(entity, rows, role));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { entity } = await params;
  if (!isValidEntity(entity)) return NextResponse.json({ error: "Onbekende entiteit" }, { status: 404 });
  const role = await resolveRole();
  if (!canWriteEntity(role)) return NextResponse.json({ error: "Geen bewerkingsrechten" }, { status: 403 });
  try {
    const body = await req.json();
    let rows = Array.isArray(body) ? body : [body];

    // Staf ziet altijd wie een spelhervatting heeft aangemaakt (net als bij
    // spelersvoorstellen). Server-side uit de sessie gezet — nooit uit de
    // client, die dit anders zou kunnen vervalsen. Deze route is hier alleen
    // bereikbaar voor staf/beheerder (canWriteEntity hierboven); spelers
    // suggereren via het losse /api/set-pieces/suggest-endpoint.
    if (entity === "set_pieces") {
      const session = await auth();
      const creatorName = session?.user?.name ?? null;
      rows = rows.map((r) => ({ ...r, created_by_name: creatorName }));
    }

    const inserted = await getStore().insert(entity, rows);
    return NextResponse.json(inserted, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Verwijdert alle rijen (gebruikt bij "lijst vervangen" imports).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { entity } = await params;
  if (!isValidEntity(entity)) return NextResponse.json({ error: "Onbekende entiteit" }, { status: 404 });
  const role = await resolveRole();
  if (!canWriteEntity(role)) return NextResponse.json({ error: "Geen bewerkingsrechten" }, { status: 403 });
  try {
    await getStore().clear(entity);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
