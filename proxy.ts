import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { neonConfigured } from "@/lib/db/neonClient";

// Auth-guard: alleen actief wanneer Neon is geconfigureerd.
// Zonder Neon draait de app in lokale modus zonder login.

// NextAuth's eigen routes moeten publiek bereikbaar blijven (login-form,
// callback), anders kan niemand meer inloggen.
const PUBLIC_PREFIXES = ["/api/auth"];

// Wanneer een beheerder een wachtwoord heeft ingesteld (nieuw account of reset)
// moet dat bij de eerstvolgende login eerst gewijzigd worden — deze paden
// blijven bereikbaar zodat die wijziging (en het uitloggen erna) kan plaatsvinden.
const CHANGE_PASSWORD_PATH = "/wachtwoord-wijzigen";
const CHANGE_PASSWORD_ALLOWED_PREFIXES = [CHANGE_PASSWORD_PATH, "/api/account/change-password"];

export default auth((request) => {
  const pathname = request.nextUrl.pathname;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!neonConfigured()) {
    return NextResponse.next();
  }

  const isLoggedIn = Boolean(request.auth);
  const isLoginPage = pathname.startsWith("/login");

  if (!isLoggedIn && !isLoginPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (isLoggedIn && isLoginPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  if (
    isLoggedIn &&
    request.auth?.user?.mustChangePassword &&
    !CHANGE_PASSWORD_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = CHANGE_PASSWORD_PATH;
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
