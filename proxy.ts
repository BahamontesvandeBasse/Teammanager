import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { neonConfigured } from "@/lib/db/neonClient";

// Auth-guard: alleen actief wanneer Neon is geconfigureerd.
// Zonder Neon draait de app in lokale modus zonder login.

// Spelers loggen niet in — deze paden gebruiken een token en moeten dus
// publiek bereikbaar blijven, ook als login actief is.
const PUBLIC_PREFIXES = ["/mijn", "/api/mijn", "/api/auth"];

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

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
