import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { neonConfigured } from "@/lib/db/neonClient";

// Auth-guard: alleen actief wanneer Neon is geconfigureerd.
// Zonder Neon draait de app in lokale modus zonder login.

// NextAuth's eigen routes moeten publiek bereikbaar blijven (login-form,
// callback), anders kan niemand meer inloggen.
const PUBLIC_PREFIXES = ["/api/auth"];

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
