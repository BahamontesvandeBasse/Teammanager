"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { computeMatchTimes } from "@/lib/schedule";
import { formatDateShort } from "@/lib/format";
import { Badge, Button, Card, Message, PageTitle, inputCls, tdCls, thCls } from "@/components/ui";
import { CarpoolDuty, Club, Match, Player, WashDuty } from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

export default function SchemaPage() {
  const canEdit = useCanEdit();
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [wash, setWash] = useState<WashDuty[]>([]);
  const [carpool, setCarpool] = useState<CarpoolDuty[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const reload = () =>
    Promise.all([
      api.list("players"),
      api.list("matches"),
      api.list("clubs"),
      api.list("wash_duty"),
      api.list("carpool_duty"),
    ])
      .then(([p, m, c, w, cp]) => {
        setPlayers(p);
        setMatches([...m].sort((a, b) => `${a.date} ${a.kickoff_time}`.localeCompare(`${b.date} ${b.kickoff_time}`)));
        setClubs(c);
        setWash(w);
        setCarpool(cp);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  const activePlayers = players
    .filter((p) => p.active)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));

  async function generate() {
    const hasExisting = wash.length > 0 || carpool.length > 0;
    if (hasExisting && !confirm("Bestaand was- en rijschema vervangen door een nieuw gegenereerd schema? Handmatige aanpassingen gaan verloren.")) return;
    setBusy(true);
    try {
      const res = await api.generateSchedule();
      await reload();
      setMsg(`Schema gegenereerd: ${res.wash} wasbeurten en ${res.carpool} rijbeurten.`);
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function changeWash(duty: WashDuty, playerId: string) {
    await api.update("wash_duty", duty.id, { player_id: playerId });
    await reload();
  }

  async function changeCarpool(duty: CarpoolDuty, playerId: string) {
    await api.update("carpool_duty", duty.id, { player_id: playerId });
    await reload();
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  // Tellingen voor eerlijkheids-overzicht
  const washCounts = new Map<string, number>();
  wash.forEach((w) => washCounts.set(w.player_id, (washCounts.get(w.player_id) ?? 0) + 1));
  const carCounts = new Map<string, number>();
  carpool.forEach((c) => carCounts.set(c.player_id, (carCounts.get(c.player_id) ?? 0) + 1));

  return (
    <div>
      <PageTitle
        title="Was- & rijschema"
        subtitle="Automatisch eerlijk verdeeld over het seizoen. Pas individuele beurten aan via de dropdowns."
      />

      {canEdit && (
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button onClick={generate} disabled={busy || matches.length === 0 || activePlayers.length === 0}>
          {busy ? "Bezig…" : wash.length > 0 ? "Opnieuw genereren" : "Genereer schema"}
        </Button>
        {matches.length === 0 && <span className="text-sm text-amber-600">Importeer eerst het programma.</span>}
        {activePlayers.length === 0 && <span className="text-sm text-amber-600">Importeer eerst de spelerslijst.</span>}
      </div>
      )}
      <Message text={msg} error={err} />

      {wash.length > 0 && (
        <Card className="mt-2 mb-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={thCls}>Datum</th>
                  <th className={thCls}>Wedstrijd</th>
                  <th className={thCls}>Aanwezig</th>
                  <th className={thCls}>Vertrek</th>
                  <th className={thCls}>Wasbeurt 🧺</th>
                  <th className={thCls}>Rijders 🚗</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => {
                  const t = computeMatchTimes(m, clubs);
                  const w = wash.find((x) => x.match_id === m.id);
                  const drivers = carpool.filter((x) => x.match_id === m.id);
                  const isAway = m.home_away === "away";
                  return (
                    <tr key={m.id} className="border-b border-slate-100 align-top">
                      <td className={`${tdCls} whitespace-nowrap`}>
                        {formatDateShort(m.date)} {m.kickoff_time}
                      </td>
                      <td className={tdCls}>
                        <div className="font-medium">{m.opponent}</div>
                        <Badge color={isAway ? "blue" : "green"}>{isAway ? "Uit" : "Thuis"}</Badge>
                      </td>
                      <td className={tdCls}>{t.arrive ?? "—"}</td>
                      <td className={tdCls}>
                        {isAway ? (t.depart ?? <span className="text-amber-600 text-xs">reistijd invullen (Programma)</span>) : "—"}
                      </td>
                      <td className={tdCls}>
                        {w && (
                          <select
                            className={inputCls}
                            disabled={!canEdit}
                            value={w.player_id}
                            onChange={(e) => changeWash(w, e.target.value)}
                          >
                            {playerOptions(players, w.player_id)}
                          </select>
                        )}
                      </td>
                      <td className={tdCls}>
                        {isAway ? (
                          <div className="flex flex-col gap-1">
                            {drivers.map((d) => (
                              <select
                                key={d.id}
                                className={inputCls}
                                disabled={!canEdit}
                                value={d.player_id}
                                onChange={(e) => changeCarpool(d, e.target.value)}
                              >
                                {playerOptions(players, d.player_id)}
                              </select>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {wash.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Verdeling over het seizoen</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={thCls}>Speler</th>
                  <th className={thCls}>Wasbeurten</th>
                  <th className={thCls}>Rijbeurten</th>
                </tr>
              </thead>
              <tbody>
                {activePlayers.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className={`${tdCls} font-medium`}>{p.name}</td>
                    <td className={tdCls}>{washCounts.get(p.id) ?? 0}</td>
                    <td className={tdCls}>{carCounts.get(p.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function playerOptions(players: Player[], currentId: string) {
  const sorted = [...players]
    .filter((p) => p.active || p.id === currentId)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  return sorted.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ));
}
