export const FLIGHT_PLAN_STORAGE_KEY = "flight-plan-draft-v2";

export function flightPlanSelectedCrewIds(): Set<number> {
  try {
    const stored = JSON.parse(localStorage.getItem(FLIGHT_PLAN_STORAGE_KEY) ?? "{}");
    if (!Array.isArray(stored.selected)) return new Set();
    return new Set(stored.selected.filter((id: unknown): id is number => Number.isInteger(id)));
  } catch {
    return new Set();
  }
}
