import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoFillFieldPicker } from "./DocumentationPage";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";

const { personnelService, settingsService } = vi.hoisted(() => ({
  personnelService: { listCustomFields: vi.fn(), listVehicleCustomFields: vi.fn() },
  settingsService: { get: vi.fn() },
}));
vi.mock("../../shared/services/personnelService", () => ({ personnelService }));
vi.mock("../settings/services/settingsService", () => ({ settingsService }));

beforeEach(() => {
  personnelService.listCustomFields.mockResolvedValue([]);
  personnelService.listVehicleCustomFields.mockResolvedValue([]);
  settingsService.get.mockResolvedValue({ signerRoles: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const renderPicker = (props: Parameters<typeof AutoFillFieldPicker>[0] = {}) => render(<NotificationProvider><AutoFillFieldPicker {...props} /></NotificationProvider>);

describe("Поля автозаповнення", () => {
  it("starts with search and human data sources without exposing a technical token", () => {
    renderPicker();
    expect(screen.getByRole("heading", { name: "Які дані мають бути тут?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Наприклад: ПІБ, звання, дата рапорту…" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /З обліку/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Запитати під час створення/ })).toBeInTheDocument();
    expect(screen.getByText("Оберіть потрібне поле")).toBeInTheDocument();
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
  });

  it("filters manual values and reveals the raw token only under Advanced", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("tab", { name: /Запитати під час створення/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Наприклад/ }), { target: { value: "дата рапорту" } });
    fireEvent.click(screen.getByRole("button", { name: "Дата рапорту, Заповнюється перед генерацією" }));
    expect(screen.getByText("{{дата_рапорту}}").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Додатково: технічний код"));
    expect(screen.getByText("{{дата_рапорту}}").closest("details")).toHaveAttribute("open");
  });

  it("uses a human order control and compatible modifiers", () => {
    renderPicker();
    fireEvent.change(screen.getByRole("textbox", { name: /Наприклад/ }), { target: { value: "ПІБ" } });
    fireEvent.click(screen.getByRole("button", { name: "ПІБ, Військовослужбовець" }));
    fireEvent.change(screen.getByLabelText("Номер вибраного об’єкта"), { target: { value: "2" } });
    fireEvent.click(screen.getByLabelText("Родовий"));
    fireEvent.click(screen.getByLabelText("Жирним"));
    fireEvent.click(screen.getByText("Додатково: технічний код"));
    expect(screen.getByText("{{військовий_2_піб:родовий:жирним}}")).toBeInTheDocument();
  });

  it("includes stable custom fields under accounting instead of making them subjects", async () => {
    personnelService.listCustomFields.mockResolvedValue([{ fieldKey: "unit_code", displayName: "Код підрозділу", description: "Код", initialValue: "А0000" }]);
    renderPicker();
    fireEvent.change(screen.getByRole("textbox", { name: /Наприклад/ }), { target: { value: "Код підрозділу" } });
    const field = await screen.findByRole("button", { name: "Код підрозділу, Військовослужбовець" });
    fireEvent.click(field);
    fireEvent.click(screen.getByText("Додатково: технічний код"));
    expect(screen.getByText("{{військовий_1_custom_unit_code}}")).toBeInTheDocument();
  });

  it("returns the finished token directly when used for a selected analyser fragment", () => {
    const onApply = vi.fn();
    renderPicker({ mode: "apply", onApply });
    fireEvent.change(screen.getByRole("textbox", { name: /Наприклад/ }), { target: { value: "звання" } });
    fireEvent.click(screen.getByRole("button", { name: "Звання, Військовослужбовець" }));
    fireEvent.click(screen.getByRole("button", { name: "Замінити виділений текст" }));
    expect(onApply).toHaveBeenCalledWith("{{військовий_1_звання}}");
  });

  it("keeps copy mode available from Templates", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderPicker();
    fireEvent.change(screen.getByRole("textbox", { name: /Наприклад/ }), { target: { value: "звання" } });
    fireEvent.click(screen.getByRole("button", { name: "Звання, Військовослужбовець" }));
    fireEvent.click(screen.getByRole("button", { name: "Скопіювати поле" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("{{військовий_1_звання}}"));
    expect(await screen.findByText("Поле автозаповнення скопійовано.")).toBeInTheDocument();
  });
});
