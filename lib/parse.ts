import * as XLSX from "xlsx";
import { Match, Player } from "./types";
import { generateToken } from "./token";
import { parsePositions } from "./positions";

// Flexibele import-parsers: herkennen kolommen op naam (Sportlink/voetbal.nl
// exports verschillen per seizoen) en accepteren ook geplakte tekst.

export const OWN_TEAM_KEYWORD = "steenwijkerwold";

type RawRow = Record<string, unknown>;

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], candidates: string[]): string | null {
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (candidates.some((c) => n.includes(c))) return h;
  }
  return null;
}

function cellString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// Excel-datums kunnen als serienummer, Date of tekst binnenkomen.
function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const s = cellString(v);
  return parseDutchDate(s);
}

const DUTCH_MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
  juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, mrt: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  okt: 10, nov: 11, dec: 12,
};

export function parseDutchDate(s: string): string | null {
  const str = s.trim().toLowerCase();

  // 2025-09-06
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // 06-09-2025, 6/9/2025, 06-09-25
  m = /(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/.exec(str);
  if (m) {
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  // "6 september 2025" of "za 6 sep" (zonder jaar → volgend voorkomen)
  m = /(\d{1,2})\s+([a-z]+)\.?\s*(\d{4})?/.exec(str);
  if (m && DUTCH_MONTHS[m[2]]) {
    const day = parseInt(m[1], 10);
    const month = DUTCH_MONTHS[m[2]];
    let year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    if (!m[3]) {
      const candidate = new Date(year, month - 1, day);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (candidate < now) year += 1;
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function parseTime(v: unknown): string | null {
  if (typeof v === "number" && v > 0 && v < 1) {
    // Excel-tijd als dagfractie
    const total = Math.round(v * 24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  const s = cellString(v);
  const m = /(\d{1,2})[:.](\d{2})/.exec(s);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function sheetRows(data: ArrayBuffer): RawRow[] {
  const wb = XLSX.read(data, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
}

// ---------- Spelers ----------

export type ParsedPlayer = Omit<Player, "id">;

export function parsePlayersFile(data: ArrayBuffer): ParsedPlayer[] {
  const rows = sheetRows(data);
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);

  const nameCol =
    findColumn(headers, ["naam", "name", "speler", "lid"]) ?? headers[0];
  const numberCol = findColumn(headers, ["rugnummer", "nummer", "nr", "shirt"]);
  const positionCol = findColumn(headers, ["positie", "position", "rol"]);
  const birthCol = findColumn(headers, ["geboorte", "gebdatum", "birth"]);
  const contactCol = findColumn(headers, ["contact", "telefoon", "mobiel", "email", "ouder"]);

  const players: ParsedPlayer[] = [];
  for (const row of rows) {
    const name = cellString(row[nameCol]);
    if (!name || normalizeHeader(name) === "naam") continue;
    const num = numberCol ? parseInt(cellString(row[numberCol]), 10) : NaN;
    players.push({
      name,
      shirt_number: isNaN(num) ? null : num,
      positions: positionCol ? parsePositions(cellString(row[positionCol])) : [],
      birthdate: birthCol ? toIsoDate(row[birthCol]) : null,
      parent_contact: contactCol ? cellString(row[contactCol]) || null : null,
      active: true,
      token: generateToken(),
      ai_summary: null,
      ai_summary_generated_at: null,
    });
  }
  return players;
}

// ---------- Programma ----------

export type ParsedMatch = Omit<Match, "id">;

function matchFromTeams(
  date: string,
  time: string,
  homeTeam: string,
  awayTeam: string,
  competition: string | null
): ParsedMatch {
  const isHome = homeTeam.toLowerCase().includes(OWN_TEAM_KEYWORD);
  return {
    date,
    kickoff_time: time,
    home_away: isHome ? "home" : "away",
    opponent: (isHome ? awayTeam : homeTeam).trim(),
    competition,
    notes: null,
    score_for: null,
    score_against: null,
  };
}

export function parseMatchesFile(data: ArrayBuffer): ParsedMatch[] {
  const rows = sheetRows(data);
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);

  const dateCol = findColumn(headers, ["datum", "date", "dag"]);
  const timeCol = findColumn(headers, ["tijd", "aanvang", "time", "aftrap"]);
  const matchCol = findColumn(headers, ["wedstrijd", "match", "duel"]);
  const homeCol = findColumn(headers, ["thuis", "home"]);
  const awayCol = findColumn(headers, ["uitteam", "gast", "tegenstander", "away"]);
  const compCol = findColumn(headers, ["competitie", "klasse", "poule", "type"]);

  const matches: ParsedMatch[] = [];
  for (const row of rows) {
    const date = dateCol ? toIsoDate(row[dateCol]) : null;
    const time = timeCol ? parseTime(row[timeCol]) : null;
    if (!date || !time) continue;
    const competition = compCol ? cellString(row[compCol]) || null : null;

    if (matchCol) {
      const parts = cellString(row[matchCol]).split(/\s+-\s+|\s+–\s+/);
      if (parts.length >= 2) {
        matches.push(matchFromTeams(date, time, parts[0], parts[1], competition));
        continue;
      }
    }
    if (homeCol && awayCol) {
      const home = cellString(row[homeCol]);
      const away = cellString(row[awayCol]);
      if (home && away) {
        matches.push(matchFromTeams(date, time, home, away, competition));
      }
    }
  }
  return matches;
}

const WEEKDAYS = [
  "ma", "di", "wo", "do", "vr", "za", "zo",
  "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag",
];

// Verwijdert voorafgaande datum/tijd-tokens ("za 6 sep 2025 14:30 Teamnaam" → "Teamnaam")
function stripDateTimePrefix(s: string): string {
  const tokens = s.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i].toLowerCase().replace(/[.,]/g, "");
    const isWeekday = WEEKDAYS.includes(t);
    const isMonth = Boolean(DUTCH_MONTHS[t]);
    const isNumberish = /^\d{1,4}([-/:.]\d{1,4}){0,2}$/.test(t);
    if (isWeekday || isMonth || isNumberish) i++;
    else break;
  }
  return tokens.slice(i).join(" ");
}

/**
 * Parser voor geplakte tekst van voetbal.nl: verzamelt per regel datum, tijd
 * en "Thuisteam - Uitteam". Werkt zowel met alles-op-één-regel als met
 * meerregelige blokken per wedstrijd.
 */
export function parseMatchesText(text: string): ParsedMatch[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const matches: ParsedMatch[] = [];

  let pendingDate: string | null = null;
  let pendingTime: string | null = null;
  let pendingHome: string | null = null;

  const flushIfComplete = (homeTeam: string, awayTeam: string) => {
    if (pendingDate && pendingTime) {
      matches.push(matchFromTeams(pendingDate, pendingTime, homeTeam, awayTeam, null));
      pendingTime = null;
      pendingHome = null;
    }
  };

  for (const line of lines) {
    const date = parseDutchDate(line);
    // Alleen als datum-achtig deel vooraan staat (voorkomt uitslagen als datum lezen)
    if (date && /^[a-z]{0,10}\.?\s*\d/i.test(line)) pendingDate = date;

    const timeMatch = /(?:^|\s)(\d{1,2}[:.]\d{2})(?:\s|$)/.exec(line);
    if (timeMatch) pendingTime = timeMatch[1].replace(".", ":").padStart(5, "0");

    // "Team A - Team B" op één regel (eventueel met datum/tijd ervoor)
    const teams = line.split(/\s+-\s+|\s+–\s+/);
    if (teams.length >= 2) {
      const home = stripDateTimePrefix(teams[0]);
      const away = stripDateTimePrefix(teams.slice(1).join(" - "));
      if (home.length > 2 && away.length > 2) {
        flushIfComplete(home, away);
        continue;
      }
    }

    // Meerregelig: teamnaam-regels (bevatten letters, geen datum/tijd)
    const looksLikeTeam =
      /[a-z]{3,}/i.test(line) && !date && !timeMatch && !/^(uitslag|programma|competitie|beker)/i.test(line);
    if (looksLikeTeam) {
      if (pendingHome === null) {
        pendingHome = line;
      } else {
        flushIfComplete(pendingHome, line);
      }
    }
  }

  return matches;
}
