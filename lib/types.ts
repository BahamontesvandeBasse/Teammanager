export type Player = {
  id: string;
  name: string;
  shirt_number: number | null;
  positions: string[]; // bv. ["CV", "RV"] — kan meerdere posities per speler bevatten
  birthdate: string | null; // YYYY-MM-DD
  parent_contact: string | null;
  active: boolean;
  token: string | null; // toegangscode voor het mobiele spelersscherm (/mijn/[token])
  ai_summary: string | null; // door Claude gegenereerd spelersprofiel op basis van stats, belasting en video-observaties
  ai_summary_generated_at: string | null;
};

export type StaffMember = {
  id: string;
  name: string;
  role: string | null; // taak, bv. "Coach, Trainer"
  contact: string | null; // telefoon of e-mail
  birthdate: string | null; // YYYY-MM-DD
};

export type Club = {
  id: string;
  name: string;
  address: string | null; // adres van het sportpark, gebruikt om de reistijd op te halen via Google Maps
  travel_time_minutes: number | null;
};

// Vertrekpunt voor alle reistijdberekeningen (Google Maps Distance Matrix).
export const HOME_ADDRESS = "Oldemarktseweg 92, 8341 SH Steenwijkerwold";

export type Match = {
  id: string;
  date: string; // YYYY-MM-DD
  kickoff_time: string; // HH:mm
  home_away: "home" | "away";
  opponent: string;
  competition: string | null;
  notes: string | null;
  score_for: number | null; // doelpunten Sv Steenwijkerwold — alleen bij gespeelde wedstrijden
  score_against: number | null;
};

export type WashDuty = {
  id: string;
  match_id: string;
  player_id: string;
};

export type CarpoolDuty = {
  id: string;
  match_id: string;
  player_id: string;
};

export type MatchStat = {
  id: string;
  match_id: string;
  player_id: string;
  goals: number;
  assists: number;
  minutes_played: number;
  rating: number | null; // beoordeling van de staf, 1-10
};

export type LoadEntry = {
  id: string;
  player_id: string;
  date: string; // YYYY-MM-DD
  session_type: "training" | "wedstrijd";
  absent: boolean; // speler was afwezig — overige velden zijn dan niet van toepassing (null)
  minutes: number | null;
  rpe: number | null; // 1-10, hoe zwaar was de sessie
  notes: string | null;
  fatigue: number | null; // 1-10, vermoeidheid (zelfde schaal als RPE)
  soreness: number | null; // 1-10, spierpijn (zelfde schaal als RPE)
  injury_flag: boolean;
  reported_by: "staff" | "player";
};

export type Message = {
  id: string;
  player_id: string; // het spelersthread waar dit bericht bij hoort
  sender: "staff" | "player";
  sender_name: string | null; // naam van het staflid (bij sender "staff")
  body: string;
  created_at: string;
};

export type IndividualTraining = {
  id: string;
  player_id: string;
  title: string;
  description: string | null;
  target_date: string | null; // YYYY-MM-DD
  status: "open" | "voltooid";
  notes: string | null;
  created_at: string;
  created_by: "staff" | "player"; // "player" = zelf gekozen via het mobiele scherm (vrijblijvende extra training)
};

export type ScheduleItem = {
  id: string;
  date: string; // YYYY-MM-DD
  activity: string; // bv. "training 2", "GEMPO Toermooi (thuis)" — wedstrijden staan in `matches`, niet hier
  kickoff_time: string | null; // HH:mm, alleen bij toernooien
  home_away: "home" | "away" | null;
  travel_time_minutes: number | null; // reistijd vanaf Sportpark Sv Steenwijkerwold, alleen bij "away"
  notes: string | null;
};

export type TrainingPhase = {
  fase: string; // bv. "Warming up", "Oriëntatie", "Tussenvorm", "Oefenleerfase", "Toepassingsfase"
  wat: string; // inhoud/oefenvorm
  duur_minuten: number;
  exercise_id?: string | null; // koppeling naar de oefeningenbank, voor de visuele weergave (tekening, omschrijving, tags)
};

export type TrainingSession = {
  id: string;
  schedule_item_id: string; // koppeling met de trainingsregel in de Seizoensplanning, 1 sessie per training
  phases: TrainingPhase[];
};

// Oefeningenbank: herbruikbare oefeningen per trainingsfase, om trainingen mee samen te stellen.
export type ExercisePhase = "warming_up" | "orientatie" | "oefenleerfase" | "toepassingsfase" | "tussenvorm";

export const EXERCISE_PHASES: ExercisePhase[] = [
  "warming_up",
  "orientatie",
  "oefenleerfase",
  "toepassingsfase",
  "tussenvorm",
];

export const EXERCISE_PHASE_LABELS: Record<ExercisePhase, string> = {
  warming_up: "Warming-up",
  orientatie: "Oriëntatiefase",
  oefenleerfase: "Oefenleerfase",
  toepassingsfase: "Toepassingsfase",
  tussenvorm: "Tussenvorm",
};

export const EXERCISE_PHASE_ICON: Record<ExercisePhase, string> = {
  warming_up: "🔥",
  orientatie: "🧭",
  oefenleerfase: "🎯",
  toepassingsfase: "🏆",
  tussenvorm: "🔄",
};

// Sub-categorieën per fase, om de bank doorzoekbaar te houden.
export const EXERCISE_SUBCATEGORIES: Record<ExercisePhase, string[]> = {
  warming_up: ["Zonder bal", "Met bal"],
  orientatie: ["Positiespel", "Kleine partijvorm", "Rondo"],
  oefenleerfase: ["Technische vorm", "Partijvorm met leerdoel", "Duelvorm (1v1/2v2)"],
  toepassingsfase: ["Partijvorm groot", "Positiespel wedstrijdecht", "Partij met regels"],
  tussenvorm: ["Techniek", "Kracht", "Conditie"],
};

export type ExerciseSource = "handmatig" | "ai" | "rinus" | "feeton";

export const EXERCISE_SOURCE_LABELS: Record<ExerciseSource, string> = {
  handmatig: "Handmatig",
  ai: "AI-gegenereerd",
  rinus: "Rinus",
  feeton: "Feeton",
};

export type Exercise = {
  id: string;
  phase: ExercisePhase;
  subcategory: string;
  title: string;
  description: string;
  duration_minutes: number;
  source: ExerciseSource;
  tags: string[];
  created_at: string;
  drawing: DrawingElement[]; // tekening op het tactiekbord, zelfde tekentool als bij de wedstrijdvoorbereiding
};

// Herbruikbare warming-up routine, te kiezen bij de wedstrijdvoorbereiding.
export type WarmingUp = {
  id: string;
  name: string;
  description: string | null; // oefeningen/opbouw
};

export type Absence = {
  id: string;
  player_id: string | null; // precies één van player_id/staff_id is gezet
  staff_id: string | null;
  from: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD, inclusief
  reason: string | null;
};

// KNVB-indeling: elke tactische aanwijzing valt in één van deze 4 momenten.
export type TacticalMoment = "attacking" | "defending" | "transition_to_attack" | "transition_to_defense";

export type TacticalMomentNotes = Record<TacticalMoment, string>;

export type Line = "verdediging" | "middenveld" | "aanval";

export type TacticalNotes = {
  team: TacticalMomentNotes; // afspraken die voor het hele team gelden
  line: Record<Line, TacticalMomentNotes>; // afspraken per linie, elk met de 4 KNVB-momenten
};

function emptyMomentNotes(): TacticalMomentNotes {
  return { attacking: "", defending: "", transition_to_attack: "", transition_to_defense: "" };
}

export function emptyTacticalNotes(): TacticalNotes {
  return {
    team: emptyMomentNotes(),
    line: { verdediging: emptyMomentNotes(), middenveld: emptyMomentNotes(), aanval: emptyMomentNotes() },
  };
}

// Eén tekenbord-element (vergelijkbaar met KNVB Rinus), coördinaten in canvas-pixels.
export type LineStyle = "freehand" | "pass" | "run" | "dribble";

export type DrawingElement =
  | { kind: "line"; style: LineStyle; color: string; points: { x: number; y: number }[] }
  | { kind: "player"; team: "own" | "opponent"; x: number; y: number; number: string | null }
  | { kind: "ball"; x: number; y: number };

export type MatchPreparation = {
  id: string;
  match_id: string; // 1 voorbereiding per wedstrijd
  formation: string | null; // bv. "4-3-3"
  warmup_id: string | null; // gekozen warming-up routine
  // basisopstelling met positie op het veld; player_id is null bij een gastspeler (dan is guest_name gezet)
  lineup: { slot: string; player_id: string | null; guest_name?: string | null; note?: string | null }[];
  substitutes: string[]; // player-ids, wisselspelers
  tactical_notes: TacticalNotes | null; // speelwijze/aandachtspunten, per team-/linieniveau en KNVB-moment
  set_piece_ids: string[]; // gekozen spelhervattingen uit de bank (zie SetPiece), los per wedstrijd te kiezen
  // Eén tekening per onderdeel, gesleuteld op "team" of "line:verdediging"/"line:middenveld"/"line:aanval".
  drawings: Record<string, DrawingElement[]>;
};

// Spelhervattingenbank: los van de wedstrijdvoorbereiding. Spelers en staf kunnen
// een spelhervatting voorstellen (approved: false); de staf keurt goed of verwijdert
// 'm. Alleen goedgekeurde spelhervattingen zijn te kiezen bij een wedstrijdvoorbereiding.
export type SetPieceCategory =
  | "corner"
  | "vrije_trap_schot"
  | "vrije_trap_voorzet"
  | "aftrap"
  | "inworp"
  | "keeperbal";

export const SET_PIECE_CATEGORIES: SetPieceCategory[] = [
  "corner",
  "vrije_trap_schot",
  "vrije_trap_voorzet",
  "aftrap",
  "inworp",
  "keeperbal",
];

export const SET_PIECE_CATEGORY_LABELS: Record<SetPieceCategory, string> = {
  corner: "Corner",
  vrije_trap_schot: "Vrije trap — schot op doel",
  vrije_trap_voorzet: "Vrije trap — voorzet",
  aftrap: "Aftrap",
  inworp: "Inworp",
  keeperbal: "Keeperbal",
};

export type SetPieceSide = "attacking" | "defending";

export const SET_PIECE_SIDES: SetPieceSide[] = ["attacking", "defending"];

export const SET_PIECE_SIDE_LABELS: Record<SetPieceSide, string> = {
  attacking: "Aanvallen",
  defending: "Verdedigen",
};

export type SetPiece = {
  id: string;
  category: SetPieceCategory;
  side: SetPieceSide;
  title: string;
  description: string;
  drawing: DrawingElement[];
  approved: boolean; // false = nog een suggestie, wacht op goedkeuring door de staf
  suggested_by: "staff" | "player";
  suggested_by_player_id: string | null; // gezet wanneer suggested_by === "player"
  created_at: string;
};

export type VideoLink = {
  id: string;
  match_id: string;
  veo_url: string;
  title: string | null;
  ai_advice: string | null; // door Claude gegenereerd coachadvies op basis van de video_notes
  ai_advice_generated_at: string | null;
};

export type VideoNote = {
  id: string;
  video_link_id: string;
  timestamp_seconds: number;
  player_id: string | null;
  note: string;
};

export type EntityMap = {
  players: Player;
  staff: StaffMember;
  clubs: Club;
  matches: Match;
  wash_duty: WashDuty;
  carpool_duty: CarpoolDuty;
  match_stats: MatchStat;
  load_entries: LoadEntry;
  individual_trainings: IndividualTraining;
  messages: Message;
  schedule_items: ScheduleItem;
  match_preparations: MatchPreparation;
  video_links: VideoLink;
  video_notes: VideoNote;
  absences: Absence;
  training_sessions: TrainingSession;
  warmups: WarmingUp;
  exercises: Exercise;
  set_pieces: SetPiece;
};

export type EntityName = keyof EntityMap;

export const ENTITIES: EntityName[] = [
  "players",
  "staff",
  "clubs",
  "matches",
  "wash_duty",
  "carpool_duty",
  "match_stats",
  "load_entries",
  "individual_trainings",
  "messages",
  "schedule_items",
  "match_preparations",
  "video_links",
  "video_notes",
  "absences",
  "training_sessions",
  "warmups",
  "exercises",
  "set_pieces",
];

export const TEAM_NAME = "Sv Steenwijkerwold JO19-1";
export const ARRIVE_MINUTES_BEFORE_KICKOFF = 60;
export const PLAYERS_PER_CAR = 4;
