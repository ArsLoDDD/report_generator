import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { FLIGHT_PLAN_STORAGE_KEY } from "./flight-plan-storage";
import { FlightJournalPage } from "./FlightJournalPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const crew = { id: 4, name: "ГРІМ", positionName: "САПСАН", positionId: 2, battleOrder: "БРО-02", sector: "СМУГА СХІД", primaryUavId: 8, uavName: "MAVIC 3T", uavType: "Коптер", status: "Працюючий", actualMembers: [], members: [] };
const uav = { id: 8, category: "uav", name: "MAVIC 3T", inventoryNumber: "UAV-008", uavType: "Коптер", crewId: 4, weaponKind: "weapon" };
const position = { id: 2, name: "САПСАН", battleOrder: "БРО-02" };

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

describe("Журнал польотів", () => {
  it("підставляє погоджені поля з плану, не показує джерело та залишає нотатки останніми", async () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({ date: "13.09.2026", entries: { 4: { startTime: "06:10", endTime: "07:25", task: "Розвідка", uavSelections: [{ equipmentId: 8 }], payloadSelection: null } } }));
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_flight_journal_entries") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [uav] : []);
      if (command === "list_workshop_products") return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/Джерело даних/i)).not.toBeInTheDocument();
    fireEvent.change(dialog.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: "2026-09-13" } });
    fireEvent.change(within(dialog).getByLabelText("Екіпаж польоту"), { target: { value: "4" } });
    expect(within(dialog).getByDisplayValue("06:10")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("07:25")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("СМУГА СХІД")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("UAV-008")).toBeInTheDocument();
    const fieldNames = [...dialog.querySelectorAll<HTMLElement>(".operation-editor__body > .form-field > span")].map((element) => element.textContent?.trim());
    expect(fieldNames[fieldNames.length - 1]).toBe("Нотатки");
  });

  it("зберігає запис без поля джерела даних", async () => {
    invoke.mockImplementation((command: string) => command === "list_flight_journal_entries" || command === "list_crews" || command === "list_positions" || command === "list_equipment" || command === "list_workshop_products" ? Promise.resolve(command === "list_crews" ? [crew] : []) : Promise.resolve());
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    fireEvent.change(screen.getByLabelText("Екіпаж польоту"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Час «Небо»"), { target: { value: "07:10" } });
    fireEvent.change(screen.getByLabelText("Час «Земля»"), { target: { value: "08:20" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти запис" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_flight_journal_entry", { draft: expect.not.objectContaining({ source: expect.anything() }) }));
  });

  it("не зберігає політ без обох обов’язкових часів Небо і Земля", async () => {
    invoke.mockImplementation((command: string) => command === "list_flight_journal_entries" || command === "list_crews" || command === "list_positions" || command === "list_equipment" || command === "list_workshop_products" ? Promise.resolve(command === "list_crews" ? [crew] : []) : Promise.resolve());
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    fireEvent.change(screen.getByLabelText("Екіпаж польоту"), { target: { value: "4" } });
    const skyTime=screen.getByLabelText("Час «Небо»");
    const groundTime=screen.getByLabelText("Час «Земля»");
    expect(skyTime).toBeRequired();
    expect(groundTime).toBeRequired();

    fireEvent.click(screen.getByRole("button", { name: "Зберегти запис" }));
    expect(await screen.findByText("Вкажіть обов’язкові часи «Небо» та «Земля».")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("create_flight_journal_entry", expect.anything());

    fireEvent.change(skyTime, { target: { value: "07:10" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти запис" }));
    expect(invoke).not.toHaveBeenCalledWith("create_flight_journal_entry", expect.anything());

    fireEvent.change(groundTime, { target: { value: "08:20" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти запис" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_flight_journal_entry", { draft: expect.objectContaining({ skyTime: "07:10", groundTime: "08:20" }) }));
  });
});
