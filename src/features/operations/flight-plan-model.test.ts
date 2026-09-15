import { describe, expect, it } from "vitest";
import { validateFlightPlanSchedule } from "./flight-plan-model";
import type { FlightPlanEntry, FlightPlanRotation } from "./types";

const entry = (patch: Partial<FlightPlanEntry> = {}): FlightPlanEntry => ({
  crewId: 1,
  actualMemberIds: [1],
  actualCommanderId: 1,
  actualVehicleId: null,
  weather: { temperature: "", windFrom: "", windTo: "", gustFrom: "", gustTo: "", cloudiness: "", cloudHeight: "", precipitation: "" },
  routePoints: [],
  altitudeFrom: "",
  altitudeTo: "",
  areaPoints: [],
  task: "Розвідка",
  startTime: "07:00",
  endTime: "12:00",
  uavSelections: [],
  payloadSelection: null,
  arrivesToday: false,
  departsToday: false,
  departureTime: "",
  ...patch,
});

describe("цілісність часу плану польотів", () => {
  it("rejects departure before the final stage ends even when it is after the rotation starts", () => {
    const primary = entry({ endTime: "20:00", departsToday: true, departureTime: "22:30" });
    const rotation = entry({ startTime: "20:01", endTime: "23:00", actualMemberIds: [2] }) as FlightPlanRotation;

    expect(validateFlightPlanSchedule(primary, [rotation]).departureError).toBe(
      "Час виїзду не може бути раніше завершення останнього етапу роботи о 23:00.",
    );
  });

  it("allows departure exactly when the final work stage ends", () => {
    const primary = entry({ endTime: "20:00", departsToday: true, departureTime: "23:00" });
    const rotation = entry({ startTime: "20:01", endTime: "23:00", actualMemberIds: [2] }) as FlightPlanRotation;

    expect(validateFlightPlanSchedule(primary, [rotation])).toEqual(expect.objectContaining({ isValid: true, departureError: undefined }));
  });
});
