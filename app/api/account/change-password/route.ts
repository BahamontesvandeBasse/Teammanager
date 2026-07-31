import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { findUserByEmail, updateUserPassword } from "@/lib/auth/users";

// Zelfbediening: de ingelogde gebruiker wijzigt het eigen wachtwoord (o.a. de
// verplichte wijziging na een door de beheerder ingesteld wachtwoord). Het
// account wordt altijd via de sessie bepaald, nooit via client-invoer — zo
// kan iemand nooit het wachtwoord van een ander account wijzigen.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Nieuw wachtwoord moet minstens 8 tekens hebben." }, { status: 400 });
  }

  const user = await findUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Account niet gevonden" }, { status: 404 });

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Huidig wachtwoord klopt niet." }, { status: 400 });
  }

  await updateUserPassword(session.user.id, await hashPassword(newPassword), false);
  return NextResponse.json({ ok: true });
}
