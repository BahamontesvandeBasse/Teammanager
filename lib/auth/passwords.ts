import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Tijdelijk wachtwoord voor een admin-reset: alleen leesbaar op het moment van aanmaken,
// daarna is enkel de bcrypt-hash bekend — er is geen manier om een wachtwoord terug te lezen.
export function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}
