// Sneltest voor de kernlogica: parsers, rotatie en tijdberekening.
// Uitvoeren: npx tsx scripts/test-logic.ts

import * as XLSX from "xlsx";
import { parsePlayersFile, parseMatchesFile, parseMatchesText } from "../lib/parse";
import { generateSchedule, generateCorveeSchedule, mondayOfWeek, computeMatchTimes, carsNeeded } from "../lib/schedule";
import { Absence, Club, Match, Player, ScheduleItem, WashDuty } from "../lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail && !cond ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

// ---------- 1. Spelers-Excel ----------
const playersSheet = XLSX.utils.aoa_to_sheet([
  ["Naam", "Rugnummer", "Positie", "Geboortedatum", "Contact ouder"],
  ["Jan Jansen", 1, "Keeper", "2007-03-12", "06-11111111"],
  ["Piet Pietersen", 4, "Verdediger", "2007-06-01", "06-22222222"],
  ["Klaas Klaassen", 9, "Spits", "2008-01-20", ""],
]);
const playersWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(playersWb, playersSheet, "Spelers");
const playersBuf = XLSX.write(playersWb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
const parsedPlayers = parsePlayersFile(playersBuf);
check("Spelers-Excel: 3 spelers herkend", parsedPlayers.length === 3, JSON.stringify(parsedPlayers));
check("Spelers-Excel: rugnummer herkend", parsedPlayers[0]?.shirt_number === 1);
check("Spelers-Excel: positie herkend", parsedPlayers[2]?.positions.join(",") === "SPITS");

// ---------- 2. Programma-Excel ----------
const matchesSheet = XLSX.utils.aoa_to_sheet([
  ["Datum", "Tijd", "Wedstrijd"],
  ["06-09-2025", "14:30", "Steenwijkerwold JO19-1 - FC Wolvega JO19-1"],
  ["13-09-2025", "12:00", "Olde Veste'54 JO19-2 - Steenwijkerwold JO19-1"],
]);
const matchesWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(matchesWb, matchesSheet, "Programma");
const matchesBuf = XLSX.write(matchesWb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
const parsedMatches = parseMatchesFile(matchesBuf);
check("Programma-Excel: 2 wedstrijden herkend", parsedMatches.length === 2, JSON.stringify(parsedMatches));
check("Programma-Excel: thuiswedstrijd herkend", parsedMatches[0]?.home_away === "home");
check("Programma-Excel: uitwedstrijd + tegenstander", parsedMatches[1]?.home_away === "away" && parsedMatches[1]?.opponent.includes("Olde Veste"));
check("Programma-Excel: datum goed", parsedMatches[0]?.date === "2025-09-06");

// ---------- 3. Programma geplakt (voetbal.nl-stijl) ----------
const pasted = `za 6 sep 2025 14:30 Steenwijkerwold JO19-1 - FC Wolvega JO19-1
za 13 sep 2025 12:00 Olde Veste'54 JO19-2 - Steenwijkerwold JO19-1
za 20 sep 2025 14:30 Steenwijkerwold JO19-1 - VV Heerenveen JO19-3`;
const pastedMatches = parseMatchesText(pasted);
check("Plakken: 3 wedstrijden herkend", pastedMatches.length === 3, JSON.stringify(pastedMatches));
check("Plakken: uit-wedstrijd goed", pastedMatches[1]?.home_away === "away");
check("Plakken: datum goed", pastedMatches[0]?.date === "2025-09-06");

// Meerregelige variant
const pastedMulti = `zaterdag 4 oktober 2025
14:30
Steenwijkerwold JO19-1
d'Olde Veste'54 JO19-2`;
const multi = parseMatchesText(pastedMulti);
check("Plakken meerregelig: 1 wedstrijd", multi.length === 1, JSON.stringify(multi));

// ---------- 4. Rotatie ----------
const players: Player[] = Array.from({ length: 15 }, (_, i) => ({
  id: `p${i}`,
  name: `Speler ${String.fromCharCode(65 + i)}`,
  shirt_number: i + 1,
  positions: [],
  birthdate: null,
  parent_contact: null,
  active: i < 14, // 14 actief, 1 inactief
  token: null,
  ai_summary: null,
  ai_summary_generated_at: null,
}));
const matches: Match[] = Array.from({ length: 22 }, (_, i) => ({
  id: `m${i}`,
  date: `2025-${String(9 + Math.floor(i / 8)).padStart(2, "0")}-${String((i % 8) * 3 + 1).padStart(2, "0")}`,
  kickoff_time: "14:30",
  home_away: i % 2 === 0 ? "home" : "away",
  opponent: `Club ${i}`,
  competition: null,
  notes: null,
  score_for: null,
  score_against: null,
  possession_pct: null,
  shots_for: null,
  shots_against: null,
  shots_on_target_for: null,
  shots_on_target_against: null,
  corners_for: null,
  corners_against: null,
  fouls_for: null,
  fouls_against: null,
}));

const { wash, carpool } = generateSchedule(players, matches);
check("Rotatie: elke wedstrijd 1 wasbeurt", wash.length === 22);

const awayCount = matches.filter((m) => m.home_away === "away").length;
const expectedCars = carsNeeded(14); // ceil(14/4) = 4
check("Rotatie: 4 auto's per uitwedstrijd", expectedCars === 4);
check("Rotatie: rijbeurten = uitwedstrijden × auto's", carpool.length === awayCount * expectedCars, `${carpool.length} vs ${awayCount * expectedCars}`);

const inactiveUsed = [...wash, ...carpool].some((d) => d.player_id === "p14");
check("Rotatie: inactieve speler niet ingepland", !inactiveUsed);

const washCounts = new Map<string, number>();
wash.forEach((w) => washCounts.set(w.player_id, (washCounts.get(w.player_id) ?? 0) + 1));
const washVals = [...washCounts.values()];
check("Rotatie: wasbeurten eerlijk (max verschil 1)", Math.max(...washVals) - Math.min(...washVals) <= 1, JSON.stringify(washVals));

const carCounts = new Map<string, number>();
players.filter((p) => p.active).forEach((p) => carCounts.set(p.id, 0));
carpool.forEach((c) => carCounts.set(c.player_id, (carCounts.get(c.player_id) ?? 0) + 1));
const carVals = [...carCounts.values()];
check("Rotatie: rijbeurten eerlijk (max verschil 1)", Math.max(...carVals) - Math.min(...carVals) <= 1, JSON.stringify(carVals));

// ---------- 5. Tijdberekening ----------
const clubs: Club[] = [{ id: "c1", name: "Club 1", address: null, travel_time_minutes: 35 }];
const homeMatch = matches[0]; // home, 14:30
const awayMatch = matches[1]; // away tegen "Club 1", 14:30
const tHome = computeMatchTimes(homeMatch, clubs);
const tAway = computeMatchTimes(awayMatch, clubs);
check("Tijd: thuis aanwezig = 13:30", tHome.arrive === "13:30", JSON.stringify(tHome));
check("Tijd: thuis geen vertrektijd", tHome.depart === null);
check("Tijd: uit aanwezig = 13:30", tAway.arrive === "13:30", JSON.stringify(tAway));
check("Tijd: uit vertrek = 12:55 (35 min reistijd)", tAway.depart === "12:55", JSON.stringify(tAway));

const tAwayNoTravel = computeMatchTimes({ ...awayMatch, opponent: "Onbekende Club" }, clubs);
check("Tijd: uit zonder reistijd → geen vertrektijd", tAwayNoTravel.depart === null);

// ---------- 6. Corvee ----------
const corveePlayers = players.filter((p) => p.active); // 14 actief
const corveeSchedule: ScheduleItem[] = Array.from({ length: 8 }, (_, i) => ({
  id: `s${i}`,
  date: `2025-09-${String(1 + i * 3).padStart(2, "0")}`, // om de 3 dagen, 8 weken lang
  activity: `training ${i + 1}`,
  kickoff_time: null,
  home_away: null,
  travel_time_minutes: null,
  notes: null,
}));
const week0 = mondayOfWeek(corveeSchedule[0].date);
const wash0: WashDuty[] = [{ id: "w0", match_id: matches[0].id, player_id: corveePlayers[0].id }];
const matchWeek0: Match[] = [{ ...matches[0], date: corveeSchedule[0].date }];
const absentPlayer = corveePlayers[5].id;
const absences0: Absence[] = [
  {
    id: "a0",
    player_id: absentPlayer,
    staff_id: null,
    from: week0,
    until: mondayOfWeek(corveeSchedule[0].date),
    reason: "test",
    reported_by: "staff",
    acknowledged: true,
  },
];

// "Vandaag" gefixeerd op de eerste trainingsdatum van de fixture, anders vallen
// alle testweken (2025) in het verleden t.o.v. de echte huidige datum en
// filtert generateCorveeSchedule ze allemaal weg.
const fixtureToday = corveeSchedule[0].date;
const corvee = generateCorveeSchedule(players, corveeSchedule, matchWeek0, wash0, absences0, [], fixtureToday);
const corveeWeeksCount = new Set(corveeSchedule.map((s) => mondayOfWeek(s.date))).size;
check("Corvee: 3 spelers per trainingsweek", corvee.length === corveeWeeksCount * 3, `${corvee.length} vs ${corveeWeeksCount * 3}`);

const inactiveInCorvee = corvee.some((c) => c.player_id === "p14");
check("Corvee: inactieve speler niet ingepland", !inactiveInCorvee);

const week0Duties = corvee.filter((c) => c.week_start === week0);
check("Corvee: wasbeurt-speler zit in corvee van diezelfde week", week0Duties.some((d) => d.player_id === corveePlayers[0].id));
check("Corvee: bekend afwezige speler die week vermeden", !week0Duties.some((d) => d.player_id === absentPlayer));

const corveeCounts = new Map<string, number>();
corveePlayers.forEach((p) => corveeCounts.set(p.id, 0));
corvee.forEach((c) => corveeCounts.set(c.player_id, (corveeCounts.get(c.player_id) ?? 0) + 1));
const corveeVals = [...corveeCounts.values()];
check("Corvee: eerlijk verdeeld (max verschil 1)", Math.max(...corveeVals) - Math.min(...corveeVals) <= 1, JSON.stringify(corveeVals));

// Opnieuw genereren met de al aangemaakte rijen als "bestaand" mag niks toevoegen.
const corveeAgain = generateCorveeSchedule(players, corveeSchedule, matchWeek0, wash0, absences0, corvee, fixtureToday);
check("Corvee: opnieuw genereren voegt niks toe aan al ingevulde weken", corveeAgain.length === 0, `${corveeAgain.length} nieuwe rijen`);

// Weken vóór "vandaag" tellen niet mee, ook al hebben ze nog geen corvee.
const pastWeekToday = corveeSchedule[corveeSchedule.length - 1].date; // laatste trainingsdatum = "nu"
const corveeFromNow = generateCorveeSchedule(players, corveeSchedule, matchWeek0, wash0, absences0, [], pastWeekToday);
const onlyCurrentWeek = new Set(corveeFromNow.map((c) => c.week_start)).size === 1;
check("Corvee: weken vóór de huidige week worden overgeslagen", onlyCurrentWeek, JSON.stringify([...new Set(corveeFromNow.map((c) => c.week_start))]));

console.log(failures === 0 ? "\nAlles geslaagd ✅" : `\n${failures} test(s) gefaald ❌`);
process.exit(failures === 0 ? 0 : 1);
