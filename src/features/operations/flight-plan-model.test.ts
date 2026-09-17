import { describe, expect, it } from "vitest";
import { initialFlightEntry, validateFlightPlanSchedule } from "./flight-plan-model";
import type { Crew, FlightPlanEntry, FlightPlanRotation } from "./types";

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
  it("does not place absent personnel or people from position work into a new plan", () => {
    const members = [
      { personnelId: 1, fullName: "ДОСТУПНИЙ Доступний", rank: "солдат", position: "оператор", callsign: "ОДИН", currentLocation: "ОХ" },
      { personnelId: 2, fullName: "НАВЧАЛЬНИЙ Навчальний", rank: "солдат", position: "оператор", callsign: "ДВА", currentLocation: "НАВЧ" },
      { personnelId: 3, fullName: "РОБОЧИЙ Робочий", rank: "солдат", position: "оператор", callsign: "ТРИ", currentLocation: "Реко та облаштування" },
      { personnelId: 4, fullName: "ВІДПУСТКА Відсутній", rank: "солдат", position: "оператор", callsign: "ЧОТИРИ", currentLocation: "ВІДП" },
      { personnelId: 5, fullName: "СЗЧ Відсутній", rank: "солдат", position: "оператор", callsign: "ПʼЯТЬ", currentLocation: "СЗЧ" },
      { personnelId: 6, fullName: "ПТЗ Відсутній", rank: "солдат", position: "оператор", callsign: "ШІСТЬ", currentLocation: "ПТЗ Новостав" },
    ];
    const crew = { id: 1, reconnaissanceArea: "", actualMembers: members } as Crew;

    expect(initialFlightEntry(crew).actualMemberIds).toEqual([1]);
  });

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
