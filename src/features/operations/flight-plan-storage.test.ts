import { beforeEach, describe, expect, it } from "vitest";
import { FLIGHT_PLAN_PENDING_STORAGE_KEY, FLIGHT_PLAN_STORAGE_KEY, flightPlanActiveCrewIds, flightPlanActiveMemberIds, flightPlanDateMatches, flightPlanDraftRequest, flightPlanPendingDraftRequest } from "./flight-plan-storage";

const pendingDraft = (label: string, updatedAt: number) => ({
  schemaVersion: 3,
  unitName: "РБПАК",
  date: "15.09.2026",
  selected: [1],
  entries: {
    1: {
      crewId: 1,
      crewName: "БАРС",
      actualMemberIds: [7],
      actualCommanderId: 7,
      actualVehicleId: null,
      weather: {},
      routePoints: [],
      altitudeFrom: "800",
      altitudeTo: "1100",
      areaPoints: ["РАЙОН"],
      task: "Розвідка",
      startTime: "07:00",
      endTime: "12:00",
      uavSelections: [],
      payloadSelection: null,
      positionId: 2,
      positionName: label,
    },
  },
  rotations: {},
  pendingSave: { date: "2026-09-15", revision: 2, updatedAt },
});

describe("активний склад плану польотів", () => {
  beforeEach(() => localStorage.clear());

  it("returns only the people from the stage active at the requested time", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      selected: [1],
      entries: { 1: { actualMemberIds: [1, 2], startTime: "18:01", endTime: "19:00" } },
      rotations: { 1: [{ actualMemberIds: [2, 3], startTime: "19:01", endTime: "18:00" }] },
    }));

    expect([...flightPlanActiveMemberIds(new Date(2026, 8, 15, 18, 30))]).toEqual([1, 2]);
    expect([...flightPlanActiveMemberIds(new Date(2026, 8, 15, 20, 0))]).toEqual([2, 3]);
    expect([...flightPlanActiveMemberIds(new Date(2026, 8, 16, 8, 0))]).toEqual([2, 3]);
  });

  it("does not include crews that are not selected in the plan", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      selected: [],
      entries: { 1: { actualMemberIds: [1], startTime: "18:01", endTime: "18:00" } },
    }));
    expect(flightPlanActiveMemberIds(new Date(2026, 8, 15, 20, 0))).toEqual(new Set());
  });

  it("keeps a crew on position after work ends and removes it only at the explicit departure time", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      selected: [1],
      entries: { 1: { actualMemberIds: [1, 2], startTime: "07:00", endTime: "12:00", departsToday: true, departureTime: "16:30" } },
    }));

    expect([...flightPlanActiveMemberIds(new Date(2026, 8, 15, 15, 0))]).toEqual([1, 2]);
    expect(flightPlanActiveMemberIds(new Date(2026, 8, 15, 16, 30))).toEqual(new Set());
  });

  it("does not place a newly arriving crew on position before its first work starts", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      selected: [1],
      entries: { 1: { actualMemberIds: [1], startTime: "07:00", endTime: "12:00", arrivesToday: true } },
    }));

    expect(flightPlanActiveMemberIds(new Date(2026, 8, 15, 6, 59))).toEqual(new Set());
    expect([...flightPlanActiveMemberIds(new Date(2026, 8, 15, 7, 0))]).toEqual([1]);
  });

  it("keeps a 07:00 arrival on position at 20:00 of the same plan date", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      date: "15.09.2026",
      selected: [1],
      entries: { 1: { actualMemberIds: [1], startTime: "07:00", endTime: "12:00", arrivesToday: true } },
    }));

    expect([...flightPlanActiveMemberIds(new Date(2026, 8, 15, 20, 0))]).toEqual([1]);
    expect([...flightPlanActiveCrewIds(new Date(2026, 8, 15, 20, 0))]).toEqual([1]);
  });

  it("does not expose a crew as active before arrival or after explicit departure", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      date: "15.09.2026",
      selected: [1],
      entries: { 1: { actualMemberIds: [1], startTime: "07:00", endTime: "12:00", arrivesToday: true, departsToday: true, departureTime: "16:30" } },
    }));

    expect(flightPlanActiveCrewIds(new Date(2026, 8, 15, 6, 59))).toEqual(new Set());
    expect([...flightPlanActiveCrewIds(new Date(2026, 8, 15, 12, 0))]).toEqual([1]);
    expect(flightPlanActiveCrewIds(new Date(2026, 8, 15, 16, 30))).toEqual(new Set());
  });

  it("keeps a selected legacy crew active when the old draft has no entry details", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({ selected: [1] }));
    expect([...flightPlanActiveCrewIds(new Date(2026, 8, 15, 12, 0))]).toEqual([1]);
  });

  it("ignores an invalid early departure for presence and rejects it as a summary fallback", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      date: "15.09.2026",
      selected: [1],
      entries: { 1: { actualMemberIds: [1, 2], startTime: "07:00", endTime: "16:00", departsToday: true, departureTime: "15:00" } },
    }));

    expect([...flightPlanActiveCrewIds(new Date(2026, 8, 15, 17, 0))]).toEqual([1]);
    expect([...flightPlanActiveMemberIds(new Date(2026, 8, 15, 17, 0))]).toEqual([1, 2]);
    expect(flightPlanDraftRequest("2026-09-15")).toBeNull();
  });

  it("does not expose an invalid rotation through presence or the summary fallback", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      date: "15.09.2026",
      unitName: "РБПАК",
      selected: [1],
      entries: { 1: { actualMemberIds: [1], startTime: "07:00", endTime: "12:00" } },
      rotations: { 1: [{ actualMemberIds: [2], startTime: "12:30", endTime: "16:00" }] },
    }));

    expect([...flightPlanActiveMemberIds(new Date(2026, 8, 15, 14, 0))]).toEqual([1]);
    expect(flightPlanDraftRequest("2026-09-15")).toBeNull();
  });

  it("does not treat an undated legacy draft or tomorrow's draft as the plan for another date", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      unitName: "РБПАК",
      selected: [1],
      entries: { 1: { crewId: 1, actualMemberIds: [1], startTime: "07:00", endTime: "12:00", positionName: "ЗАВТРА" } },
    }));

    expect(flightPlanDateMatches("2026-09-17")).toBe(false);
    expect(flightPlanDraftRequest("2026-09-17")).toBeNull();

    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      date: "18.09.2026",
      unitName: "РБПАК",
      selected: [1],
      entries: { 1: { crewId: 1, actualMemberIds: [1], startTime: "07:00", endTime: "12:00", positionName: "ЗАВТРА" } },
    }));

    expect(flightPlanDateMatches("2026-09-17")).toBe(false);
    expect(flightPlanDraftRequest("2026-09-17")).toBeNull();
    expect(flightPlanDraftRequest("2026-09-18")?.entries[0]?.positionName).toBe("ЗАВТРА");
  });

  it("does not expose a clean schema-v3 draft as an ordinary summary fallback", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      schemaVersion: 3,
      date: "15.09.2026",
      unitName: "РБПАК",
      selected: [1],
      entries: { 1: { crewId: 1, actualMemberIds: [1], startTime: "07:00", endTime: "12:00", positionName: "ФАНТОМ" } },
      rotations: {},
    }));

    expect(flightPlanDraftRequest("2026-09-15")).toBeNull();
    expect(flightPlanPendingDraftRequest("2026-09-15")).toBeNull();

    const legacy = JSON.parse(localStorage.getItem(FLIGHT_PLAN_STORAGE_KEY) ?? "{}");
    delete legacy.schemaVersion;
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify(legacy));
    expect(flightPlanDraftRequest("2026-09-15")?.entries[0]?.positionName).toBe("ФАНТОМ");
  });

  it("reads the newest exact-date pending draft from the main and sidecar stores", () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify(pendingDraft("ОСНОВНА", 100)));
    localStorage.setItem(FLIGHT_PLAN_PENDING_STORAGE_KEY, JSON.stringify({
      "2026-09-15": pendingDraft("НОВІША", 200),
      "2026-09-16": { ...pendingDraft("ІНША ДАТА", 300), date: "16.09.2026", pendingSave: { date: "2026-09-16", revision: 3, updatedAt: 300 } },
    }));

    expect(flightPlanPendingDraftRequest("2026-09-15")?.entries[0]?.positionName).toBe("НОВІША");
  });

  it("rejects the newest pending draft when its schedule is invalid instead of falling back to an older copy", () => {
    const invalid = pendingDraft("НЕВАЛІДНА", 200);
    Object.assign(invalid.entries[1], { departsToday: true, departureTime: "11:00" });
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify(pendingDraft("СТАРІША", 100)));
    localStorage.setItem(FLIGHT_PLAN_PENDING_STORAGE_KEY, JSON.stringify({ "2026-09-15": invalid }));

    expect(flightPlanPendingDraftRequest("2026-09-15")).toBeNull();
  });

  it("requires both the draft and pending metadata to match the requested date", () => {
    const mismatched = pendingDraft("ХИБНА ДАТА", 100);
    mismatched.pendingSave.date = "2026-09-14";
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify(mismatched));

    expect(flightPlanPendingDraftRequest("2026-09-15")).toBeNull();
  });
});
