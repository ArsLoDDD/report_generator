import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deadlineReminderService } from "../../features/settings/services/deadlineReminderService";
import { DeadlineReminderNotifications } from "./DeadlineReminderNotifications";

vi.mock("../../features/settings/services/deadlineReminderService", () => ({
  deadlineReminderService: { listNotifications: vi.fn(), acknowledgeNotification: vi.fn() },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("DeadlineReminderNotifications", () => {
  it("stays visible until the user acknowledges it with the ++ button", async () => {
    vi.mocked(deadlineReminderService.listNotifications).mockResolvedValue([{ reminder: { id: 4, description: "Відправити відповідь", dueAt: "2026-09-27T12:00", status: "active", createdAt: "", updatedAt: "" }, slot: "last-hour-2", cadenceMinutes: 10, overdue: false }]);
    vi.mocked(deadlineReminderService.acknowledgeNotification).mockResolvedValue();
    render(<DeadlineReminderNotifications />);
    expect(await screen.findByText("Відправити відповідь")).toBeInTheDocument();
    expect(screen.getByText("Відправити відповідь")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Підтвердити нагадування №4" }));
    await waitFor(() => expect(deadlineReminderService.acknowledgeNotification).toHaveBeenCalledWith(4, "last-hour-2"));
    expect(screen.queryByText("Відправити відповідь")).not.toBeInTheDocument();
  });
});
