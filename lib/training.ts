import { TrainingPhase } from "./types";

export function totalMinutes(phases: TrainingPhase[]): number {
  return phases.reduce((sum, p) => sum + (p.duur_minuten || 0), 0);
}

export function isTrainingActivity(activity: string): boolean {
  return /training/i.test(activity);
}
