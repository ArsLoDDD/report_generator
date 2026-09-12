export const FLIGHT_PLAN_STORAGE_KEY = "flight-plan-draft-v2";

type StoredFlightPlan = { date?: string; selected?: unknown[] };

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
