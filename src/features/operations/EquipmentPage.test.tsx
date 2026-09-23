import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { EquipmentPage } from "./EquipmentPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const generator = { id: 17, category: "generator", name: "GENPOWER 3.5", inventoryNumber: "Г-001", status: "Справний", crewId: 4, crewName: "БАРС", personnelId: null, holderName: null, notes: "Основний" };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("EquipmentPage", () => {
  it("opens a shared details panel by clicking an equipment row", async () => {
    invoke.mockImplementation((command: string) => command === "list_equipment" ? Promise.resolve([generator]) : command === "list_crews" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><EquipmentPage category="generator" people={[]} /></NotificationProvider>);

    fireEvent.click(await screen.findByText(generator.name));
    expect(screen.getByText("Деталі: генератор")).toBeInTheDocument();
    expect(screen.getAllByText(generator.crewName)).toHaveLength(2);
    expect(screen.getAllByText("Основний")).toHaveLength(2);
  });

  it("deletes equipment only after confirmation", async () => {
    invoke.mockImplementation((command: string) => command === "list_equipment" ? Promise.resolve([generator]) : command === "list_crews" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><EquipmentPage category="generator" people={[]} /></NotificationProvider>);
    fireEvent.click(await screen.findByText(generator.name));
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));

    expect(invoke).not.toHaveBeenCalledWith("delete_equipment", expect.anything());
    const dialog = screen.getByRole("dialog", { name: "Видалити генератор?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Видалити" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("delete_equipment", { equipmentId: 17 }));
  });

  it("edits an existing equipment record from its details panel", async () => {
    invoke.mockImplementation((command: string) => command === "list_equipment" ? Promise.resolve([generator]) : command === "list_crews" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><EquipmentPage category="generator" people={[]} /></NotificationProvider>);
    fireEvent.click(await screen.findByText(generator.name));
    fireEvent.click(screen.getByRole("button", { name: "Редагувати" }));

    const dialog = screen.getByRole("dialog", { name: "Редагування: генератор" });
    const name = within(dialog).getByDisplayValue(generator.name);
    fireEvent.change(name, { target: { value: "GENPOWER 4.0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Зберегти" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_equipment", expect.objectContaining({
      equipmentId: 17,
      draft: expect.objectContaining({ name: "GENPOWER 4.0" }),
    })));
  });

  it("uses a compact structured editor for generators", async () => {
    invoke.mockImplementation((command: string) => command === "list_equipment" || command === "list_crews" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><EquipmentPage category="generator" people={[]} /></NotificationProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    const dialog = screen.getByRole("dialog", { name: "Новий генератор" });
    expect(dialog).toHaveClass("asset-editor--compact");
    expect(within(dialog).getByText("Основні дані")).toBeInTheDocument();
    expect(within(dialog).getByText("Облік і закріплення")).toBeInTheDocument();
    expect(within(dialog).getByText("Примітка")).toBeInTheDocument();
  });

  it("selects the weapon accounting type from the shared dropdown", async () => {
    invoke.mockImplementation((command: string) => command === "list_equipment" || command === "list_crews" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><EquipmentPage category="weapon_ammo" people={[]} /></NotificationProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    const dialog = screen.getByRole("dialog", { name: "Новий запис" });
    expect(within(dialog).getByRole("combobox", { name: "Тип обліку зброї та БК" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Зброя" })).not.toBeInTheDocument();
  });
});
