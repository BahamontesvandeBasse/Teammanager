"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button, Card, Message, inputCls } from "@/components/ui";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("De nieuwe wachtwoorden komen niet overeen.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Wijzigen mislukt.");
        return;
      }
      setDone(true);
      // De sessie (JWT) weet nog niet dat het wachtwoord gewijzigd is — opnieuw
      // inloggen haalt een verse sessie op zodat de verplichte wijziging niet
      // blijft terugkomen.
      setTimeout(() => signOut({ callbackUrl: "/login" }), 1500);
    } catch {
      setError("Er ging iets mis bij het wijzigen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl">🔒</div>
          <h1 className="mt-2 text-xl font-bold">Wachtwoord wijzigen</h1>
          <p className="text-sm text-slate-500">
            Je moet je wachtwoord wijzigen voordat je verder kunt.
          </p>
        </div>
        {done ? (
          <Message text="Wachtwoord gewijzigd. Je wordt uitgelogd — log opnieuw in met je nieuwe wachtwoord." />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              type="password"
              required
              autoComplete="current-password"
              className={inputCls}
              placeholder="Huidig wachtwoord"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputCls}
              placeholder="Nieuw wachtwoord (min. 8 tekens)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputCls}
              placeholder="Nieuw wachtwoord (herhaal)"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button type="submit" disabled={busy}>{busy ? "Bezig…" : "Wachtwoord wijzigen"}</Button>
          </form>
        )}
        <Message text={error} error />
      </Card>
    </div>
  );
}
