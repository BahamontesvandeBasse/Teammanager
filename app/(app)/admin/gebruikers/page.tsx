import { redirect } from "next/navigation";
import { getRealRole } from "@/lib/auth/access";
import { isAdmin } from "@/lib/auth/roles";
import { listUsers } from "@/lib/auth/users";
import { getStore } from "@/lib/db";
import { Player } from "@/lib/types";
import GebruikersClient from "./GebruikersClient";

export default async function GebruikersPage() {
  // Echte rol (niet de "bekijk als"-simulatie) — een beheerder die zichzelf
  // als speler laat weergeven moet gebruikersbeheer kunnen blijven bereiken
  // (via "Terug naar beheerder"), niet hier al buitengesloten worden.
  const role = await getRealRole();
  if (!isAdmin(role)) redirect("/");

  const [users, players] = await Promise.all([listUsers(), getStore().list("players")]);

  return <GebruikersClient initialUsers={users} players={players as unknown as Player[]} />;
}
