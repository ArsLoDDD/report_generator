import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageTitle } from "./PageTitle";
import { NotificationProvider } from "./NotificationProvider";

const { service } = vi.hoisted(() => ({ service: {
  listCustomFields: vi.fn(), createCustomField: vi.fn(), updateCustomField: vi.fn(), deleteCustomField: vi.fn()
} }));
vi.mock("../services/personnelService", () => ({ personnelService: service }));

function renderTitle() {
  service.listCustomFields.mockResolvedValue([{ fieldKey: "unit_name", displayName: "Підрозділ", description: "Назва", initialValue: "А0000" }]);
  render(<NotificationProvider><PageTitle title="Особовий склад" subtitle="Облік" actions={<button>Дія</button>} /></NotificationProvider>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Редактор кастомних полів", () => {
  it("opens as a dedicated editor and closes on backdrop click", async () => {
    renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "Редактор кастомних полів" }));
    expect(await screen.findByRole("dialog", { name: "Редактор кастомних полів" })).toBeInTheDocument();
    expect(screen.getByText("Підрозділ")).toBeInTheDocument();
    fireEvent.mouseDown(document.querySelector(".modal-backdrop")!);
    expect(screen.queryByRole("dialog", { name: "Редактор кастомних полів" })).not.toBeInTheDocument();
  });

  it("validates the field form before a request", async () => {
    renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "Редактор кастомних полів" }));
    fireEvent.click(await screen.findByRole("button", { name: "Створити поле" }));
    fireEvent.click(screen.getByRole("button", { name: "Зберегти поле" }));
    expect(await screen.findByText(/Ключ поля має починатися/)).toBeInTheDocument();
    expect(service.createCustomField).not.toHaveBeenCalled();
  });

  it("creates, edits and deletes fields through the service", async () => {
    service.createCustomField.mockResolvedValue({ fieldKey: "unit_code", displayName: "Код", description: "", initialValue: "A1" });
    service.updateCustomField.mockResolvedValue({ fieldKey: "unit_name", displayName: "Назва", description: "Опис", initialValue: "A2" });
    service.deleteCustomField.mockResolvedValue(undefined);
    renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "Редактор кастомних полів" }));
    fireEvent.click(await screen.findByRole("button", { name: "Створити поле" }));
    fireEvent.change(screen.getByLabelText("Ключ поля"), { target: { value: "unit_code" } });
    fireEvent.change(screen.getByLabelText("Українська назва"), { target: { value: "Код" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти поле" }));
    await waitFor(() => expect(service.createCustomField).toHaveBeenCalledWith(expect.objectContaining({ fieldKey: "unit_code", displayName: "Код" })));
    fireEvent.click(screen.getAllByRole("button", { name: "Редагувати" })[0]);
    fireEvent.change(screen.getByLabelText("Українська назва"), { target: { value: "Назва" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти поле" }));
    await waitFor(() => expect(service.updateCustomField).toHaveBeenCalledWith(expect.objectContaining({ fieldKey: "unit_name", displayName: "Назва" })));
    fireEvent.click(screen.getAllByRole("button", { name: "Видалити" })[0]);
    await waitFor(() => expect(service.deleteCustomField).toHaveBeenCalledWith("unit_name"));
  });
});
