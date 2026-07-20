import { NextRequest, NextResponse } from "next/server";
import { resolveRole } from "@/lib/auth/access";
import { isAdmin, Role } from "@/lib/auth/roles";
import { createUser, listUsers } from "@/lib/auth/users";
import { hashPassword } from "@/lib/auth/passwords";

const CREATABLE_ROLES: Role[] = ["staf", "toeschouwer", "speler"];

export async function GET() {
  const role = await resolveRole();
  if (!isAdmin(role)) return NextResponse.json({ error: "Alleen voor beheerders" }, { status: 403 });
  const users = await listUsers();
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const role = await resolveRole();
  if (!isAdmin(role)) return NextResponse.json({ error: "Alleen voor beheerders" }, { status: 403 });

  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const newRole = body.role as Role;
    const playerId = typeof body.player_id === "string" && body.player_id ? body.player_id : null;

    if (!email || !name || password.length < 8) {
      return NextResponse.json(
        { error: "E-mail en naam zijn verplicht, wachtwoord moet minstens 8 tekens hebben." },
        { status: 400 }
      );
    }
    if (!CREATABLE_ROLES.includes(newRole)) {
      return NextResponse.json({ error: `Rol moet één van ${CREATABLE_ROLES.join(", ")} zijn.` }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser(email, name, passwordHash, newRole, playerId);
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("duplicate key")) {
      return NextResponse.json({ error: "Er bestaat al een account met dit e-mailadres." }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

