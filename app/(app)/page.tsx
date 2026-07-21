"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { computeMatchTimes } from "@/lib/schedule";
import { ageFromBirthdate, formatDate, todayIso } from "@/lib/format";
import { Badge, Card, PageTitle } from "@/components/ui";
import { Absence, CarpoolDuty, Club, Match, Player, StaffMember, WashDuty } from "@/lib/types";

// Tenue Sv Steenwijkerwold: rood shirt met 2 diagonale zwarte banen.
const JERSEY_STYLE = {
  backgroundImage:
    "linear-gradient(45deg, #e11d48 0%, #e11d48 29%, #000 29%, #000 43%, #e11d48 43%, #e11d48 53%, #000 53%, #000 67%, #e11d48 67%, #e11d48 100%)",
};

function isPlayed(m: Match): boolean {
  return m.score_for !== null && m.score_against !== null;
}

function isBirthdayToday(birthdate: string | null, today: string): boolean {
  return !!birthdate && birthdate.slice(5) === today.slice(5);
}

export default function DashboardPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [wash, setWash] = useState<WashDuty[]>([]);
  const [carpool, setCarpool] = useState<CarpoolDuty[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.list("players"),
      api.list("staff"),
      api.list("matches"),
      api.list("clubs"),
      api.list("wash_duty"),
      api.list("carpool_duty"),
      api.list("absences"),
    ])
      .then(([p, s, m, c, w, cp, ab]) => {
        setPlayers([...p].sort((a, b) => a.name.localeCompare(b.name, "nl")));
        setStaff(s);
        setMatches(m);
        setClubs(c);
        setWash(w);
        setCarpool(cp);
        setAbsences(ab);
      })
      .finally(() => setLoading(false));
  }, []);

  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? "?";

  const today = todayIso();
  const birthdays = [
    ...players.filter((p) => isBirthdayToday(p.birthdate, today)).map((p) => ({ name: p.name, birthdate: p.birthdate as string })),
    ...staff.filter((s) => isBirthdayToday(s.birthdate, today)).map((s) => ({ name: s.name, birthdate: s.birthdate as string })),
  ];
  const next = matches
    .filter((m) => m.date >= today)
    .sort((a, b) => `${a.date} ${a.kickoff_time}`.localeCompare(`${b.date} ${b.kickoff_time}`))[0];
  const lastPlayed = [...matches]
    .filter(isPlayed)
    .sort((a, b) => `${b.date} ${b.kickoff_time}`.localeCompare(`${a.date} ${a.kickoff_time}`))[0];

  if (loading) return <p className="text-slate-500">Laden…</p>;

  if (matches.length === 0) {
    return (
      <div>
        <PageTitle title="Dashboard" subtitle="Sv Steenwijkerwold JO19-1" />
        {birthdays.length > 0 && <BirthdayBanner birthdays={birthdays} />}
        <Card>
          <h2 className="font-semibold mb-2">Aan de slag 🚀</h2>
          <ol className="list-decimal ml-5 space-y-1 text-sm text-slate-600">
            <li>
              Importeer je spelerslijst (Excel uit Sportlink) op de{" "}
              <Link className="text-rose-700 underline" href="/spelers">Spelers-pagina</Link>.
            </li>
            <li>
              Importeer het speelprogramma (Excel/CSV of plakken vanaf voetbal.nl) op de{" "}
              <Link className="text-rose-700 underline" href="/programma">Programma-pagina</Link>.
            </li>
            <li>
              Genereer het was- en rijschema op de{" "}
              <Link className="text-rose-700 underline" href="/schema">Was & rijden-pagina</Link>.
            </li>
          </ol>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Sv Steenwijkerwold JO19-1" />

      {birthdays.length > 0 && <BirthdayBanner birthdays={birthdays} />}

      {next ? (
        <NextMatchCard
          match={next}
          clubs={clubs}
          washName={wash.filter((w) => w.match_id === next.id).map((w) => playerName(w.player_id))[0]}
          driverNames={carpool.filter((c) => c.match_id === next.id).map((c) => playerName(c.player_id))}
          absentNames={absences
            .filter((a) => a.player_id && next.date >= a.from && next.date <= a.until)
            .map((a) => playerName(a.player_id as string))}
        />
      ) : (
        <Card>
          <p className="text-slate-500">Geen komende wedstrijden in het programma.</p>
        </Card>
      )}

      {lastPlayed && <LastMatchCard match={lastPlayed} />}

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">
          Spelers <span className="text-sm font-normal text-slate-500">({players.length})</span>
        </h2>
        {players.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nog geen spelers. Importeer ze op de <Link className="text-rose-700 underline" href="/spelers">Spelers-pagina</Link>.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {players.map((p) => (
              <Link
                key={p.id}
                href={`/spelers/${p.id}`}
                className={`flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md border-slate-200 hover:border-rose-300 ${
                  !p.active ? "opacity-60" : ""
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-inner ${
                    p.shirt_number ? "text-white" : "bg-slate-100 text-slate-400"
                  }`}
                  style={p.shirt_number ? JERSEY_STYLE : undefined}
                >
                  <span className="[text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">{p.shirt_number ?? "?"}</span>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold leading-tight">{p.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {p.positions.slice(0, 2).map((pos) => (
                      <span key={pos} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        {pos}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function BirthdayBanner({ birthdays }: { birthdays: { name: string; birthdate: string }[] }) {
  return (
    <Card className="mb-6 border-amber-200 bg-gradient-to-br from-amber-50 to-white">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🎂</span>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Vandaag jarig</div>
          <h2 className="mt-0.5 text-lg font-bold">
            {birthdays
              .map((b) => `${b.name} (${ageFromBirthdate(b.birthdate)} jaar)`)
              .join(", ")}
          </h2>
        </div>
      </div>
    </Card>
  );
}

function NextMatchCard({
  match,
  clubs,
  washName,
  driverNames,
  absentNames,
}: {
  match: Match;
  clubs: Club[];
  washName?: string;
  driverNames: string[];
  absentNames: string[];
}) {
  const t = computeMatchTimes(match, clubs);
  const isAway = match.home_away === "away";
  return (
    <Link href={`/wedstrijden?match=${match.id}`} className="block">
      <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-white transition-shadow hover:shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              Eerstvolgende wedstrijd
            </div>
            <h2 className="mt-1 text-xl font-bold">
              {isAway ? `${match.opponent} — Steenwijkerwold` : `Steenwijkerwold — ${match.opponent}`}
            </h2>
            <p className="text-sm text-slate-500">
              {formatDate(match.date)} · aftrap {match.kickoff_time}
            </p>
          </div>
          <Badge color={isAway ? "blue" : "green"}>{isAway ? "Uitwedstrijd" : "Thuiswedstrijd"}</Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label={isAway ? "Aanwezig (bij tegenstander)" : "Aanwezig"} value={t.arrive ?? "—"} />
          {isAway && (
            <Stat
              label="Vertrek eigen sportpark"
              value={t.depart ?? "reistijd invullen"}
              warn={!t.depart}
            />
          )}
          <Stat label="Wasbeurt 🧺" value={washName ?? "nog niet gepland"} warn={!washName} />
          {isAway && (
            <Stat
              label={`Rijders 🚗 (${driverNames.length} auto's)`}
              value={driverNames.length > 0 ? driverNames.join(", ") : "nog niet gepland"}
              warn={driverNames.length === 0}
            />
          )}
        </div>

        {absentNames.length > 0 && (
          <div className="mt-4 border-t border-rose-100 pt-3">
            <div className="text-xs text-slate-500">Afwezig 🚫</div>
            <div className="mt-0.5 font-semibold text-rose-700">{absentNames.join(", ")}</div>
          </div>
        )}

        <div className="mt-4 text-xs font-medium text-rose-700">Bekijk voorbereiding →</div>
      </Card>
    </Link>
  );
}

function LastMatchCard({ match }: { match: Match }) {
  const isAway = match.home_away === "away";
  const forGoals = match.score_for ?? 0;
  const againstGoals = match.score_against ?? 0;
  const result = forGoals > againstGoals ? "win" : forGoals < againstGoals ? "loss" : "draw";
  const resultLabel = result === "win" ? "Gewonnen" : result === "loss" ? "Verloren" : "Gelijkspel";
  const resultColor = result === "win" ? "green" : result === "loss" ? "red" : "amber";

  return (
    <Link href={`/wedstrijden?match=${match.id}`} className="block">
      <Card className="mt-6 transition-shadow hover:shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Laatst gespeeld</div>
            <h2 className="mt-1 text-lg font-bold">
              {isAway ? `${match.opponent} — Steenwijkerwold` : `Steenwijkerwold — ${match.opponent}`}
            </h2>
            <p className="text-sm text-slate-500">{formatDate(match.date)}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              {isAway ? `${againstGoals} - ${forGoals}` : `${forGoals} - ${againstGoals}`}
            </div>
            <Badge color={resultColor}>{resultLabel}</Badge>
          </div>
        </div>
        <div className="mt-3 text-xs font-medium text-slate-600">Bekijk resultaten en analyses →</div>
      </Card>
    </Link>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 font-semibold ${warn ? "text-amber-600" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
