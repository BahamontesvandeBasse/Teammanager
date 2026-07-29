"use client";

import { createContext, ReactNode, useContext } from "react";
import { canEdit as canEditRole, Role } from "@/lib/auth/roles";

type RoleContextValue = { role: Role; playerId: string | null };

const RoleContext = createContext<RoleContextValue>({ role: "admin", playerId: null });

export function RoleProvider({
  role,
  playerId,
  children,
}: {
  role: Role;
  playerId: string | null;
  children: ReactNode;
}) {
  return <RoleContext.Provider value={{ role, playerId }}>{children}</RoleContext.Provider>;
}

export function useRole(): Role {
  return useContext(RoleContext).role;
}

export function useCanEdit(): boolean {
  return canEditRole(useContext(RoleContext).role);
}

// De player-rij gekoppeld aan het ingelogde account (alleen gezet voor
// "speler"-accounts) — gebruikt om te bepalen of iemand naar zijn eigen
// spelersprofiel kijkt.
export function useOwnPlayerId(): string | null {
  return useContext(RoleContext).playerId;
}
