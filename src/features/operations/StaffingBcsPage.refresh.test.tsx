import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { settingsService } from "../settings/services/settingsService";
import { StaffingBcsPage } from "./StaffingBcsPage";
import { operationsService } from "./services/operationsService";

vi.mock("../../shared/ui/PageFrame", () => ({ PageFrame: ({ children, tools }: { children: ReactNode; tools?: ReactNode }) => <div data-testid="staffing-page">{tools}{children}</div> }));
vi.mock("../settings/services/settingsService", () => ({ settingsService: { get: vi.fn() } }));
vi.mock("./services/operationsService", () => ({
  operationsService: {
    listStaffingRecords: vi.fn(),
    listStaffingRecordsForDate: vi.fn(),
    listVacancyRecommendations: vi.fn(),
    listTemporaryPersonnel: vi.fn(),
    listCrews: vi.fn(),
    getFlightPlanSnapshot: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(operationsService.listStaffingRecords).mockResolvedValue([]);
  vi.mocked(operationsService.listStaffingRecordsForDate).mockResolvedValue([]);
  vi.mocked(operationsService.listVacancyRecommendations).mockResolvedValue([]);
  vi.mocked(operationsService.listTemporaryPersonnel).mockResolvedValue([]);
  vi.mocked(operationsService.listCrews).mockResolvedValue([]);
  vi.mocked(operationsService.getFlightPlanSnapshot).mockResolvedValue(null);
  const signer = { fullName: "", rank: "", position: "" };
  vi.mocked(settingsService.get).mockResolvedValue({
    mainSigner: signer, commander: signer, chief: signer, deputyPpp: signer, deputyArmament: signer, deputyRear: signer, fuelChief: signer, signerRoles: [],
    unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 72 },
  });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Оновлення БЧС за добовим планом", () => {
  it("loads the non-mutating tomorrow forecast only after the user selects tomorrow", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 23, 12, 0, 0));

    render(<NotificationProvider><StaffingBcsPage /></NotificationProvider>);
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(1));
    expect(operationsService.listStaffingRecordsForDate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "БЧС" }));
    fireEvent.click(screen.getByRole("button", { name: /Завтра/ }));

    await waitFor(() => expect(operationsService.listStaffingRecordsForDate).toHaveBeenCalledWith("2026-09-24"));
    expect(await screen.findByText("Прогноз на завтра")).toBeInTheDocument();
  });

  it("оновлює дані опівночі та один раз після одночасних focus/visibility подій", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 17, 23, 59, 30));

    render(<NotificationProvider><StaffingBcsPage /></NotificationProvider>);
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(30_100); });
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(2));

    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(3));

    act(() => {
      window.dispatchEvent(new CustomEvent("operational-data-updated", { detail: { command: "save_flight_plan_snapshot" } }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(4));
  });

  it("оновлює БЧС точно на заїзді, ротації та виїзді, ігноруючи звичайний початок першого етапу", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 17, 10, 0, 0));
    vi.mocked(operationsService.getFlightPlanSnapshot).mockResolvedValue(JSON.stringify({
      unitName: "РБАК",
      entries: [
        { crewId: 1, arrivesToday: true, startTime: "10:01", departsToday: true, departureTime: "10:03" },
        { crewId: 1, rotationId: "rotation-1", startTime: "10:02" },
        { crewId: 2, arrivesToday: false, startTime: "10:04", departsToday: false },
        { crewId: 2, rotationId: "rotation-2", startTime: "10:05" },
      ],
    }));

    render(<NotificationProvider><StaffingBcsPage /></NotificationProvider>);
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(operationsService.getFlightPlanSnapshot).toHaveBeenCalledWith("2026-09-17"));

    await act(async () => { await vi.advanceTimersByTimeAsync(60_100); });
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(2));

    await act(async () => { await vi.advanceTimersByTimeAsync(60_100); });
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(3));

    await act(async () => { await vi.advanceTimersByTimeAsync(60_100); });
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(4));

    await act(async () => { await vi.advanceTimersByTimeAsync(60_100); });
    expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(4);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_100); });
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(5));
  });

  it("оновлює БЧС окремо в час виведення та заведення ОС", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 17, 10, 0, 0));
    vi.mocked(operationsService.getFlightPlanSnapshot).mockResolvedValue(JSON.stringify({
      unitName: "РБАК",
      entries: [{ crewId: 1, arrivesToday: false, startTime: "05:00", departsToday: false }],
      personnelTransitions: [{
        id: "personnel-1",
        crewId: 1,
        outgoingMemberIds: [1],
        outgoingTime: "10:01",
        incomingMemberIds: [2],
        incomingTime: "10:02",
      }],
    }));

    render(<NotificationProvider><StaffingBcsPage /></NotificationProvider>);
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(operationsService.getFlightPlanSnapshot).toHaveBeenCalledWith("2026-09-17"));

    await act(async () => { await vi.advanceTimersByTimeAsync(60_100); });
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(2));

    await act(async () => { await vi.advanceTimersByTimeAsync(60_100); });
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(3));
  });

  it("не створює перехідні таймери для пошкодженого знімка", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 17, 10, 0, 0));
    vi.mocked(operationsService.getFlightPlanSnapshot).mockResolvedValue("{пошкоджено");

    render(<NotificationProvider><StaffingBcsPage /></NotificationProvider>);
    await waitFor(() => expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1_000); });
    expect(operationsService.listStaffingRecords).toHaveBeenCalledTimes(1);
  });

  it("пам'ятає згорнутий блок за стабільним ID після перейменування структури", async () => {
    localStorage.setItem("staffing-collapse-all", "false");
    const signer = { fullName: "", rank: "", position: "" };
    const settings = (name: string) => ({
      mainSigner: signer, commander: signer, chief: signer, deputyPpp: signer, deputyArmament: signer, deputyRear: signer, fuelChief: signer, signerRoles: [],
      unit: { kind: "Рота" as const, shortName: "РБАК", authorizedStrength: 1, structure: [{ id: "stable-group", parentId: null, kind: "group" as const, name, order: 0 }, { id: "stable-position", parentId: "stable-group", kind: "position" as const, name: "Тестова посада", order: 0 }] },
    });
    vi.mocked(settingsService.get).mockResolvedValue(settings("Стара назва"));
    const first = render(<NotificationProvider><StaffingBcsPage /></NotificationProvider>);
    const oldBlock = await screen.findByRole("button", { name: /Стара назва/ });
    expect(oldBlock).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(oldBlock);
    expect(JSON.parse(localStorage.getItem("staffing-collapsed-blocks-v1") ?? "[]")).toContain("section:stable-group");
    first.unmount();

    vi.mocked(settingsService.get).mockResolvedValue(settings("Нова назва"));
    render(<NotificationProvider><StaffingBcsPage /></NotificationProvider>);
    expect(await screen.findByRole("button", { name: /Нова назва/ })).toHaveAttribute("aria-expanded", "false");
  });
});
