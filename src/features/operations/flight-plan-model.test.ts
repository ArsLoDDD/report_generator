import { describe, expect, it } from "vitest";
import { flightPlanPreviewRows, initialFlightEntry, validateFlightPlanSchedule } from "./flight-plan-model";
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
  it("sorts the displayed crew composition from the highest rank to the lowest", () => {
    const members = [
      { personnelId: 1, fullName: "КОЗАК Віктор Васильович", rank: "солдат", position: "оператор", callsign: "СОКІЛ-021", currentLocation: "ОХ" },
      { personnelId: 2, fullName: "ОЛІЙНИК Роман Миколайович", rank: "старший солдат", position: "оператор", callsign: "СОКІЛ-022", currentLocation: "ОХ" },
      { personnelId: 3, fullName: "ЯРЕМЧУК Микола Романович", rank: "сержант", position: "командир екіпажу", callsign: "СОКІЛ-020", currentLocation: "ОХ" },
      { personnelId: 4, fullName: "ЛЕВЧЕНКО Іван Олександрович", rank: "молодший сержант", position: "оператор", callsign: "СОКІЛ-023", currentLocation: "ОХ" },
    ];
    const crew = { id: 1, name: "СОКІЛ", positionName: "", battleOrder: "", uavName: "", primaryUavId: null, actualMembers: members, members } as Crew;
    const plan = entry({ actualMemberIds: [1, 2, 3, 4], actualCommanderId: 3 });

    const rows = flightPlanPreviewRows("РБПАК", [plan], [crew], [], []);

    expect(rows[0].cells[6].split("\n")).toEqual([
      "серж. ЯРЕМЧУК М.Р. (СОКІЛ-020)",
      "мол. серж. ЛЕВЧЕНКО І.О. (СОКІЛ-023)",
      "ст. сол. ОЛІЙНИК Р.М. (СОКІЛ-022)",
      "сол. КОЗАК В.В. (СОКІЛ-021)",
    ]);
  });

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
