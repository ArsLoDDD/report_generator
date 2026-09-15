import type { FlightPlanEntry, FlightPlanRequest, FlightPlanRotation } from "./types";

export const FLIGHT_PLAN_STORAGE_KEY = "flight-plan-draft-v2";

type StoredFlightPlan = { unitName?: string; date?: string; selected?: unknown[]; entries?: Record<number, FlightPlanEntry>; rotations?: Record<number, FlightPlanRotation[]> };

export function flightPlanSnapshot(): StoredFlightPlan {
  try { return JSON.parse(localStorage.getItem(FLIGHT_PLAN_STORAGE_KEY) ?? "{}"); }
  catch { return {}; }
}

export function flightPlanSelectedCrewIds(): Set<number> {
  const stored = flightPlanSnapshot();
  if (!Array.isArray(stored.selected)) return new Set();
  return new Set(stored.selected.filter((id: unknown): id is number => Number.isInteger(id)));
}

export const flightPlanDateMatches = (isoDate: string) => {
  const { date } = flightPlanSnapshot();
  if (!date) return true;
  const [year, month, day] = isoDate.split("-");
  return date === `${day}.${month}.${year}` || date === isoDate;
};

export function flightPlanDraftRequest(isoDate: string): FlightPlanRequest | null {
  const stored = flightPlanSnapshot();
  if (!flightPlanDateMatches(isoDate) || !Array.isArray(stored.selected) || !stored.entries) return null;
  const selected = stored.selected.filter((id: unknown): id is number => Number.isInteger(id));
  const entries = selected.flatMap((crewId) => {
    const entry = stored.entries?.[crewId];
    return entry ? [entry, ...(stored.rotations?.[crewId] ?? [])] : [];
  });
  return entries.length ? { unitName: stored.unitName ?? "", entries } : null;
}
