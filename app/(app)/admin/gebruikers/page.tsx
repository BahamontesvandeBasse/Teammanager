import { redirect } from "next/navigation";
import { resolveRole } from "@/lib/auth/access";
import { isAdmin } from "@/lib/auth/roles";
import { listUsers } from "@/lib/auth/users";
import { getStore } from "@/lib/db";
import { Player } from "@/lib/types";
import GebruikersClient from "./GebruikersClient";

export default async function GebruikersPage() {
  const role = await resolveRole();
  if (!isAdmin(role)) redirect("/");

  const [users, players] = await Promise.all([listUsers(), getStore().list("players")]);

  return <GebruikersClient initialUsers={users} players={players as unknown as Player[]} />;
}
