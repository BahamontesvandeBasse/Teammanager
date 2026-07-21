import { NextRequest, NextResponse } from "next/server";
import { resolveRole } from "@/lib/auth/access";
import { isAdmin, Role } from "@/lib/auth/roles";
import { deleteUser, getUser, updateUser, updateUserPassword } from "@/lib/auth/users";
import { generateTempPassword, hashPassword } from "@/lib/auth/passwords";

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

// Genereert een nieuw tijdelijk wachtwoord en slaat alleen de bcrypt-hash op.
// Het platte wachtwoord is hierna nergens meer op te vragen — dit endpoint is de enige plek waar het zichtbaar is.
export async function POST(req: NextRequest, { params }: Params) {
  const role = await resolveRole();
  if (!isAdmin(role)) return NextResponse.json({ error: "Alleen voor beheerders" }, { status: 403 });

  const { id } = await params;
  const target = await getUser(id);
  if (!target) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "Het beheerdersaccount kan hier niet gereset worden." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const customPassword = typeof body.password === "string" ? body.password : "";
  if (customPassword && customPassword.length < 8) {
    return NextResponse.json({ error: "Wachtwoord moet minstens 8 tekens hebben." }, { status: 400 });
  }
  const tempPassword = customPassword || generateTempPassword();

  await updateUserPassword(id, await hashPassword(tempPassword));
  return NextResponse.json({ password: tempPassword });
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
