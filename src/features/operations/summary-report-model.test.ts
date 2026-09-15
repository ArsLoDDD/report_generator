import { describe, expect, it, vi } from "vitest";
import { buildAlternatingDutySchedule, buildSummaryDocument, canOpenNextReport, canReturnToPreviousReport, carryForwardSummary, defaultSummaryManual, initialReportDate, reportPeriod } from "./summary-report-model";

describe("підсумкове донесення", () => {
  it("keeps yesterday's report open before noon and switches at noon", () => {
    expect(initialReportDate(new Date(2026, 8, 15, 11, 59))).toBe("2026-09-14");
    expect(initialReportDate(new Date(2026, 8, 15, 12, 0))).toBe("2026-09-15");
  });

  it("offers the next report only from 18:01 until the following noon", () => {
    expect(canOpenNextReport("2026-09-15", new Date(2026, 8, 15, 18, 0))).toBe(false);
    expect(canOpenNextReport("2026-09-15", new Date(2026, 8, 15, 18, 1))).toBe(true);
    expect(canOpenNextReport("2026-09-15", new Date(2026, 8, 16, 11, 59))).toBe(true);
    expect(canOpenNextReport("2026-09-15", new Date(2026, 8, 16, 12, 0))).toBe(false);
    expect(canReturnToPreviousReport("2026-09-16", new Date(2026, 8, 16, 11, 59))).toBe(true);
    expect(canReturnToPreviousReport("2026-09-16", new Date(2026, 8, 16, 12, 0))).toBe(false);
    expect(reportPeriod("2026-09-15")).toEqual({ start: "2026-09-14T18:01", end: "2026-09-15T18:00" });
  });

  it("copies carry-forward objects without sharing their identities", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("new-id") });
    const previous = defaultSummaryManual();
    previous.nextTasks = [{ id: "old-task", text: "Продовжити роботу" }];
    previous.enemyLosses.personnel = "7";
    previous.completeness.personnel = "81";
    previous.rocketStrikes = "2";
    previous.personnelLosses.temporary = "3";
    previous.equipmentLosses.uav = "4";
    previous.commandDuties = [{ id: "old-duty", personnelId: 9, periods: [{ id: "old-period", startDate: "2026-09-14", startTime: "18:01", endDate: "2026-09-15", endTime: "06:00" }] }];
    const next = carryForwardSummary(previous);
    expect(next.nextTasks).toEqual([{ id: "new-id", text: "Продовжити роботу" }]);
    expect(next.nextTasks[0]).not.toBe(previous.nextTasks[0]);
    expect(next.enemyLosses.personnel).toBe("7");
    expect(next.completeness.personnel).toBe("81");
    expect(next.rocketStrikes).toBe("2");
    expect(next.personnelLosses.temporary).toBe("3");
    expect(next.equipmentLosses.uav).toBe("4");
    expect(next.commandDuties[0]).toEqual(expect.objectContaining({ id: "new-id", personnelId: 9 }));
    expect(next.commandDuties[0].periods[0]).toEqual(expect.objectContaining({ id: "new-id", startDate: "2026-09-15", endDate: "2026-09-16" }));
    expect(next.enemyLosses).not.toBe(previous.enemyLosses);
    vi.unstubAllGlobals();
  });

  it("uses Ім’я ПРІЗВИЩЕ for the signer and rejects a KSP/position overlap", () => {
    const manual = defaultSummaryManual();
    manual.reportNumber = "1";
    manual.commandDuties = [{ id: "duty", personnelId: 7, periods: [{ id: "duty-period", startDate: "2026-09-14", startTime: "18:01", endDate: "2026-09-15", endTime: "06:00" }] }];
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

  it("replaces the legacy military-unit signer suffix with the configured battalion name", () => {
    const result = buildSummaryDocument({
      reportDate: "2026-09-15",
      manual: defaultSummaryManual(),
      settings: {
        mainSigner: {
          fullName: "ШКОЛЬНІКОВ Арсеній Едуардович",
          rank: "молодший лейтенант",
          position: "Командир роти безпілотних авіаційних комплексів військової частини А2222",
        },
        unit: {
          kind: "Рота",
          shortName: "РБАК",
          authorizedStrength: 4,
          battalionFullName: "477 окремого батальйону безпілолтних систем",
          militaryUnitShortName: "477 ОББпС",
        },
      } as never,
      crews: [], positions: [], journal: [], snapshots: [],
    });

    expect(result.document.values.signer_position).toBe("Командир роти безпілотних авіаційних комплексів 477 окремого батальйону безпілотних систем");
    expect(result.document.values.signer_position).not.toContain("А2222");
  });

  it("never keeps a legacy military-unit suffix when the battalion name is missing", () => {
    const result = buildSummaryDocument({
      reportDate: "2026-09-15",
      manual: defaultSummaryManual(),
      settings: {
        mainSigner: {
          fullName: "ШКОЛЬНІКОВ Арсеній Едуардович",
          rank: "молодший лейтенант",
          position: "Командир роти безпілотних авіаційних комплексів військової частини А2222",
        },
        unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 },
      } as never,
      crews: [], positions: [], journal: [], snapshots: [],
    });

    expect(result.document.values.signer_position).toBe("Командир роти безпілотних авіаційних комплексів [повну назву батальйону не вказано]");
    expect(result.document.values.signer_position).not.toContain("військової частини");
    expect(result.document.values.signer_position).not.toContain("А2222");
    expect(result.warnings).toContain("Не вказана повна назва батальйону для посади основного підписанта.");
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
    expect(detailLines[0].runs).toEqual(expect.arrayContaining([
      { text: "РБАК " },
      { text: "«ГРІМ»", bold: true },
    ]));
    const stripHeading = result.document.blocks.flight_operations.findIndex((line) => line.text === "У межах смуги оборони СМУГА СХІД:");
    expect(stripHeading).toBe(0);
    expect(result.document.blocks.flight_operations[stripHeading + 1].text).toBe("");
    expect(result.document.blocks.flight_operations[stripHeading + 2].text).not.toBe("");
  });

  it("adds no model blank before the first strip and exactly one around every following strip heading", () => {
    const manual = defaultSummaryManual();
    manual.flightItems = [
      { id: "manual-north", crewId: 1, workStrip: "СМУГА ПІВНІЧ", positionName: "ПОЗИЦІЯ-1", mgrs: "36U UV 10000 10000", locality: "НП-1", unitShortName: "РБАК", crewName: "ЕКІПАЖ-1", taskArea: "РАЙОН-1", uavs: [], members: [], flightTimes: [] },
      { id: "manual-east", crewId: 2, workStrip: "СМУГА СХІД", positionName: "ПОЗИЦІЯ-2", mgrs: "36U UV 20000 20000", locality: "НП-2", unitShortName: "РБАК", crewName: "ЕКІПАЖ-2", taskArea: "РАЙОН-2", uavs: [], members: [], flightTimes: [] },
    ];
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [], positions: [], journal: [], snapshots: [] });
    const lines = result.document.blocks.flight_operations;
    const secondHeading = lines.findIndex((line) => line.text === "У межах смуги оборони СМУГА СХІД:");

    expect(lines[0].text).toBe("У межах смуги оборони СМУГА ПІВНІЧ:");
    expect(lines[1].text).toBe("");
    expect(lines[2].text).not.toBe("");
    expect(secondHeading).toBeGreaterThan(2);
    expect(lines[secondHeading - 2].text).not.toBe("");
    expect(lines[secondHeading - 1].text).toBe("");
    expect(lines[secondHeading + 1].text).toBe("");
    expect(lines[secondHeading + 2].text).not.toBe("");
  });

  it("renders a fallback strip heading when the first flight has no work strip", () => {
    const manual = defaultSummaryManual();
    manual.flightItems = [
      { id: "manual-no-strip", crewId: 1, workStrip: "", positionName: "ПОЗИЦІЯ-1", mgrs: "36U UV 10000 10000", locality: "НП-1", unitShortName: "РБАК", crewName: "ЕКІПАЖ-1", taskArea: "РАЙОН-1", uavs: [], members: [], flightTimes: [] },
    ];
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [], positions: [], journal: [], snapshots: [] });
    const lines = result.document.blocks.flight_operations;

    expect(lines[0]).toEqual(expect.objectContaining({ text: "У межах смуги оборони смугу не вказано:", bold: true }));
    expect(lines[1].text).toBe("");
    expect(lines[2].text).not.toBe("");
  });

  it("moves a member end date to the next day when a plan stage crosses midnight", () => {
    const manual = defaultSummaryManual();
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }], actualMembers: [] } as never;
    const entry = { crewId: 1, actualMemberIds: [7], startTime: "18:01", endTime: "18:00" } as never;
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [{ id: 2, name: "ХИЖАК" }] as never, journal: [], snapshots: [{ unitName: "РБАК", entries: [entry] }, null] });
    expect(result.objects.flightItems[0].members[0]).toEqual(expect.objectContaining({ startDate: "2026-09-14", endDate: "2026-09-15" }));
  });

  it("keeps manual flight details while continuing to receive new journal flights", () => {
    const manual = defaultSummaryManual();
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }], actualMembers: [] } as never;
    const entry = { crewId: 1, actualMemberIds: [7], startTime: "06:00", endTime: "18:00", uavSnapshots: [{ equipmentId: 3, name: "LELEKA-100", serialNumber: "UAV-015" }] } as never;
    const common = { reportDate: "2026-09-15", settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [{ id: 2, name: "ХИЖАК" }] as never, snapshots: [null, { unitName: "РБАК", entries: [entry] }] };
    const initial = buildSummaryDocument({ ...common, manual, journal: [] });
    manual.flightItems = [{ ...initial.objects.flightItems[0], uavs: [{ id: "manual-uav", equipmentId: 3, name: "LELEKA-100", serialNumber: "ВРУЧНУ-015" }], members: [{ ...initial.objects.flightItems[0].members[0], startTime: "07:00" }] }];
    const updated = buildSummaryDocument({ ...common, manual, journal: [{ id: 1, flightDate: "2026-09-15", skyTime: "12:10", crewId: 1, positionId: 2, uavName: "LELEKA-100", uavSerialNumber: "UAV-015" }] as never });
    expect(updated.document.blocks.flight_operations.some((line) => line.text.includes("ВРУЧНУ-015"))).toBe(true);
    expect(updated.document.blocks.flight_operations.some((line) => line.text.includes("з 07:00 год"))).toBe(true);
    expect(updated.document.blocks.flight_operations.some((line) => line.text.includes("12:10 год"))).toBe(true);
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

  it("keeps crews physically on position outside their work hours and ignores a future arrival", () => {
    const manual = defaultSummaryManual();
    const crews = [
      { id: 1, name: "СТАРИЙ", positionId: 1, uavType: "розвідувальний", members: [], actualMembers: [] },
      { id: 2, name: "ЧИННИЙ", positionId: 2, uavType: "розвідувальний", members: [], actualMembers: [] },
      { id: 3, name: "МАЙБУТНІЙ", positionId: 3, uavType: "розвідувальний", members: [], actualMembers: [] },
    ] as never;
    const positions = [1, 2, 3].map((id) => ({ id, name: `ПОЗИЦІЯ-${id}`, stripName: `СМУГА-${id}`, battleOrder: `БРО-${id}` })) as never;
    const previous = { unitName: "РБАК", entries: [
      { crewId: 1, actualMemberIds: [], startTime: "06:00", endTime: "18:00" },
      { crewId: 2, actualMemberIds: [], startTime: "18:01", endTime: "23:59" },
    ] } as never;
    const current = { unitName: "РБАК", entries: [
      { crewId: 3, actualMemberIds: [], startTime: "18:01", endTime: "23:59" },
    ] } as never;
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews, positions, journal: [], snapshots: [previous, current] });
    expect(result.objects.compositionItems).toHaveLength(2);
    expect(result.objects.positionItems).toEqual(expect.arrayContaining([expect.objectContaining({ positionName: "ПОЗИЦІЯ-1" }), expect.objectContaining({ positionName: "ПОЗИЦІЯ-2" })]));
    expect(result.objects.positionItems).not.toEqual(expect.arrayContaining([expect.objectContaining({ positionName: "ПОЗИЦІЯ-3" })]));
  });

  it("turns position reconnaissance into an automatic report event", () => {
    const manual = defaultSummaryManual();
    const input = { reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", battalionShortName: "ББпС", authorizedStrength: 4 } } as never, crews: [], positions: [{ id: 4, name: "САПСАН", mgrs: "36U UV 19000 62000", locality: "НОВОСЕЛІВКА" }] as never, journal: [], snapshots: [], positionWork: [{ id: 9, positionId: 4, positionName: "САПСАН", workType: "Рекогностування", status: "Продовжують", startDate: "2026-09-15", startTime: "08:00", endDate: "", endTime: "", battleOrder: "№ 17", notes: "", members: [{ personnelId: 3, fullName: "ПЕТРЕНКО Петро Петрович", rank: "солдат" }] }] as never };
    const automatic = buildSummaryDocument(input);
    expect(automatic.objects.rotationEvents[0].text).toContain("продовжують рекогностування");
    expect(automatic.objects.rotationEvents[0].text).toContain("ПЕТРЕНКО Петро Петрович");
  });

  it("groups every position-work period under one servicemember", () => {
    const manual = defaultSummaryManual();
    const result = buildSummaryDocument({
      reportDate: "2026-09-15",
      manual,
      settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", battalionShortName: "ББпС", militaryUnitShortName: "477 ОББпС", authorizedStrength: 4 } } as never,
      crews: [],
      positions: [{ id: 4, name: "САПСАН", mgrs: "36U UV 19000 62000", locality: "НОВОСЕЛІВКА" }] as never,
      journal: [],
      snapshots: [],
      positionWork: [{
        id: 9, positionId: 4, positionName: "САПСАН", workType: "Облаштування", status: "Приступили",
        startDate: "2026-09-14", startTime: "19:00", endDate: "", endTime: "", battleOrder: "БР-17", notes: "",
        members: [
          { assignmentId: 1, personnelId: 3, fullName: "ПЕТРЕНКО Петро Петрович", rank: "солдат", dutyType: "Охорона та оборона", startDate: "2026-09-14", startTime: "19:00", endDate: "2026-09-14", endTime: "22:00" },
          { assignmentId: 2, personnelId: 3, fullName: "ПЕТРЕНКО Петро Петрович", rank: "солдат", dutyType: "Облаштування", startDate: "2026-09-14", startTime: "22:01", endDate: "2026-09-14", endTime: "23:59" },
        ],
      }] as never,
    });
    const text = result.objects.rotationEvents.find((event) => event.id === "position-work-9")?.text ?? "";
    expect(text).toContain("приступили до позмінної охорони, оборони та дооблаштування");
    expect(text).toContain("БОЙОВОГО РОЗПОРЯДЖЕННЯ КОМАНДИРА 477 ОББпС БР-17");
    expect(text).not.toContain("КОМАНДИРА ББпС БР-17");
    expect(text.match(/солдат ПЕТРЕНКО Петро Петрович:/gu)).toHaveLength(1);
    expect(text.match(/-в період/gu)).toHaveLength(2);
    expect(text).toContain("з 22:01 год 14.09.2026 по 23:59 год 14.09.2026 здійснював дооблаштування позиції;");
  });

  it("builds an automatic event from durable position-work history after the current row is gone", () => {
    const result = buildSummaryDocument({
      reportDate: "2026-09-15",
      manual: defaultSummaryManual(),
      settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", battalionShortName: "477 ОББпС", authorizedStrength: 4 } } as never,
      crews: [],
      positions: [],
      journal: [], snapshots: [], positionWork: [],
      positionWorkHistory: [{
        id: 31, workId: 9, positionId: 4, positionName: "САПСАН", positionMgrs: "36U UV 19000 62000", positionLocality: "НОВОСЕЛІВКА", workType: "Облаштування", status: "Завершили",
        startDate: "2026-09-15", startTime: "08:00", endDate: "2026-09-15", endTime: "12:00", battleOrder: "БР-17", notes: "", createdAt: "2026-09-15 12:01:00",
        members: [{ assignmentId: 1, personnelId: 3, fullName: "ПЕТРЕНКО Петро Петрович", rank: "солдат", dutyType: "Облаштування", startDate: "2026-09-15", startTime: "08:00", endDate: "2026-09-15", endTime: "12:00" }],
      }] as never,
    });

    const event = result.objects.rotationEvents.find((item) => item.id === "position-work-9");
    expect(event?.text).toContain("завершили дооблаштування");
    expect(event?.text).toContain("ПЕТРЕНКО Петро Петрович");
    expect(event?.text).toContain("36U UV 19000 62000");
    expect(event?.text).toContain("НОВОСЕЛІВКА");
    expect(event?.text).toContain("з 08:00 год 15.09.2026 по 12:00 год 15.09.2026");
  });

  it("shows one position object when several crews work from the same position", () => {
    const manual = defaultSummaryManual();
    const crews = [
      { id: 1, name: "СОКІЛ", positionId: 9, uavType: "розвідувальний", uavName: "SHARK", members: [], actualMembers: [] },
      { id: 2, name: "БАРС", positionId: 9, uavType: "розвідувальний", uavName: "LELEKA", members: [], actualMembers: [] },
    ] as never;
    const entries = [
      { crewId: 1, actualMemberIds: [], positionId: 9, positionName: "ХИЖАК", workStrip: "СЕКТОР СХІД", battleOrder: "БРО-03", uavSnapshots: [{ equipmentId: 10, name: "SHARK", serialNumber: "U-10" }] },
      { crewId: 2, actualMemberIds: [], positionId: 9, positionName: "ХИЖАК", workStrip: "СЕКТОР СХІД", battleOrder: "БРО-03", uavSnapshots: [{ equipmentId: 11, name: "LELEKA", serialNumber: "U-11" }] },
    ] as never;
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews, positions: [], journal: [], snapshots: [{ unitName: "РБАК", entries }] });
    expect(result.objects.positionItems).toEqual([expect.objectContaining({ positionName: "ХИЖАК", uavName: "SHARK, LELEKA" })]);
  });

  it("keeps a manual correction or exclusion for one automatic object", () => {
    const manual = defaultSummaryManual();
    const crew = { id: 1, name: "СОКІЛ", positionId: 9, uavType: "розвідувальний", uavName: "SHARK", members: [], actualMembers: [] } as never;
    const position = { id: 9, name: "ХИЖАК", stripName: "СЕКТОР СХІД", battleOrder: "БРО-03", mgrs: "36U UV 10000 20000", locality: "СТЕПОВЕ" } as never;
    const entry = { crewId: 1, actualMemberIds: [], uavSelections: [] } as never;
    const common = { reportDate: "2026-09-15", settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [position], journal: [], snapshots: [{ unitName: "РБАК", entries: [entry] }] };
    const automatic = buildSummaryDocument({ ...common, manual });
    const compositionId = automatic.objects.compositionItems[0].id;
    const positionId = automatic.objects.positionItems[0].id;
    manual.compositionItems = [{ ...automatic.objects.compositionItems[0], count: "3" }];
    manual.positionItems = [{ ...automatic.objects.positionItems[0], excluded: true }];

    const corrected = buildSummaryDocument({ ...common, manual });
    expect(corrected.document.blocks.force_composition[0].text).toContain("Три екіпажі");
    expect(corrected.document.blocks.positions).toEqual([{ text: "Позиції не визначені.", kind: "paragraph" }]);
    expect(manual.compositionItems[0].id).toBe(compositionId);
    expect(manual.positionItems[0].id).toBe(positionId);
  });

  it("uses names, ranks, position and aircraft preserved in a flight-plan snapshot", () => {
    const manual = defaultSummaryManual();
    const entry = {
      crewId: 77, crewName: "АРХІВНИЙ", crewUavType: "розвідувальний", actualMemberIds: [701],
      memberSnapshots: [{ personnelId: 701, fullName: "СТАРИЙ Петро Петрович", rank: "сержант" }],
      positionId: 91, positionName: "ЛЕГЕНДА", positionMgrs: "36U UV 11111 22222", positionLocality: "ДІБРОВА", workStrip: "СЕКТОР ЗАХІД", battleOrder: "БРО-09",
      uavSnapshots: [{ equipmentId: 501, name: "SHARK", serialNumber: "ARCH-501" }], areaPoints: ["ЛІСОВЕ"], startTime: "18:01", endTime: "18:00",
    } as never;
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [], positions: [], journal: [], snapshots: [{ unitName: "РБАК", entries: [entry] }] });
    expect(result.objects.compositionItems).toEqual([expect.objectContaining({ battleOrder: "БРО-09", workStrip: "СЕКТОР ЗАХІД" })]);
    expect(result.objects.flightItems[0]).toEqual(expect.objectContaining({ crewName: "АРХІВНИЙ", positionName: "ЛЕГЕНДА", mgrs: "36U UV 11111 22222" }));
    expect(result.objects.flightItems[0].uavs).toEqual([expect.objectContaining({ name: "SHARK", serialNumber: "ARCH-501" })]);
    expect(result.objects.flightItems[0].members).toEqual([expect.objectContaining({ fullName: "СТАРИЙ Петро Петрович", rank: "сержант" })]);
  });

  it("rebuilds the detailed crew and position blocks from the flight journal when a plan snapshot is missing", () => {
    const manual = defaultSummaryManual();
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", uavName: "LELEKA-100", sector: "СЕКТОР СХІД", battleOrder: "БРО-03", actualMembers: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }], members: [] } as never;
    const position = { id: 2, name: "ХИЖАК", stripName: "СЕКТОР СХІД", battleOrder: "БРО-03", mgrs: "36U UV 26000 57000", locality: "СТЕПОВЕ" } as never;
    const journal = [{ id: 1, flightDate: "2026-09-15", skyTime: "12:10", groundTime: "13:00", crewId: 1, crewName: "ГРІМ", positionId: 2, positionName: "ХИЖАК", battleOrder: "БРО-03", workStrip: "СЕКТОР СХІД", uavId: 3, uavName: "LELEKA-100", uavType: "розвідувальний", uavSerialNumber: "UAV-015", mission: "Розвідка", payloadSource: "", payloadId: null, payloadType: "", payloadSerialNumber: "", notes: "" }] as never;
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [position], journal, snapshots: [null, null] });
    expect(result.objects.compositionItems).toHaveLength(1);
    expect(result.objects.positionItems).toEqual([expect.objectContaining({ positionName: "ХИЖАК", mgrs: "36U UV 26000 57000" })]);
    expect(result.objects.flightItems[0]).toEqual(expect.objectContaining({ crewName: "ГРІМ", flightTimes: [{ date: "2026-09-15", time: "12:10" }] }));
  });

  it("does not turn ordinary work hours into position entry and exit events", () => {
    const manual = defaultSummaryManual();
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }], actualMembers: [] } as never;
    const position = { id: 2, name: "ХИЖАК", mgrs: "36U UV 26000 57000", locality: "СТЕПОВЕ" } as never;
    const entry = { crewId: 1, actualMemberIds: [7], startTime: "20:00", endTime: "22:00" } as never;
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [position], journal: [], snapshots: [{ unitName: "РБАК", entries: [entry] }, null] });
    expect(result.objects.rotationEvents.some((event) => event.id.startsWith("crew-enter-"))).toBe(false);
    expect(result.objects.rotationEvents.some((event) => event.id.startsWith("crew-exit-"))).toBe(false);
    expect(result.objects.flightItems[0].members[0]).toEqual(expect.objectContaining({ startDate: "2026-09-14", startTime: "18:01", endDate: "2026-09-15", endTime: "18:00" }));
  });

  it("uses the first work start only for a confirmed new arrival and an explicit departure for leaving", () => {
    const manual = defaultSummaryManual();
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }], actualMembers: [] } as never;
    const position = { id: 2, name: "ХИЖАК", mgrs: "36U UV 26000 57000", locality: "СТЕПОВЕ" } as never;
    const current = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7], startTime: "07:00", endTime: "12:00", departsToday: true, departureTime: "16:30" } as never] };
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual, settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [position], journal: [], snapshots: [{ unitName: "РБАК", entries: [] }, current] });

    expect(result.objects.rotationEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.stringMatching(/^crew-enter-/u), time: "07:00" }),
      expect.objectContaining({ id: expect.stringMatching(/^crew-exit-/u), time: "16:30" }),
    ]));
    expect(result.objects.flightItems[0].members[0]).toEqual(expect.objectContaining({ startDate: "2026-09-15", startTime: "07:00", endDate: "2026-09-15", endTime: "16:30" }));
  });

  it("does not infer an arrival when yesterday's snapshot is unavailable", () => {
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }], actualMembers: [] } as never;
    const current = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7], startTime: "07:00", endTime: "12:00" } as never] };
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual: defaultSummaryManual(), settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [{ id: 2, name: "ХИЖАК" }] as never, journal: [], snapshots: [null, current] });

    expect(result.objects.rotationEvents.some((event) => event.id.startsWith("crew-enter-"))).toBe(false);
    expect(result.objects.flightItems[0].members[0]).toEqual(expect.objectContaining({ startDate: "2026-09-14", startTime: "18:01" }));
  });

  it("keeps an explicit evening arrival from the previous snapshot in the next report", () => {
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }], actualMembers: [] } as never;
    const previous = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7], startTime: "19:01", endTime: "23:00", arrivesToday: true } as never] };
    const result = buildSummaryDocument({ reportDate: "2026-09-16", manual: defaultSummaryManual(), settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [{ id: 2, name: "ХИЖАК" }] as never, journal: [], snapshots: [previous, null] });

    expect(result.objects.rotationEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.stringMatching(/^crew-enter-/u), date: "2026-09-15", time: "19:01" }),
    ]));
    expect(result.objects.flightItems[0].members[0]).toEqual(expect.objectContaining({ startDate: "2026-09-15", startTime: "19:01", endDate: "2026-09-16", endTime: "18:00" }));
  });

  it("honours a persisted arrival even when the previous snapshot is unavailable", () => {
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }], actualMembers: [] } as never;
    const current = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7], startTime: "07:00", endTime: "12:00", arrivesToday: true } as never] };
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual: defaultSummaryManual(), settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [{ id: 2, name: "ХИЖАК" }] as never, journal: [], snapshots: [null, current] });

    expect(result.objects.rotationEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.stringMatching(/^crew-enter-/u), date: "2026-09-15", time: "07:00" }),
    ]));
    expect(result.objects.flightItems[0].members[0]).toEqual(expect.objectContaining({ startDate: "2026-09-15", startTime: "07:00" }));
  });

  it("treats a crew that departed yesterday and appears again today as a new arrival", () => {
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }], actualMembers: [] } as never;
    const previous = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7], startTime: "10:00", endTime: "15:00", departsToday: true, departureTime: "20:00" } as never] };
    const current = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7], startTime: "07:00", endTime: "12:00" } as never] };
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual: defaultSummaryManual(), settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [{ id: 2, name: "ХИЖАК" }] as never, journal: [], snapshots: [previous, current] });

    expect(result.objects.rotationEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.stringMatching(/^crew-exit-/u), date: "2026-09-14", time: "20:00" }),
      expect.objectContaining({ id: expect.stringMatching(/^crew-enter-/u), date: "2026-09-15", time: "07:00" }),
    ]));
    expect(result.objects.flightItems[0].members).toEqual([
      expect.objectContaining({ personnelId: 7, startDate: "2026-09-14", startTime: "18:01", endDate: "2026-09-14", endTime: "20:00" }),
      expect.objectContaining({ personnelId: 7, startDate: "2026-09-15", startTime: "07:00", endDate: "2026-09-15", endTime: "18:00" }),
    ]);
  });

  it("does not leak a current-plan rotation after 18:00 into the current report", () => {
    const crew = {
      id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", actualMembers: [],
      members: [
        { personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" },
        { personnelId: 8, fullName: "КОЗАК Віталій Володимирович", rank: "солдат" },
      ],
    } as never;
    const previous = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7], startTime: "06:00", endTime: "18:00", uavSnapshots: [{ equipmentId: 1, name: "ПОТОЧНИЙ-БПЛА", serialNumber: "CUR-1" }] } as never] };
    const current = { unitName: "РБАК", entries: [
      { crewId: 1, actualMemberIds: [7], startTime: "05:00", endTime: "18:00", uavSnapshots: [{ equipmentId: 1, name: "ПОТОЧНИЙ-БПЛА", serialNumber: "CUR-1" }] },
      { crewId: 1, actualMemberIds: [8], startTime: "19:01", endTime: "23:00", rotationId: "future", uavSnapshots: [{ equipmentId: 2, name: "МАЙБУТНІЙ-БПЛА", serialNumber: "NEXT-2" }] },
    ] as never };
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual: defaultSummaryManual(), settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [{ id: 2, name: "ХИЖАК" }] as never, journal: [], snapshots: [previous, current] });

    expect(result.objects.flightItems[0].uavs.map((item) => item.name)).toEqual(["ПОТОЧНИЙ-БПЛА"]);
    expect(result.objects.flightItems[0].members.map((item) => item.personnelId)).toEqual([7]);
    expect(result.objects.rotationEvents.some((event) => event.time === "19:01")).toBe(false);
    expect(result.document.blocks.flight_operations.some((line) => line.text.includes("МАЙБУТНІЙ-БПЛА"))).toBe(false);
  });

  it("builds the changed crew composition across daily snapshots as one physical transition", () => {
    const crew = {
      id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", actualMembers: [],
      members: [
        { personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" },
        { personnelId: 8, fullName: "КОЗАК Віталій Володимирович", rank: "солдат" },
        { personnelId: 9, fullName: "ЛЕВЧЕНКО Іван Олександрович", rank: "молодший сержант" },
      ],
    } as never;
    const position = { id: 2, name: "ХИЖАК", mgrs: "36U UV 26000 57000", locality: "СТЕПОВЕ" } as never;
    const previous = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7, 8], startTime: "05:00", endTime: "22:00" } as never] };
    const current = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [8, 9], startTime: "07:00", endTime: "12:00" } as never] };
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual: defaultSummaryManual(), settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [position], journal: [], snapshots: [previous, current] });
    const members = result.objects.flightItems[0].members;
    const event = result.objects.rotationEvents.find((item) => item.id.startsWith("snapshot-rotation-"));

    expect(members).toEqual(expect.arrayContaining([
      expect.objectContaining({ personnelId: 7, startDate: "2026-09-14", startTime: "18:01", endDate: "2026-09-15", endTime: "06:59" }),
      expect.objectContaining({ personnelId: 8, startDate: "2026-09-14", startTime: "18:01", endDate: "2026-09-15", endTime: "18:00" }),
      expect.objectContaining({ personnelId: 9, startDate: "2026-09-15", startTime: "07:00", endDate: "2026-09-15", endTime: "18:00" }),
    ]));
    expect(event).toEqual(expect.objectContaining({ date: "2026-09-15", time: "07:00" }));
    expect(event?.text).toContain("-06:59 год 15.09.2026 завершив бойове чергування");
    expect(event?.text).toContain("-07:00 год 15.09.2026 приступив до бойового чергування");
    expect(event?.text).not.toContain("-22:00 год");
  });

  it("keeps sequential current-day rotations after a cross-snapshot composition change", () => {
    const crew = {
      id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", actualMembers: [],
      members: [
        { personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" },
        { personnelId: 8, fullName: "КОЗАК Віталій Володимирович", rank: "солдат" },
        { personnelId: 9, fullName: "ЛЕВЧЕНКО Іван Олександрович", rank: "молодший сержант" },
      ],
    } as never;
    const previous = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7], startTime: "05:00", endTime: "22:00" } as never] };
    const current = { unitName: "РБАК", entries: [
      { crewId: 1, actualMemberIds: [8], startTime: "07:00", endTime: "09:59" },
      { crewId: 1, actualMemberIds: [9], startTime: "10:00", endTime: "12:59", rotationId: "middle" },
      { crewId: 1, actualMemberIds: [7], startTime: "13:00", endTime: "18:00", rotationId: "last" },
    ] as never };
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual: defaultSummaryManual(), settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions: [{ id: 2, name: "ХИЖАК" }] as never, journal: [], snapshots: [previous, current] });
    const members = result.objects.flightItems[0].members;

    expect(members.filter((item) => item.personnelId === 7)).toEqual([
      expect.objectContaining({ startTime: "18:01", endTime: "06:59" }),
      expect.objectContaining({ startTime: "13:00", endTime: "18:00" }),
    ]);
    expect(members).toEqual(expect.arrayContaining([
      expect.objectContaining({ personnelId: 8, startTime: "07:00", endTime: "09:59" }),
      expect.objectContaining({ personnelId: 9, startTime: "10:00", endTime: "12:59" }),
    ]));
    expect(result.objects.rotationEvents.filter((event) => event.id.startsWith("rotation-") || event.id.startsWith("snapshot-rotation-"))).toHaveLength(3);
  });

  it("closes the old position one minute before a valid cross-snapshot move", () => {
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", actualMembers: [], members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }] } as never;
    const positions = [
      { id: 1, name: "СТАРА", mgrs: "36U UV 10000 10000", locality: "НП-1" },
      { id: 2, name: "НОВА", mgrs: "36U UV 20000 20000", locality: "НП-2" },
    ] as never;
    const previous = { unitName: "РБАК", entries: [{ crewId: 1, positionId: 1, positionName: "СТАРА", actualMemberIds: [7], startTime: "05:00", endTime: "22:00" } as never] };
    const current = { unitName: "РБАК", entries: [{ crewId: 1, positionId: 2, positionName: "НОВА", actualMemberIds: [7], startTime: "07:00", endTime: "12:00" } as never] };
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual: defaultSummaryManual(), settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions, journal: [], snapshots: [previous, current] });
    const oldPosition = result.objects.flightItems.find((item) => item.positionName === "СТАРА");
    const newPosition = result.objects.flightItems.find((item) => item.positionName === "НОВА");

    expect(oldPosition?.members).toEqual([expect.objectContaining({ personnelId: 7, endDate: "2026-09-15", endTime: "06:59" })]);
    expect(newPosition?.members).toEqual([expect.objectContaining({ personnelId: 7, startDate: "2026-09-15", startTime: "07:00" })]);
    expect(result.objects.rotationEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.stringMatching(/^crew-position-exit-/u), date: "2026-09-15", time: "06:59" }),
      expect.objectContaining({ id: expect.stringMatching(/^crew-enter-/u), date: "2026-09-15", time: "07:00" }),
    ]));
  });

  it("does not invent a position-move boundary when the current start time is absent", () => {
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", actualMembers: [], members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }] } as never;
    const positions = [{ id: 1, name: "СТАРА" }, { id: 2, name: "НОВА" }] as never;
    const previous = { unitName: "РБАК", entries: [{ crewId: 1, positionId: 1, positionName: "СТАРА", actualMemberIds: [7], startTime: "05:00", endTime: "22:00" } as never] };
    const current = { unitName: "РБАК", entries: [{ crewId: 1, positionId: 2, positionName: "НОВА", actualMemberIds: [7], startTime: "", endTime: "12:00" } as never] };
    const result = buildSummaryDocument({ reportDate: "2026-09-15", manual: defaultSummaryManual(), settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never, crews: [crew], positions, journal: [], snapshots: [previous, current] });
    const oldPosition = result.objects.flightItems.find((item) => item.positionName === "СТАРА");
    const newPosition = result.objects.flightItems.find((item) => item.positionName === "НОВА");

    expect(oldPosition?.members).toEqual([expect.objectContaining({ personnelId: 7, endDate: "2026-09-15", endTime: "18:00" })]);
    expect(newPosition?.members).toEqual([]);
    expect(result.objects.rotationEvents.some((event) => event.id.startsWith("crew-position-exit-") || event.id.startsWith("crew-enter-"))).toBe(false);
  });

  it("allows KSP duty outside the person's position interval and blocks an overlap", () => {
    const manual = defaultSummaryManual();
    manual.commandDuties = [{ id: "night", personnelId: 7, periods: [{ id: "night-period", startDate: "2026-09-14", startTime: "18:01", endDate: "2026-09-15", endTime: "05:59" }] }];
    const crew = { id: 1, name: "ГРІМ", positionId: 2, uavType: "розвідувальний", members: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }], actualMembers: [] } as never;
    const position = { id: 2, name: "ХИЖАК", mgrs: "36U UV 26000 57000", locality: "СТЕПОВЕ" } as never;
    const plan = { unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [7], startTime: "06:00", endTime: "18:00" } as never] };
    const common = { reportDate: "2026-09-15", settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", kspName: "ОРІОН", kspLocality: "КАЛИНІВКА", authorizedStrength: 4 } } as never, crews: [crew], positions: [position], journal: [], snapshots: [{ unitName: "РБАК", entries: [] }, plan], staffing: [{ personnelId: 7, fullName: "ЯРЕМЧУК Максим Романович", rank: "сержант" }] as never };
    const allowed = buildSummaryDocument({ ...common, manual });
    expect(allowed.warnings).not.toContain("Людина з чергування КСП одночасно зазначена на позиції. Приберіть її з КСП або плану польотів.");
    expect(allowed.objects.rotationEvents.some((event) => event.id === "ksp-command-night")).toBe(true);

    manual.commandDuties = [{ id: "overlap", personnelId: 7, periods: [{ id: "overlap-period", startDate: "2026-09-15", startTime: "05:00", endDate: "2026-09-15", endTime: "07:00" }] }];
    const blocked = buildSummaryDocument({ ...common, manual });
    expect(blocked.warnings).toContain("Людина з чергування КСП одночасно зазначена на позиції. Приберіть її з КСП або плану польотів.");
    expect(blocked.objects.rotationEvents.some((event) => event.id === "ksp-command-overlap")).toBe(false);
  });

  it("alternates selected KSP personnel and covers the full report day without gaps", () => {
    const items = buildAlternatingDutySchedule([{ id: "a", personnelId: 1, periods: [] }, { id: "b", personnelId: 2, periods: [] }], "2026-09-15", 4);
    expect(items[0].periods).toEqual([
      expect.objectContaining({ startDate: "2026-09-14", startTime: "18:01", endDate: "2026-09-14", endTime: "22:00" }),
      expect.objectContaining({ startDate: "2026-09-15", startTime: "02:01", endDate: "2026-09-15", endTime: "06:00" }),
      expect.objectContaining({ startDate: "2026-09-15", startTime: "10:01", endDate: "2026-09-15", endTime: "14:00" }),
    ]);
    expect(items[1].periods[2]).toEqual(expect.objectContaining({ startTime: "14:01", endTime: "18:00" }));

    const manual = defaultSummaryManual();
    manual.commandDuties = items;
    manual.guardDuties = items.map((item) => ({ ...item, id: `guard-${item.id}`, periods: item.periods.map((period) => ({ ...period, id: `guard-${period.id}` })) }));
    const result = buildSummaryDocument({
      reportDate: "2026-09-15", manual,
      settings: { mainSigner: {}, unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 4 } } as never,
      crews: [], positions: [], journal: [], snapshots: [],
      staffing: [
        { personnelId: 1, fullName: "ПЕТРЕНКО Петро Петрович", rank: "капітан" },
        { personnelId: 2, fullName: "ІВАНЕНКО Іван Іванович", rank: "лейтенант" },
      ] as never,
    });
    expect(result.warnings).not.toContain("Позмінне управління боєм на КСП має покривати всю звітну добу з 18:01 до 18:00.");
    expect(result.warnings).not.toContain("Позмінна охорона та оборона КСП має покривати всю звітну добу з 18:01 до 18:00.");
    expect(result.document.blocks.command_duties[0].text).toContain("в періоди з 18:01 по 22:00 14.09.2026; з 02:01 по 06:00 15.09.2026; з 10:01 по 14:00 15.09.2026");
  });
});
