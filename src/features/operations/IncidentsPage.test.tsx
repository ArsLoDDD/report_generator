import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { IncidentsPage } from "./IncidentsPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const incident = (id: number) => ({ id, incidentType: `Подія ${id}`, occurredAt: "2026-08-18T09:30", crewId: 4, crewName: "ГРІМ", equipmentId: 8, equipmentName: "VAMPIRE", equipmentIds: [8], equipmentNames: ["VAMPIRE"], positionName: "ХИЖАК", reconnaissanceArea: "СТЕПОВЕ", crewSnapshot: "Іваненко Іван Іванович", vehicleName: "Toyota Hilux АА 2103 КТ", description: `Опис ${id}` });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Журнал інцидентів", () => {
  it("показує по 20 записів, підвантажує решту та відкриває деталі з нормальною датою і часом", async () => {
    const incidents = Array.from({ length: 25 }, (_, index) => incident(index + 1));
    invoke.mockImplementation((command: string) => command === "list_incidents" ? Promise.resolve(incidents) : command === "list_crews" || command === "list_equipment" ? Promise.resolve([]) : Promise.resolve());
    const { container } = render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    expect(await screen.findByText("Показано 20 із 25")).toBeInTheDocument();
    expect(screen.queryByText("Подія 25")).not.toBeInTheDocument();
    const scroll = container.querySelector<HTMLElement>(".data-table__scroll")!;
    Object.defineProperties(scroll, { scrollHeight: { value: 1000 }, clientHeight: { value: 500 }, scrollTop: { value: 450, configurable: true } });
    fireEvent.scroll(scroll);
    await waitFor(() => expect(screen.getByText("Показано 25 із 25")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Подія 25"));
    expect(screen.getByRole("heading", { name: "Інцидент №25" })).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("18.08.2026")).toBeInTheDocument();
    expect(within(dialog).getByText("09:30")).toBeInTheDocument();
  });

  it("для іншого інциденту просить назву події та зберігає дату і час з окремих полів", async () => {
    invoke.mockImplementation((command: string) => command === "list_incidents" || command === "list_crews" || command === "list_equipment" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    fireEvent.change(screen.getByLabelText("Тип інциденту"), { target: { value: "Інший інцидент" } });
    fireEvent.change(screen.getByPlaceholderText("Наприклад, вимушена посадка"), { target: { value: "Вимушена посадка" } });
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-09-12" } });
    fireEvent.change(screen.getByLabelText("Час"), { target: { value: "14:45" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", { draft: expect.objectContaining({ incidentType: "Вимушена посадка", occurredAt: "2026-09-12T14:45" }) }));
  });

  it("показує фактичний склад і дозволяє вибрати кілька одиниць лише з майна обраного екіпажу", async () => {
    const member = { personnelId: 41, fullName: "ІВАНЕНКО Іван Іванович", rank: "солдат", position: "Оператор", callsign: "СОКІЛ" };
    const crew = { id: 4, name: "ГРІМ", positionName: "ХИЖАК", reconnaissanceArea: "СТЕПОВЕ", actualMembers: [member] };
    const asset = (id: number, category: string, name: string, crewId: number | null) => ({ id, category, name, inventoryNumber: `INV-${id}`, status: "Справний", crewId, crewName: crewId ? "ГРІМ" : null, personnelId: null, holderName: null, totalQuantity: 1, dayQuantity: 1, nightQuantity: 0, assetKind: "aircraft", componentsJson: "[]", assignedQuantity: 1, notes: "" });
    const mavic = asset(8, "uav", "MAVIC 3T", 4);
    const generator = asset(9, "generator", "EcoFlow", 4);
    const foreign = asset(10, "communications", "Hytera", null);
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_incidents") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [mavic] : args?.category === "generator" ? [generator] : args?.category === "communications" ? [foreign] : []);
      return Promise.resolve();
    });
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    expect(screen.getByRole("button", { name: "Додати майно" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Екіпаж інциденту"), { target: { value: "4" } });
    expect(screen.getByDisplayValue("ХИЖАК")).toBeInTheDocument();
    expect(screen.getByText("ІВАНЕНКО Іван Іванович")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Додати майно" }));
    expect(screen.queryByText("Hytera")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("MAVIC 3T"));
    fireEvent.click(screen.getByText("EcoFlow"));
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", { draft: expect.objectContaining({ crewId: 4, positionName: "ХИЖАК", equipmentIds: [8, 9] }) }));
  });
});
