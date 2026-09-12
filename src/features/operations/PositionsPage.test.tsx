import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { PositionsPage } from "./PositionsPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const position = { id: 3, name: "БУРЕВІЙ", positionType: "Запасна", stripName: "СМУГА ПІВНІЧ", locality: "НОВОСЕЛІВКА", battleOrder: "БРО-01", sector: "", condition: "", conditionLevel: 0, fieldType: "", size: "", mgrs: "36U UV 12000 67000", suitableUavText: "", isActive: false, crewId: null, crewName: "СОКІЛ", notes: "Тестова позиція", uavIds: [8], uavNames: ["SHARK"] };
const crew = { id: 9, name: "СОКІЛ", positionId: 3, status: "Працюючий", workingStrength: 3, officialStrength: 4, primaryUavId: 8, uavName: "SHARK", sector: "СМУГА ПІВНІЧ", actualMembers: [] };
const linkedEquipment = { id: 8, category: "uav", name: "SHARK", inventoryNumber: "UAV-008", status: "Справний", crewId: 9, crewName: "СОКІЛ", personnelId: null, holderName: null, totalQuantity: 1, dayQuantity: 1, nightQuantity: 0, assetKind: "aircraft", componentsJson: "[]", assignedQuantity: 1, notes: "" };
const availableEquipment = { ...linkedEquipment, id: 18, category: "generator", name: "EcoFlow Delta", inventoryNumber: "GEN-018" };

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

describe("Картка позиції", () => {
  it("показує тип, зайнятість з плану польотів і корисні оперативні дані без дублювання району", async () => {
    localStorage.setItem("flight-plan-draft-v2", JSON.stringify({ selected: [9] }));
    invoke.mockImplementation((command: string) => command === "list_positions" ? Promise.resolve([position]) : command === "list_crews" ? Promise.resolve([crew]) : command === "list_incidents" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    expect(await screen.findByText("Запасна")).toBeInTheDocument();
    expect(screen.getByText("На позиції")).toBeInTheDocument();
    expect(screen.getByText("БРО-01")).toBeInTheDocument();
    expect(screen.getByText("СОКІЛ")).toHaveClass("position-card__crew", "is-on-position");
    expect(screen.getAllByText("НОВОСЕЛІВКА")).toHaveLength(1);
    expect(screen.queryByText("Інциденти")).not.toBeInTheDocument();
    expect(screen.queryByText("Відкрити")).not.toBeInTheDocument();
    expect(screen.queryByText("СМУГА ПІВНІЧ")).not.toBeInTheDocument();
  });

  it("показує по 20 карток, підвантажує наступні та шукає серед ще не показаних", async () => {
    const positions = Array.from({ length: 25 }, (_, index) => ({ ...position, id: index + 1, name: `ПОЗИЦІЯ ${index + 1}`, battleOrder: `БРО-${index + 1}` }));
    invoke.mockImplementation((command: string) => command === "list_positions" ? Promise.resolve(positions) : command === "list_crews" || command === "list_incidents" ? Promise.resolve([]) : Promise.resolve());
    const { container } = render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    expect(await screen.findByText("Показано 20 із 25")).toBeInTheDocument();
    expect(screen.queryByText("ПОЗИЦІЯ 25")).not.toBeInTheDocument();
    const content = container.querySelector<HTMLElement>(".page-frame__content")!;
    Object.defineProperties(content, { scrollHeight: { value: 1000 }, clientHeight: { value: 500 }, scrollTop: { value: 450, configurable: true } });
    fireEvent.scroll(content);
    await waitFor(() => expect(screen.getByText("Показано 25 із 25")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Пошук за назвою, районом, БРО або екіпажем…"), { target: { value: "ПОЗИЦІЯ 25" } });
    expect(screen.getByText("ПОЗИЦІЯ 25")).toBeInTheDocument();
    expect(screen.getByText("Показано 1 із 1")).toBeInTheDocument();
  });

  it("показує екіпажі окремими записами та автоматично збирає майно екіпажу на позиції", async () => {
    localStorage.setItem("flight-plan-draft-v2", JSON.stringify({ selected: [9] }));
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_incidents") return Promise.resolve([]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [linkedEquipment] : args?.category === "generator" ? [availableEquipment] : []);
      if (command === "list_vehicles") return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    fireEvent.click((await screen.findByText("БУРЕВІЙ")).closest("article")!);
    fireEvent.click(screen.getByRole("button", { name: "Екіпажі і майно" }));
    expect(screen.getByText("Статус: Працюючий")).toBeInTheDocument();
    expect(screen.getByText("Основний БпЛА: SHARK · Смуга: СМУГА ПІВНІЧ")).toBeInTheDocument();
    expect(screen.getByText("Майно на позиції")).toBeInTheDocument();
    expect(screen.getByText("UAV-008 · Справний · 1 шт")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Генератори: 1" }));
    expect(screen.getByText("EcoFlow Delta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Додати майно" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Зберегти позицію" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_position", expect.objectContaining({ positionId: 3, draft: expect.objectContaining({ uavIds: [] }) })));
  });
});
