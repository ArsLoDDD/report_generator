import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VariableConstructorPage } from "./DocumentationPage";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";

const { personnelService } = vi.hoisted(() => ({ personnelService: { listCustomFields: vi.fn(), listPersonnelFields: vi.fn(), listVehicleCustomFields: vi.fn() } }));
vi.mock("../../shared/services/personnelService", () => ({ personnelService }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Конструктор змінних", () => {
  it("offers a vehicle as a separate subject and includes its standard fields", async () => {
    personnelService.listCustomFields.mockResolvedValue([]); personnelService.listVehicleCustomFields.mockResolvedValue([]);
    render(<NotificationProvider><VariableConstructorPage /></NotificationProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Автомобіль/ }));
    expect(await screen.findByRole("button", { name: /\{\{автомобіль_назва\}\}/ })).toBeInTheDocument();
  });
  it("keeps the signer field the user selected instead of returning to surname", async () => {
    personnelService.listCustomFields.mockResolvedValue([]);
    personnelService.listPersonnelFields.mockResolvedValue([]);
    render(<NotificationProvider><VariableConstructorPage /></NotificationProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Основний підписант/ }));
    fireEvent.click(await screen.findByRole("button", { name: /\{\{основний_підписант_посада\}\}/ }));
    expect(screen.getByText("Токен для Word").parentElement).toHaveTextContent("{{основний_підписант_посада}}");
    expect(screen.getByRole("heading", { name: "Посада" })).toBeInTheDocument();
  });

  it("treats a custom field as a value of a servicemember, never as a subject", async () => {
    personnelService.listCustomFields.mockResolvedValue([{ fieldKey: "unit_code", displayName: "Код підрозділу", description: "Код", initialValue: "А0000" }]);
    personnelService.listPersonnelFields.mockResolvedValue([]);
    render(<NotificationProvider><VariableConstructorPage /></NotificationProvider>);
    await screen.findByRole("button", { name: /Військовослужбовець/ });
    expect(screen.queryByRole("button", { name: /Кастомне поле: Код підрозділу/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Кастомна змінна" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Військовослужбовець/ }));
    expect(await screen.findByRole("button", { name: /\{\{військовий_1_код_підрозділу\}\}/ })).toBeInTheDocument();
  });

  it("allows exactly one grammatical case while text and Word modifiers remain combinable", async () => {
    personnelService.listCustomFields.mockResolvedValue([]);
    personnelService.listPersonnelFields.mockResolvedValue([]);
    render(<NotificationProvider><VariableConstructorPage /></NotificationProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Військовослужбовець/ }));
    fireEvent.click(await screen.findByRole("button", { name: /\{\{військовий_1_піб\}\}/ }));
    fireEvent.click(screen.getByLabelText("Родовий"));
    fireEvent.click(screen.getByLabelText("Орудний"));
    fireEvent.click(screen.getByLabelText("Великими літерами"));
    fireEvent.click(screen.getByLabelText("Жирним"));
    expect(screen.getByLabelText("Родовий")).not.toBeChecked();
    expect(screen.getByLabelText("Орудний")).toBeChecked();
    expect(screen.getByLabelText("Великими літерами")).toBeChecked();
    expect(screen.getByLabelText("Жирним")).toBeChecked();
  });
});
