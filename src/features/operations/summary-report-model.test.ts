import { describe, expect, it, vi } from "vitest";
import { buildSummaryDocument, canOpenNextReport, carryForwardSummary, defaultSummaryManual, initialReportDate, reportPeriod } from "./summary-report-model";

describe("підсумкове донесення", () => {
  it("keeps yesterday's report open before noon and switches at noon", () => {
    expect(initialReportDate(new Date(2026, 8, 15, 11, 59))).toBe("2026-09-14");
    expect(initialReportDate(new Date(2026, 8, 15, 12, 0))).toBe("2026-09-15");
  });

  it("offers the next report only after 18:01", () => {
    expect(canOpenNextReport("2026-09-15", new Date(2026, 8, 15, 18, 0))).toBe(false);
    expect(canOpenNextReport("2026-09-15", new Date(2026, 8, 15, 18, 1))).toBe(true);
    expect(reportPeriod("2026-09-15")).toEqual({ start: "2026-09-14T18:01", end: "2026-09-15T18:00" });
  });

  it("copies carry-forward objects without sharing their identities", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("new-id") });
    const previous = defaultSummaryManual();
    previous.nextTasks = [{ id: "old-task", text: "Продовжити роботу" }];
    const next = carryForwardSummary(previous);
    expect(next.nextTasks).toEqual([{ id: "new-id", text: "Продовжити роботу" }]);
    expect(next.nextTasks[0]).not.toBe(previous.nextTasks[0]);
    vi.unstubAllGlobals();
  });

  it("uses Ім’я ПРІЗВИЩЕ for the signer and rejects a KSP/position overlap", () => {
    const manual = defaultSummaryManual();
    manual.reportNumber = "1";
    manual.commandDuties = [{ id: "duty", personnelId: 7, startDate: "2026-09-14", startTime: "18:01", endDate: "2026-09-15", endTime: "06:00" }];
    const result = buildSummaryDocument({
      reportDate: "2026-09-15", manual,
      settings: { mainSigner: { fullName: "ШКОЛЬНІКОВ Арсеній Едуардович", rank: "молодший лейтенант", position: "Командир" }, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4, reportRecipient: "Командиру", kspName: "ОРІОН", kspLocality: "КАЛИНІВКА" } } as never,
      crews: [], positions: [], journal: [], snapshots: [{ unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7] } as never] }], staffing: [{ personnelId: 7, fullName: "ПЕТРЕНКО Петро Петрович", rank: "капітан" } as never],
    });
    expect(result.document.values.signer_given_name).toBe("Арсеній");
    expect(result.document.values.signer_surname).toBe("ШКОЛЬНІКОВ");
    expect(result.warnings).toContain("Людина з чергування КСП одночасно зазначена на позиції. Приберіть її з КСП або плану польотів.");
    expect(result.document.blocks.command_duties).toEqual([{ text: "Чергових не зазначено.", kind: "paragraph" }]);
  });

  it("groups flights for one crew and keeps the detailed paragraph non-bold", () => {
    const manual = defaultSummaryManual();
    const crew = {
      id: 1, name: "ГРІМ", sector: "СМУГА СХІД", battleOrder: "БРО-03", positionId: 2,
      reconnaissanceArea: "СТЕПОВЕ", uavName: "LELEKA-100", uavType: "розвідувальний",
      members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант", position: "", callsign: "" }],
    } as never;
    const position = { id: 2, name: "ХИЖАК", mgrs: "36U UV 26000 57000", locality: "СТЕПОВЕ" } as never;
    const flight = { crewId: 1, crewName: "ГРІМ", positionId: 2, positionName: "ХИЖАК", workStrip: "СМУГА СХІД", uavId: 3, uavName: "LELEKA-100", uavSerialNumber: "UAV-015", flightDate: "2026-09-15" };
    const result = buildSummaryDocument({
      reportDate: "2026-09-15", manual,
      settings: { mainSigner: { fullName: "ШКОЛЬНІКОВ Арсеній Едуардович", rank: "молодший лейтенант", position: "Командир" }, unit: { kind: "Рота", shortName: "РБАК", battalionShortName: "ББпС", authorizedStrength: 4 } } as never,
      crews: [crew], positions: [position],
      journal: [{ ...flight, id: 1, skyTime: "12:10" }, { ...flight, id: 2, skyTime: "16:05" }] as never,
      snapshots: [{ unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7] } as never] }],
    });
    expect(result.document.values.flight_count).toBe("здійснювалися 2 рази.");
    expect(result.objects.flightItems).toHaveLength(1);
    expect(result.objects.flightItems[0].flightTimes).toEqual([{ date: "2026-09-15", time: "12:10" }, { date: "2026-09-15", time: "16:05" }]);
    expect(result.objects.flightItems[0].crewName).toBe("ГРІМ");
    const detailLines = result.document.blocks.flight_operations.filter((line) => line.text.startsWith("Із стартової позиції"));
    expect(detailLines).toHaveLength(1);
    expect(detailLines[0]).toEqual(expect.objectContaining({ kind: "paragraph" }));
    expect(detailLines[0]).not.toHaveProperty("bold");
  });

  it("offers only real composition changes as optional rotation events", () => {
    const manual = defaultSummaryManual();
    const crew = {
      id: 1, name: "ГРІМ", sector: "СМУГА СХІД", battleOrder: "БРО-03", positionId: 2,
      reconnaissanceArea: "СТЕПОВЕ", uavName: "LELEKA-100", uavType: "розвідувальний",
      members: [
        { personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" },
        { personnelId: 8, fullName: "КОЗАК Віталій Володимирович", rank: "солдат" },
      ],
    } as never;
    const position = { id: 2, name: "ХИЖАК", mgrs: "36U UV 26000 57000", locality: "СТЕПОВЕ" } as never;
    const stages = [
      { crewId: 1, actualMemberIds: [7], startTime: "18:01", endTime: "19:00" },
      { crewId: 1, actualMemberIds: [8], startTime: "19:01", endTime: "18:00" },
    ] as never;
    const result = buildSummaryDocument({
      reportDate: "2026-09-15", manual,
      settings: { mainSigner: { fullName: "", rank: "", position: "" }, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never,
      crews: [crew], positions: [position], journal: [], snapshots: [{ unitName: "РБАК", entries: stages }],
    });
    expect(result.objects.rotationEvents).toHaveLength(1);
    expect(result.objects.rotationEvents[0].text).toContain("завершив бойове чергування");
    expect(result.objects.rotationEvents[0].text).toContain("приступив до бойового чергування");
    expect(result.document.blocks.period_events).toEqual([{ text: "Подій не зафіксовано.", kind: "paragraph" }]);

    manual.includedAutoEventIds = [result.objects.rotationEvents[0].id];
    const included = buildSummaryDocument({
      reportDate: "2026-09-15", manual,
      settings: { mainSigner: { fullName: "", rank: "", position: "" }, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never,
      crews: [crew], positions: [position], journal: [], snapshots: [{ unitName: "РБАК", entries: stages }],
    });
    expect(included.document.blocks.period_events.some((line) => line.text.includes("завершив бойове чергування"))).toBe(true);
  });

  it("counts crews by the position strip and battle order from the flight plan", () => {
    const manual = defaultSummaryManual();
    const crews = [1, 2].map((id) => ({ id, name: `ЕКІПАЖ-${id}`, sector: "ЗАСТАРІЛА СМУГА", battleOrder: "СТАРЕ БРО", positionId: id, uavType: "розвідувальний", members: [], actualMembers: [] })) as never;
    const positions = [1, 2].map((id) => ({ id, name: `ПОЗИЦІЯ-${id}`, stripName: "СЕКТОР ПІВНІЧ", battleOrder: "БРО-01", mgrs: `36U UV 1${id}000 67000`, locality: "НОВОСЕЛІВКА" })) as never;
    const entries = [1, 2].map((crewId) => ({ crewId, actualMemberIds: [], uavSelections: [], areaPoints: [] })) as never;
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews, positions, journal: [], snapshots: [{ unitName: "РБАК", entries }] });
    expect(result.objects.compositionItems).toEqual([expect.objectContaining({ count: "2", workStrip: "СЕКТОР ПІВНІЧ", battleOrder: "БРО-01" })]);
    expect(result.objects.positionItems).toHaveLength(2);
    expect(result.document.blocks.positions[0]).not.toHaveProperty("bold");
  });

  it("turns position reconnaissance into an automatic report event", () => {
    const manual = defaultSummaryManual();
    const input = { reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", battalionShortName: "ББпС", authorizedStrength: 4 } } as never, crews: [], positions: [{ id: 4, name: "САПСАН", mgrs: "36U UV 19000 62000", locality: "НОВОСЕЛІВКА" }] as never, journal: [], snapshots: [], positionWork: [{ id: 9, positionId: 4, positionName: "САПСАН", workType: "Рекогностування", status: "Продовжують", startDate: "2026-09-15", startTime: "08:00", endDate: "", endTime: "", battleOrder: "№ 17", notes: "", members: [{ personnelId: 3, fullName: "ПЕТРЕНКО Петро Петрович", rank: "солдат" }] }] as never };
    const automatic = buildSummaryDocument(input);
    expect(automatic.objects.rotationEvents[0].text).toContain("продовжують рекогностування");
    expect(automatic.objects.rotationEvents[0].text).toContain("ПЕТРЕНКО Петро Петрович");
  });
});
