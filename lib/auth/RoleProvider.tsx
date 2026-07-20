"use client";

import { createContext, ReactNode, useContext } from "react";
import { canEdit as canEditRole, Role } from "@/lib/auth/roles";

const RoleContext = createContext<Role>("admin");

export function RoleProvider({ role, children }: { role: Role; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): Role {
  return useContext(RoleContext);
}

export function useCanEdit(): boolean {
  return canEditRole(useContext(RoleContext));
}
