import { describe, expect, it } from "vitest";
import { resolveIncidentPersonContext } from "./IncidentsPage";
import type { Crew, FlightPlanRequest, Position } from "./types";

const crews = [
  { id: 1, name: "ГРІМ", positionId: 10, positionName: "АЛЬФА", members: [], actualMembers: [] },
] as unknown as Crew[];
const positions = [
  { id: 10, name: "АЛЬФА", locality: "НОВОСЕЛІВКА", mgrs: "36U AA 10000 20000" },
  { id: 11, name: "БРАВО", locality: "СТЕПОВЕ", mgrs: "36U AA 30000 40000" },
] as unknown as Position[];

describe("resolveIncidentPersonContext", () => {
  it("uses the composition and position of the active flattened rotation", () => {
    const plan = {
      unitName: "РБАК",
      entries: [
        { crewId: 1, actualMemberIds: [1], startTime: "07:00", endTime: "09:59", positionId: 10, positionName: "АЛЬФА" },
        { crewId: 1, actualMemberIds: [2], startTime: "10:00", endTime: "18:00", positionId: 11, positionName: "БРАВО", rotationId: "rotation-1" },
      ],
    } as FlightPlanRequest;

    expect(resolveIncidentPersonContext(plan, 1, "09:59", crews, positions)).toEqual(expect.objectContaining({ crewId: 1, positionName: "АЛЬФА" }));
    expect(resolveIncidentPersonContext(plan, 1, "10:00", crews, positions)).toEqual({ crewId: null, positionName: "", area: "" });
    expect(resolveIncidentPersonContext(plan, 2, "10:00", crews, positions)).toEqual(expect.objectContaining({ crewId: 1, positionName: "БРАВО", area: "СТЕПОВЕ · 36U AA 30000 40000" }));
  });

  it("reconstructs the final stage around point personnel transitions", () => {
    const plan = {
      unitName: "РБАК",
      entries: [
        { crewId: 1, actualMemberIds: [1], startTime: "07:00", endTime: "09:59", positionId: 10 },
        { crewId: 1, actualMemberIds: [3], startTime: "10:00", endTime: "18:00", positionId: 11, rotationId: "rotation-1" },
      ],
      personnelTransitions: [{ id: "change-1", crewId: 1, outgoingMemberIds: [2], outgoingTime: "12:00", incomingMemberIds: [3], incomingTime: "13:00" }],
    } as FlightPlanRequest;

    expect(resolveIncidentPersonContext(plan, 2, "11:59", crews, positions).crewId).toBe(1);
    expect(resolveIncidentPersonContext(plan, 2, "12:00", crews, positions).crewId).toBeNull();
    expect(resolveIncidentPersonContext(plan, 3, "12:59", crews, positions).crewId).toBeNull();
    expect(resolveIncidentPersonContext(plan, 3, "13:00", crews, positions).crewId).toBe(1);
  });

  it("respects confirmed arrival and departure times", () => {
    const plan = {
      unitName: "РБАК",
      entries: [{ crewId: 1, actualMemberIds: [4], startTime: "07:00", endTime: "16:00", positionId: 10, arrivesToday: true, departsToday: true, departureTime: "17:00" }],
    } as FlightPlanRequest;

    expect(resolveIncidentPersonContext(plan, 4, "06:59", crews, positions).crewId).toBeNull();
    expect(resolveIncidentPersonContext(plan, 4, "07:00", crews, positions).crewId).toBe(1);
    expect(resolveIncidentPersonContext(plan, 4, "16:59", crews, positions).crewId).toBe(1);
    expect(resolveIncidentPersonContext(plan, 4, "17:00", crews, positions).crewId).toBeNull();
  });
});
