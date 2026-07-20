import { NextRequest, NextResponse } from "next/server";
import { resolveRole } from "@/lib/auth/access";
import { isAdmin, Role } from "@/lib/auth/roles";
import { deleteUser, getUser, updateUser } from "@/lib/auth/users";

const ASSIGNABLE_ROLES: Role[] = ["staf", "toeschouwer", "speler"];

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const role = await resolveRole();
  if (!isAdmin(role)) return NextResponse.json({ error: "Alleen voor beheerders" }, { status: 403 });

  const { id } = await params;
  const target = await getUser(id);
  if (!target) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "Het beheerdersaccount kan hier niet gewijzigd worden." }, { status: 400 });
  }

  const body = await req.json();
  const patch: { role?: Role; player_id?: string | null } = {};
  if (body.role !== undefined) {
    if (!ASSIGNABLE_ROLES.includes(body.role)) {
      return NextResponse.json({ error: `Rol moet één van ${ASSIGNABLE_ROLES.join(", ")} zijn.` }, { status: 400 });
    }
    patch.role = body.role;
  }
  if (body.player_id !== undefined) {
    patch.player_id = typeof body.player_id === "string" && body.player_id ? body.player_id : null;
  }

  const updated = await updateUser(id, patch);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const role = await resolveRole();
  if (!isAdmin(role)) return NextResponse.json({ error: "Alleen voor beheerders" }, { status: 403 });

  const { id } = await params;
  const target = await getUser(id);
  if (!target) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "Het beheerdersaccount kan niet verwijderd worden." }, { status: 400 });
  }

  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
