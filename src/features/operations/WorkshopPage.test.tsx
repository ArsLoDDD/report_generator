import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { WorkshopPage } from "./WorkshopPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Цукерня", () => {
  it("списує дробову кількість лише зі складової БК", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "list_workshop_products") return Promise.resolve([]);
      if (command === "list_equipment") return Promise.resolve([{ id: 7, category: "weapon_ammo", name: "Складова", inventoryNumber: "MAT-7", status: "Справний", crewId: null, crewName: null, personnelId: 4, holderName: "Іваненко Іван", totalQuantity: 1, dayQuantity: 1, nightQuantity: 0, assetKind: "aircraft", componentsJson: "", assignedQuantity: 0, weaponKind: "component", measurementUnit: "кг", stockQuantity: 0.8, notes: "" }]);
      return Promise.resolve();
    });
    render(<NotificationProvider><WorkshopPage /></NotificationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Виготовити" }));
    fireEvent.change(screen.getByLabelText(/Назва виробу/), { target: { value: "Виріб №1" } });
    fireEvent.change(screen.getByLabelText("Матеріал 1"), { target: { value: "7" } });
    const materialQuantity = screen.getByLabelText("Кількість матеріалу 1");
    fireEvent.change(materialQuantity, { target: { value: "0" } });
    fireEvent.change(materialQuantity, { target: { value: "0.2" } });
    expect(materialQuantity).toHaveValue(0.2);
    fireEvent.click(screen.getByRole("button", { name: "Зберегти виготовлення" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_workshop_product", { draft: expect.objectContaining({ name: "Виріб №1", accountedAt: "", ingredients: [{ equipmentId: 7, equipmentName: "Складова", quantity: 0.2, measurementUnit: "кг" }] }) }));
  });
});
