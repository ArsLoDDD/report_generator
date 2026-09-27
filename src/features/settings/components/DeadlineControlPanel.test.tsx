import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../../shared/ui/NotificationProvider";
import { deadlineReminderService } from "../services/deadlineReminderService";
import { DeadlineControlPanel } from "./DeadlineControlPanel";

vi.mock("../services/deadlineReminderService", () => ({
  deadlineReminderService: { list: vi.fn(), save: vi.fn(), complete: vi.fn(), delete: vi.fn() },
}));

const active = { id: 7, description: "Надіслати відповідь", dueAt: "2026-09-29T12:00", status: "active" as const, createdAt: "2026-09-27 10:00:00", updatedAt: "2026-09-27 10:00:00" };
const completed = { ...active, id: 6, status: "completed" as const, completedAt: "2026-09-27 11:00:00" };

beforeEach(() => {
  vi.mocked(deadlineReminderService.list).mockResolvedValue([active, completed]);
  vi.mocked(deadlineReminderService.complete).mockResolvedValue();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("DeadlineControlPanel", () => {
  it("moves an active item to history only after confirmation", async () => {
    render(<NotificationProvider><DeadlineControlPanel /></NotificationProvider>);
    expect(await screen.findByText("Надіслати відповідь")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Виконати запис №7" }));
    expect(screen.getByRole("dialog", { name: "Позначити виконаним?" })).toBeInTheDocument();
    expect(deadlineReminderService.complete).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Виконано" });
    expect(confirm).toHaveClass("primary");
    expect(confirm).not.toHaveClass("danger");
    fireEvent.click(confirm);
    await waitFor(() => expect(deadlineReminderService.complete).toHaveBeenCalledWith(7));
  });

  it("does not allow a deadline date before today", async () => {
    render(<NotificationProvider><DeadlineControlPanel /></NotificationProvider>);
    await screen.findByText("Надіслати відповідь");
    fireEvent.click(screen.getByRole("button", { name: "Додати строк" }));
    fireEvent.change(screen.getByLabelText("Опис"), { target: { value: "Перевірити дату" } });
    const dateInput = screen.getByLabelText("Дата та час дедлайну");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    fireEvent.change(dateInput, { target: { value: `${date}T12:00` } });
    expect(dateInput.getAttribute("min")).toMatch(/^\d{4}-\d{2}-\d{2}T00:00$/u);
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
  });

  it("shows completed items in a separate history view", async () => {
    render(<NotificationProvider><DeadlineControlPanel /></NotificationProvider>);
    await screen.findByText("Надіслати відповідь");
    fireEvent.click(screen.getByRole("button", { name: /Історія/ }));
    expect(screen.getByText("#6")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Виконати запис №6" })).not.toBeInTheDocument();
  });
});
