import { Role } from "@/lib/auth/roles";

declare module "next-auth" {
  interface User {
    role: Role;
    playerId: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      playerId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    playerId: string | null;
  }
}

// In deze next-auth-versie is "next-auth/jwt" een pure re-export van
// "@auth/core/jwt" (geen eigen lokale interface) — de callback-signatures
// in @auth/core/index.d.ts importeren JWT rechtstreeks vanuit dat pad, dus
// de augmentatie moet ook daar staan om daadwerkelijk te mergen.
declare module "@auth/core/jwt" {
  interface JWT {
    role: Role;
    playerId: string | null;
  }
}
