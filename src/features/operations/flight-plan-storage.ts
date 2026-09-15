import type { FlightPlanEntry, FlightPlanRequest, FlightPlanRotation } from "./types";
import { validateFlightPlanSchedule } from "./flight-plan-model";

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

const minuteOfDay = (value?: string) => {
  const [hours, minutes] = (value ?? "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
};

const operationalMinute = (value: number) => value < 18 * 60 + 1 ? value + 24 * 60 : value;

const momentOnPlanDate = (date: string | undefined, time: string | undefined) => {
  const minute = minuteOfDay(time);
  if (minute === null || !date) return null;
  const parts = date.includes(".") ? date.split(".").reverse() : date.split("-");
  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, Math.floor(minute / 60), minute % 60).getTime();
};

const activeStage = (stored: StoredFlightPlan, crewId: number, now: Date) => {
  const primary = stored.entries?.[crewId];
  if (!primary) return null;
  const storedRotations = stored.rotations?.[crewId] ?? [];
  const validation = validateFlightPlanSchedule(primary, storedRotations);
  const rotations = validation.rotationError ? [] : storedRotations;
  const nowMinute = operationalMinute(now.getHours() * 60 + now.getMinutes());
  const transitionHasHappened = (time?: string) => {
    const timestamp = momentOnPlanDate(stored.date, time);
    if (timestamp !== null) return now.getTime() >= timestamp;
    const minute = minuteOfDay(time);
    return minute !== null && nowMinute >= operationalMinute(minute);
  };
  if (primary.arrivesToday && primary.startTime && !transitionHasHappened(primary.startTime)) return null;
  if (primary.departsToday && !validation.departureError && !validation.rotationError && primary.departureTime && transitionHasHappened(primary.departureTime)) return null;
  let current: FlightPlanEntry = primary;
  for (const rotation of rotations) {
    if (rotation.startTime && transitionHasHappened(rotation.startTime)) current = rotation;
  }
  return current;
};

export function flightPlanActiveCrewIds(now = new Date()): Set<number> {
  const stored = flightPlanSnapshot();
  if (!Array.isArray(stored.selected)) return new Set();
  return new Set(stored.selected.filter((id: unknown): id is number => Number.isInteger(id) && (!stored.entries?.[id as number] || Boolean(activeStage(stored, id as number, now)))));
}

/** Returns the composition physically on position. Work-end time does not remove a crew. */
export function flightPlanActiveMemberIds(now = new Date()): Set<number> {
  const stored = flightPlanSnapshot();
  if (!Array.isArray(stored.selected) || !stored.entries) return new Set();
  const active = new Set<number>();
  stored.selected.filter((id: unknown): id is number => Number.isInteger(id)).forEach((crewId) => {
    activeStage(stored, crewId, now)?.actualMemberIds?.forEach((id) => active.add(id));
  });
  return active;
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
  if (selected.some((crewId) => {
    const entry = stored.entries?.[crewId];
    return !entry || !validateFlightPlanSchedule(entry, stored.rotations?.[crewId] ?? []).isValid;
  })) return null;
  const entries = selected.flatMap((crewId) => {
    const entry = stored.entries?.[crewId];
    return entry ? [entry, ...(stored.rotations?.[crewId] ?? [])] : [];
  });
  return entries.length ? { unitName: stored.unitName ?? "", entries } : null;
}
