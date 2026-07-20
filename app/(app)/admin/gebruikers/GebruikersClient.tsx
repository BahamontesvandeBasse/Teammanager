"use client";

import { useState } from "react";
import { Badge, Button, Card, inputCls, Message, PageTitle, tdCls, thCls } from "@/components/ui";
import { ROLE_LABELS, Role } from "@/lib/auth/roles";
import { PublicUser } from "@/lib/auth/users";
import { Player } from "@/lib/types";

const ASSIGNABLE_ROLES: Role[] = ["staf", "toeschouwer", "speler"];

export default function GebruikersClient({
  initialUsers,
  players,
}: {
  initialUsers: PublicUser[];
  players: Player[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("staf");
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function playerName(id: string | null) {
    if (!id) return null;
    return players.find((p) => p.id === id)?.name ?? "onbekende speler";
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          password,
          role,
          player_id: role === "speler" ? playerId || null : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Aanmaken mislukt.");
        return;
      }
      setUsers((prev) => [...prev, body]);
      setSuccess(`Account aangemaakt voor ${body.email}.`);
      setEmail("");
      setName("");
      setPassword("");
      setRole("staf");
      setPlayerId("");
    } catch {
      setError("Er ging iets mis bij het aanmaken.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(id: string, newRole: Role) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole, player_id: newRole === "speler" ? undefined : null }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Wijzigen mislukt.");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? body : u)));
  }

  async function removeUser(id: string) {
    if (!confirm("Dit account verwijderen?")) return;
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Verwijderen mislukt.");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }

  return (
    <div>
      <PageTitle title="Gebruikers" subtitle="Accounts voor staf, toeschouwers en spelers beheren" />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Nieuw account</h2>
        <form onSubmit={createUser} className="grid gap-3 sm:grid-cols-2">
          <input
            type="email"
            required
            placeholder="E-mailadres"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            required
            placeholder="Naam"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="password"
            required
            placeholder="Wachtwoord (min. 8 tekens)"
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {role === "speler" && (
            <select className={`${inputCls} sm:col-span-2`} value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
              <option value="">Koppel aan speler (optioneel)</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Bezig…" : "Account aanmaken"}
            </Button>
          </div>
        </form>
        <Message text={error} error />
        <Message text={success} />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Bestaande accounts</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={thCls}>Naam</th>
                <th className={thCls}>E-mail</th>
                <th className={thCls}>Rol</th>
                <th className={thCls}>Speler</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className={tdCls}>{u.name}</td>
                  <td className={tdCls}>{u.email}</td>
                  <td className={tdCls}>
                    {u.role === "admin" ? (
                      <Badge color="blue">{ROLE_LABELS.admin}</Badge>
                    ) : (
                      <select
                        className={inputCls}
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className={tdCls}>{playerName(u.player_id) ?? "—"}</td>
                  <td className={tdCls}>
                    {u.role !== "admin" && (
                      <Button variant="danger" onClick={() => removeUser(u.id)}>
                        Verwijderen
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
