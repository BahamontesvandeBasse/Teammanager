import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { findUserByEmail, recordLogin } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/passwords";
import { neonConfigured } from "@/lib/db/neonClient";

// Eigen e-mail/wachtwoord-login voor trainers/begeleiding (vervangt Supabase
// Auth). Geen open registratie — accounts worden aangemaakt via
// scripts/create-user.mjs. Sessies zijn JWT-based (geen sessietabel nodig).
// Zonder Neon (DATABASE_URL) draait de app lokaal zonder login, dus dan is
// er ook geen provider nodig.

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  // Auth.js vereist altijd een secret om sessiecookies te (de)coderen, ook
  // wanneer er (nog) geen Neon is gekoppeld. Zonder Neon kan niemand
  // inloggen (zie authorize() hieronder), dus de placeholder hieronder is
  // dan onschadelijk — in productie moet AUTH_SECRET altijd gezet zijn.
  secret: process.env.AUTH_SECRET || "lokale-modus-placeholder-secret-niet-voor-productie",
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!neonConfigured()) return null;
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
          return null;
        }
        const user = await findUserByEmail(email);
        if (!user) return null;
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) return null;
        await recordLogin(user.id);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          playerId: user.player_id,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.playerId = user.playerId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role = token.role;
      session.user.playerId = token.playerId;
      return session;
    },
  },
});
