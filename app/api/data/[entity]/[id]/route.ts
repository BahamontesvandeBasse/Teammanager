import { NextRequest, NextResponse } from "next/server";
import { getStore, isValidEntity } from "@/lib/db";
import { canWriteEntity, resolveRole } from "@/lib/auth/access";

type Params = { params: Promise<{ entity: string; id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { entity, id } = await params;
  if (!isValidEntity(entity)) return NextResponse.json({ error: "Onbekende entiteit" }, { status: 404 });
  const role = await resolveRole();
  if (!canWriteEntity(role)) return NextResponse.json({ error: "Geen bewerkingsrechten" }, { status: 403 });
  try {
    const patch = await req.json();
    const updated = await getStore().update(entity, id, patch);
    if (!updated) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { entity, id } = await params;
  if (!isValidEntity(entity)) return NextResponse.json({ error: "Onbekende entiteit" }, { status: 404 });
  const role = await resolveRole();
  if (!canWriteEntity(role)) return NextResponse.json({ error: "Geen bewerkingsrechten" }, { status: 403 });
  try {
    await getStore().remove(entity, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
