export type TrainingCategory = "bal" | "loop" | "alternatief";

export type TrainingTemplate = {
  id: string;
  category: TrainingCategory;
  title: string;
  description: string;
};

export const TRAINING_CATEGORY_LABELS: Record<TrainingCategory, string> = {
  bal: "Met bal",
  loop: "Zonder bal (hardlooptraining)",
  alternatief: "Alternatieve sport",
};

export const CATEGORY_ORDER: TrainingCategory[] = ["bal", "loop", "alternatief"];
export const TRAINING_CATEGORY_ICON: Record<TrainingCategory, string> = {
  bal: "⚽",
  loop: "🏃",
  alternatief: "🔄",
};

// Extra trainingen conditieopbouw voorseizoen — geschikt voor JO19 2e klasse.
// Allemaal in je eentje uit te voeren (geen teamgenoten/tegenstander nodig).
export const TRAINING_TEMPLATES: TrainingTemplate[] = [
  {
    id: "bal-afwerkcircuit",
    category: "bal",
    title: "Afwerkcircuit alleen",
    description:
      "Dribbel 20m naar het doel (of een afgebakend vak) en werk af op een target (bv. pionnen in de hoeken). Sprint daarna terug naar start. 10 ronden, 45 sec rust tussen elke ronde. Combineert balgevoel en afwerking met conditie, volledig alleen te doen.",
  },
  {
    id: "bal-dribbelsprint",
    category: "bal",
    title: "Dribbel- en sprintparcours met bal",
    description:
      "Slalom van 6 pionnen (dribbelen met bal), gevolgd door een sprint van 15m zonder bal terug naar start. 8-10 herhalingen, 45 sec rust tussen elke herhaling. Traint explosiviteit en balcontrole onder vermoeidheid.",
  },
  {
    id: "bal-muurtje",
    category: "bal",
    title: "Pass- en aannametraining tegen de muur",
    description:
      "Continu passen tegen een muur/rebounder, iedere 10 passes een sprint van 10m heen-en-terug voordat je verder gaat. 6 blokken van 3 minuten, 1 minuut rust. Scherpt eerste aanname en pass-techniek terwijl de hartslag hoog blijft — alleen uit te voeren.",
  },
  {
    id: "loop-duurloop",
    category: "loop",
    title: "Duurloop opbouw",
    description:
      "Rustige, doorlopende duurloop van 30-40 minuten in een tempo waarbij nog goed gepraat kan worden. Basis voor de aerobe conditie waarop later in het seizoen wordt voortgebouwd.",
  },
  {
    id: "loop-interval-400",
    category: "loop",
    title: "Interval hardlooptraining (400m)",
    description:
      "8-10x 400m op ongeveer 85-90% van maximale snelheid, met 90 seconden actieve rust (rustig lopen/wandelen) tussen elke herhaling. Bouwt zowel het aerobe als anaerobe uithoudingsvermogen op.",
  },
  {
    id: "loop-sprint-hiit",
    category: "loop",
    title: "Sprintintervallen (Yo-Yo-stijl)",
    description:
      "Shuttle-sprints van 20m heen en terug, in oplopend tempo met korte actieve rust (loop de laatste 5m rustig uit voor je terugkeert). Alleen uit te voeren met een stopwatch of gratis Yo-Yo/beep-test-app als tijdklok. Vergelijkbaar met de opbouw van de Yo-Yo Intermittent Recovery Test die vaak als conditietest wordt gebruikt in het amateurvoetbal.",
  },
  {
    id: "alt-fietsen",
    category: "alternatief",
    title: "Duurtraining op de (race)fiets",
    description:
      "45-60 minuten fietsen in een rustig tot matig tempo. Blessurevrije manier om de aerobe basisconditie op te bouwen en de benen te belasten zonder de impact van hardlopen.",
  },
  {
    id: "alt-zwemmen",
    category: "alternatief",
    title: "Zwemtraining",
    description:
      "30-45 minuten zwemmen, afwisselend rustige banen en iets snellere baantjes. Traint de conditie en longcapaciteit met minimale belasting op gewrichten — ook goed te gebruiken als actief herstel.",
  },
  {
    id: "alt-boksen",
    category: "alternatief",
    title: "Bokstraining (schaduwboksen of bokszak)",
    description:
      "20-30 minuten schaduwboksen of werken op een bokszak: blokken van 3 minuten met 1 minuut rust, zoals boksronden. Traint explosiviteit, voetenwerk en reactiesnelheid op een andere manier dan voetbal — zonder sparringpartner nodig.",
  },
];
