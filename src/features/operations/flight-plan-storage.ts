import type { FlightPlanEntry, FlightPlanRequest, FlightPlanRotation } from "./types";
import { validateFlightPlanSchedule } from "./flight-plan-model";

export const FLIGHT_PLAN_STORAGE_KEY = "flight-plan-draft-v2";
export const FLIGHT_PLAN_PENDING_STORAGE_KEY = `${FLIGHT_PLAN_STORAGE_KEY}-pending-v1`;

type PendingSaveMetadata = { date?: unknown; revision?: unknown; updatedAt?: unknown };
type StoredFlightPlan = { unitName?: string; date?: string; selected?: unknown[]; entries?: Record<number, FlightPlanEntry>; rotations?: Record<number, FlightPlanRotation[]>; pendingSave?: PendingSaveMetadata };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseStoredValue = (value: string | null): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    return isRecord(parsed) ? parsed : null;
  } catch { return null; }
};

const canonicalDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = /^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})\.(\d{2})\.(\d{4}))$/u.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1] ?? match[6]);
  const month = Number(match[2] ?? match[5]);
  const day = Number(match[3] ?? match[4]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const pendingCandidate = (value: unknown, isoDate: string) => {
  if (!isRecord(value) || canonicalDate(value.date) !== isoDate || !isRecord(value.pendingSave)) return null;
  const pending = value.pendingSave;
  if (canonicalDate(pending.date) !== isoDate || !Number.isInteger(pending.revision) || typeof pending.updatedAt !== "number" || !Number.isFinite(pending.updatedAt)) return null;
  return { stored: value as StoredFlightPlan, updatedAt: pending.updatedAt };
};

const safePendingEntry = (value: unknown, crewId: number): value is FlightPlanEntry => {
  if (!isRecord(value) || value.crewId !== crewId || typeof value.startTime !== "string" || typeof value.endTime !== "string") return false;
  if (!Array.isArray(value.actualMemberIds) || value.actualMemberIds.some((id) => !Number.isInteger(id))) return false;
  if (!Array.isArray(value.areaPoints) || value.areaPoints.some((point) => typeof point !== "string")) return false;
  if (!Array.isArray(value.uavSelections) || value.uavSelections.some((selection) => !isRecord(selection) || !Number.isInteger(selection.equipmentId))) return false;
  if (value.memberSnapshots !== undefined && (!Array.isArray(value.memberSnapshots) || value.memberSnapshots.some((member) => !isRecord(member) || !Number.isInteger(member.personnelId) || typeof member.fullName !== "string" || typeof member.rank !== "string"))) return false;
  if (value.uavSnapshots !== undefined && (!Array.isArray(value.uavSnapshots) || value.uavSnapshots.some((uav) => !isRecord(uav) || !Number.isInteger(uav.equipmentId) || typeof uav.name !== "string" || typeof uav.serialNumber !== "string"))) return false;
  return true;
};

const requestFromStored = (stored: StoredFlightPlan, allowEmpty: boolean): FlightPlanRequest | null => {
  if (!Array.isArray(stored.selected) || !isRecord(stored.entries) || (stored.rotations !== undefined && !isRecord(stored.rotations))) return null;
  const selected = stored.selected;
  if (selected.some((id) => !Number.isInteger(id))) return null;
  const crewIds = [...new Set(selected as number[])];
  if (crewIds.length !== selected.length) return null;
  const entries: FlightPlanEntry[] = [];
  for (const crewId of crewIds) {
    const entry = stored.entries?.[crewId];
    const rotations = stored.rotations?.[crewId] ?? [];
    if (!safePendingEntry(entry, crewId) || !Array.isArray(rotations) || rotations.some((rotation) => !safePendingEntry(rotation, crewId)) || !validateFlightPlanSchedule(entry, rotations).isValid) return null;
    entries.push(entry, ...rotations);
  }
  if (!allowEmpty && !entries.length) return null;
  return { unitName: typeof stored.unitName === "string" ? stored.unitName : "", entries };
};

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
  if (!date) return false;
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

/**
 * Returns only an explicitly pending, structurally safe draft for this exact date.
 * The newest matching candidate wins even when it is invalid; an older pending
 * copy must never mask a newer invalid edit and unexpectedly replace the DB state.
 */
export function flightPlanPendingDraftRequest(isoDate: string): FlightPlanRequest | null {
  const requestedDate = canonicalDate(isoDate);
  if (!requestedDate || requestedDate !== isoDate) return null;
  const main = pendingCandidate(parseStoredValue(localStorage.getItem(FLIGHT_PLAN_STORAGE_KEY)), requestedDate);
  const pendingStore = parseStoredValue(localStorage.getItem(FLIGHT_PLAN_PENDING_STORAGE_KEY));
  const sidecar = pendingCandidate(pendingStore?.[requestedDate], requestedDate);
  const newest = [main, sidecar].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)).sort((left, right) => right.updatedAt - left.updatedAt)[0];
  return newest ? requestFromStored(newest.stored, true) : null;
}
