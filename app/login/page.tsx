"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Card, Message, inputCls } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Inloggen mislukt: controleer e-mailadres en wachtwoord.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Er ging iets mis bij het inloggen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl">⚽</div>
          <h1 className="mt-2 text-xl font-bold">Teammanager</h1>
          <p className="text-sm text-slate-500">Sv Steenwijkerwold JO19-1</p>
        </div>
        <form onSubmit={login} className="flex flex-col gap-3">
          <input
            type="email"
            required
            className={inputCls}
            placeholder="E-mailadres"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            className={inputCls}
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={busy}>{busy ? "Inloggen…" : "Inloggen"}</Button>
        </form>
        <Message text={error} error />
        <p className="mt-4 text-center text-xs text-slate-500">
          Accounts worden aangemaakt door de beheerder.
        </p>
      </Card>
    </div>
  );
}
