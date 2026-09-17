import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { defaultSummaryManual } from "./summary-report-model";
import { SummaryReportPage } from "./SummaryReportPage";

const { invoke, renderAsync } = vi.hoisted(() => ({ invoke: vi.fn(), renderAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("docx-preview", () => ({ renderAsync }));

const settings = {
  mainSigner: { fullName: "ПЕТРЕНКО Петро Петрович", rank: "капітан", position: "командир" },
  commander: {}, chief: {}, deputyPpp: {}, deputyArmament: {}, deputyRear: {}, fuelChief: {}, signerRoles: [],
  unit: {
    kind: "Рота", shortName: "РБАК", battalionShortName: "1 ББпС", militaryUnitShortName: "477 ОББпС",
    reportRecipient: "Командиру 477 ОББпС", kspName: "ОРІОН", kspLocality: "КАЛИНІВКА", kspMgrs: "36U UV 40000 47000",
    armyCorpsNumber: "1", authorizedStrength: 4,
  },
};

const setupInvoke = () => {
  const manual = defaultSummaryManual();
  manual.reportNumber = "2555/8580-в/дск";
  invoke.mockImplementation((command: string) => {
    if (command === "get_app_settings") return Promise.resolve(settings);
    if (command === "load_summary_report_draft") return Promise.resolve({ current: JSON.stringify(manual), previous: null });
    if (command === "get_flight_plan_snapshot") return Promise.resolve(null);
    if (command === "render_summary_report_preview") return Promise.resolve([80, 75, 3, 4]);
    if (["list_crews", "list_positions", "list_equipment", "list_flight_journal_entries", "list_staffing_records", "list_position_work", "list_position_work_status_history"].includes(command)) return Promise.resolve([]);
    return Promise.resolve();
  });
};

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); setupInvoke(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });

describe("Підсумкове донесення", () => {
  it("бере плани за D−1 і D та не підмішує завтрашню локальну чернетку", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 17, 14, 0));
    localStorage.setItem("flight-plan-draft-v2", JSON.stringify({
      date: "2026-09-18",
      unitName: "ЗАВТРАШНІЙ ПЛАН",
      selected: [99],
      entries: { 99: { crewId: 99, actualMemberIds: [], startTime: "18:01", endTime: "18:00" } },
    }));

    render(<NotificationProvider><SummaryReportPage /></NotificationProvider>);

    await screen.findByText("Документ за 17.09.2026");
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_flight_plan_snapshot", { planDate: "2026-09-16" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_flight_plan_snapshot", { planDate: "2026-09-17" }));
    expect(invoke).not.toHaveBeenCalledWith("get_flight_plan_snapshot", { planDate: "2026-09-18" });
    expect(screen.queryByText("ЗАВТРАШНІЙ ПЛАН")).not.toBeInTheDocument();
  });

  it("відновлює відкриті та закриті пункти після повернення на сторінку", async () => {
    localStorage.setItem("summary-report:open-sections:v1", JSON.stringify({ situation: false, issues: true }));
    render(<NotificationProvider><SummaryReportPage /></NotificationProvider>);

    const situation = (await screen.findByText("2. ПОЛОЖЕННЯ ТА СТАН ПІДРОЗДІЛІВ НАШИХ ВІЙСЬК")).closest("details");
    const issues = screen.getByText("8. ПРОБЛЕМНІ ПИТАННЯ:").closest("details");
    expect(situation).not.toHaveAttribute("open");
    expect(issues).toHaveAttribute("open");

    fireEvent.click(screen.getByText("8. ПРОБЛЕМНІ ПИТАННЯ:"));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("summary-report:open-sections:v1") || "{}").issues).toBe(false));
  });

  it("не перегенеровує превʼю після зовнішнього сигналу без фактичної зміни даних", async () => {
    render(<NotificationProvider><SummaryReportPage /></NotificationProvider>);
    await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new CustomEvent("operational-data-updated"));
      await Promise.resolve();
    });
    await waitFor(() => expect(invoke.mock.calls.filter(([command]) => command === "get_app_settings").length).toBeGreaterThanOrEqual(2));
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    expect(renderAsync).toHaveBeenCalledTimes(1);
  });

  it("не дозволяє повільнішому старому запиту замінити новіший знімок плану", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 17, 14, 0));
    render(<NotificationProvider><SummaryReportPage /></NotificationProvider>);
    await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(1));

    const baseImplementation = invoke.getMockImplementation();
    const resolvers: Array<(value: string) => void> = [];
    let currentSnapshotRequests = 0;
    const snapshot = (label: string) => JSON.stringify({
      unitName: "РБАК",
      entries: [{
        crewId: 11,
        crewName: `${label} ЕКІПАЖ`,
        crewUavType: "Коптер",
        actualMemberIds: [],
        actualCommanderId: null,
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
        positionId: 21,
        positionName: `${label} ПОЗИЦІЯ`,
        workStrip: "СМУГА ПІВНІЧ",
        battleOrder: "БРО-01",
      }],
    });
    invoke.mockImplementation((command: string, args?: { planDate?: string }) => {
      if (command === "get_flight_plan_snapshot" && args?.planDate === "2026-09-17") {
        currentSnapshotRequests += 1;
        return new Promise<string>((resolve) => { resolvers.push(resolve); });
      }
      return baseImplementation?.(command, args);
    });

    act(() => { window.dispatchEvent(new CustomEvent("flight-plan-updated")); });
    await waitFor(() => expect(currentSnapshotRequests).toBe(1));
    act(() => { window.dispatchEvent(new CustomEvent("flight-plan-updated")); });
    await waitFor(() => expect(currentSnapshotRequests).toBe(2));

    await act(async () => { resolvers[1](snapshot("НОВА")); });
    expect(await screen.findByText("НОВА ПОЗИЦІЯ", { selector: "b" })).toBeInTheDocument();

    await act(async () => { resolvers[0](snapshot("СТАРА")); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("НОВА ПОЗИЦІЯ", { selector: "b" })).toBeInTheDocument();
    expect(screen.queryByText("СТАРА ПОЗИЦІЯ", { selector: "b" })).not.toBeInTheDocument();
  });

  it("дозволяє обрати людину з плану для неперетинного чергування КСП", async () => {
    const baseImplementation = invoke.getMockImplementation();
    const positionPerson = { personnelId: 7, fullName: "ПОЗИЦІЙНИЙ Петро Петрович", rank: "солдат" };
    const freePerson = { personnelId: 8, fullName: "ВІЛЬНИЙ Василь Васильович", rank: "сержант" };
    invoke.mockImplementation((command: string, args?: unknown) => {
      if (command === "list_staffing_records") return Promise.resolve([positionPerson, freePerson]);
      if (command === "get_flight_plan_snapshot") return Promise.resolve(JSON.stringify({ unitName: "РБАК", entries: [{ crewId: 1, actualMemberIds: [positionPerson.personnelId] }] }));
      return baseImplementation?.(command, args);
    });
    render(<NotificationProvider><SummaryReportPage /></NotificationProvider>);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_staffing_records"));
    await waitFor(() => expect(renderAsync).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Додати: Позмінне управління боєм на КСП", hidden: true }));
    const selects = await screen.findAllByLabelText("Військовослужбовець");
    const labels = Array.from((selects[0] as HTMLSelectElement).options).map((option) => option.text);
    expect(labels.some((label) => label.includes(positionPerson.fullName))).toBe(true);
    expect(labels.some((label) => label.includes(freePerson.fullName))).toBe(true);

    const dutyCard = selects[0].closest("article");
    expect(dutyCard).not.toBeNull();
    fireEvent.click(within(dutyCard as HTMLElement).getByRole("button", { name: "Додати період" }));
    expect(within(dutyCard as HTMLElement).getByText("Період 1")).toBeInTheDocument();
    expect(within(dutyCard as HTMLElement).getByText("Від")).toBeInTheDocument();
    expect(within(dutyCard as HTMLElement).getByText("До")).toBeInTheDocument();
    expect(within(dutyCard as HTMLElement).getByLabelText("Дата першого часу")).toBeInTheDocument();
    expect(within(dutyCard as HTMLElement).getByLabelText("Дата другого часу")).toBeInTheDocument();
  });

  it("переходить до нового донесення лише після підтвердження і зберігає поточне", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 15, 18, 30));
    render(<NotificationProvider><SummaryReportPage /></NotificationProvider>);

    const nextButton = await screen.findByRole("button", { name: "Перейти до нового донесення" });
    fireEvent.click(nextButton);
    expect(screen.getByRole("dialog", { name: "Перейти до нового донесення?" })).toBeInTheDocument();
    expect(screen.getByText("Документ за 15.09.2026")).toBeInTheDocument();
    expect(invoke.mock.calls.filter(([command]) => command === "load_summary_report_draft")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Так, перейти" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("save_summary_report_draft", expect.objectContaining({ reportDate: "2026-09-15" })));
    await waitFor(() => expect(screen.getByText("Документ за 16.09.2026")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Повернутися до попереднього донесення" })).toBeInTheDocument();
  });

  it("о 12:00 автоматично переходить до нового донесення без діалогу", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 16, 11, 59, 30));
    render(<NotificationProvider><SummaryReportPage /></NotificationProvider>);
    await screen.findByText("Документ за 15.09.2026");

    await act(async () => { await vi.advanceTimersByTimeAsync(30_100); });

    await waitFor(() => expect(screen.getByText("Документ за 16.09.2026")).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "Перейти до нового донесення?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Повернутися до попереднього донесення" })).not.toBeInTheDocument();
  });

  it("о 12:00 закриває відкрите підтвердження і переходить автоматично", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 16, 11, 59, 30));
    render(<NotificationProvider><SummaryReportPage /></NotificationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Перейти до нового донесення" }));
    expect(screen.getByRole("dialog", { name: "Перейти до нового донесення?" })).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(30_100); });

    await waitFor(() => expect(screen.getByText("Документ за 16.09.2026")).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "Перейти до нового донесення?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Повернутися до попереднього донесення" })).not.toBeInTheDocument();
  });

  it("не приймає ручне підтвердження, якщо 12:00 настало до натискання", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 16, 11, 59, 30));
    render(<NotificationProvider><SummaryReportPage /></NotificationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Перейти до нового донесення" }));
    vi.setSystemTime(new Date(2026, 8, 16, 12, 0, 10));

    fireEvent.click(screen.getByRole("button", { name: "Так, перейти" }));

    await waitFor(() => expect(screen.getByText("Документ за 16.09.2026")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Повернутися до попереднього донесення" })).not.toBeInTheDocument();
  });
});
