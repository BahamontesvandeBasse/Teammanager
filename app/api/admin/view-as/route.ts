import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRealRole, VIEW_AS_COOKIE } from "@/lib/auth/access";
import { Role } from "@/lib/auth/roles";

const IMPERSONATABLE_ROLES: Role[] = ["staf", "toeschouwer", "speler"];

// Laat een beheerder tijdelijk de app als een andere rol bekijken (server-side
// redactie en schrijfbeveiliging incluis), zodat snel te zien is of iets in de
// rechten (API) of in de layout (UI) moet worden aangepast. Alleen de echte
// beheerder mag dit zetten — nooit gebaseerd op een eventuele simulatie zelf.
export async function POST(req: NextRequest) {
  const realRole = await getRealRole();
  if (realRole !== "admin") {
    return NextResponse.json({ error: "Alleen voor beheerders" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const role = body.role as Role | "admin";
  const store = await cookies();

  if (role === "admin") {
    store.delete(VIEW_AS_COOKIE);
    return NextResponse.json({ ok: true });
  }

  if (!IMPERSONATABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Ongeldige rol" }, { status: 400 });
  }

  store.set(VIEW_AS_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4,
  });
  return NextResponse.json({ ok: true });
}
