export type Role = "admin" | "staf" | "toeschouwer" | "speler";

export const ROLES: Role[] = ["admin", "staf", "toeschouwer", "speler"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Beheerder",
  staf: "Staf",
  toeschouwer: "Toeschouwer",
  speler: "Speler",
};

export function canEdit(role: Role): boolean {
  return role === "admin" || role === "staf";
}

export function isAdmin(role: Role): boolean {
  return role === "admin";
}
