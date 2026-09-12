import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { PositionsPage } from "./PositionsPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const position = { id: 3, name: "БУРЕВІЙ", positionType: "Запасна", stripName: "СМУГА ПІВНІЧ", locality: "НОВОСЕЛІВКА", battleOrder: "БРО-01", sector: "", condition: "", conditionLevel: 0, fieldType: "", size: "", mgrs: "36U UV 12000 67000", suitableUavText: "", isActive: false, crewId: null, crewName: "СОКІЛ", notes: "Тестова позиція", uavIds: [8], uavNames: ["SHARK"] };
const crew = { id: 9, name: "СОКІЛ", positionId: 3 };

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
  });
});
