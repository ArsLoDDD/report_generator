import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import type { Person } from "../../shared/types/domain";
import { VehiclesPage } from "./VehiclesPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const driver: Person = {
  id: 7, fullName: "ІВАНЕНКО Іван Петрович", rank: "Солдат", surname: "ІВАНЕНКО", givenName: "Іван", patronymic: "Петрович",
  position: "Водій", taxId: "1234567890", birthDate: "", educationLevel: "", educationDetails: "", armedForcesServiceStartDate: "",
  positionAssignedDate: "", positionAssignmentOrder: "", militaryId: "", assignedVehicleName: "", assignedVehicleRegistration: ""
};
const vehicle = { id: 4, name: "Toyota Hilux", registrationNumber: "АА 1234 АА", status: "Справний", personnelId: 7, driverName: "ІВАНЕНКО Іван Петрович" };

function renderPage() {
  invoke.mockImplementation((command: string) => {
    if (command === "list_vehicles") return Promise.resolve([vehicle]);
    return Promise.resolve();
  });
  return render(<NotificationProvider><VehiclesPage people={[driver]} /></NotificationProvider>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("VehiclesPage", () => {
  it("shows the connected driver as a fact and opens reassignment separately", async () => {
    renderPage();
    expect(await screen.findByRole("columnheader", { name: "№" })).toBeInTheDocument();
    expect(screen.getByText("4", { selector: ".personnel-id" })).toBeInTheDocument();
    expect(await screen.findByText(driver.fullName)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Toyota Hilux"));
    expect(screen.getAllByText(driver.fullName)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Перезакріпити" }));
    expect(screen.getByRole("dialog", { name: "Перезакріпити автомобіль" })).toBeInTheDocument();
    expect(screen.getByLabelText("Водій автомобіля")).toHaveValue("7");
  });

  it("opens a filter with vehicle-specific filters and column visibility", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Додаткові фільтри" }));
    const dialog = screen.getByRole("dialog", { name: "Фільтр і видимість колонок" });
    expect(within(dialog).getByLabelText("Фільтр за станом")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Фільтр за водієм")).toBeInTheDocument();
    expect(within(dialog).getByText("Автомобіль")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Номер" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_visible_vehicle_columns", expect.objectContaining({ columns: expect.any(Array) })));
  });

  it("creates a vehicle with the personnel-style editor", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Додати автомобіль" }));
    fireEvent.change(screen.getByPlaceholderText("Наприклад, Toyota Hilux"), { target: { value: "Ford Ranger" } });
    fireEvent.change(screen.getByPlaceholderText("Наприклад, АА 1234 АА"), { target: { value: "КА 9999 КА" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "Новий автомобіль" })).getByRole("button", { name: "Додати автомобіль" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_vehicle", expect.objectContaining({ name: "Ford Ranger", registrationNumber: "КА 9999 КА" })));
  });
});
