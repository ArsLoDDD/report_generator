import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "../../../shared/types/domain";
import { NotificationProvider } from "../../../shared/ui/NotificationProvider";
import type { PersonnelControlHistoryEvent, PersonnelControlRecord } from "../types";
import { PersonnelControl } from "./PersonnelControl";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const person: Person = {
  id: 1,
  fullName: "ТЕСТОВИЙ Тест Тестович",
  rank: "солдат",
  surname: "ТЕСТОВИЙ",
  givenName: "Тест",
  patronymic: "Тестович",
  position: "оператор",
  taxId: "1",
  birthDate: "",
  educationLevel: "",
  educationDetails: "",
  armedForcesServiceStartDate: "",
  positionAssignedDate: "",
  positionAssignmentOrder: "",
  militaryId: "",
  assignedVehicleName: "",
  assignedVehicleRegistration: "",
};

const automatic: PersonnelControlRecord = {
  personnelId: 1,
  fullName: person.fullName,
  rank: person.rank,
  position: person.position,
  tab: "На позиції",
  locationType: "ЗБЗ",
  source: "automatic",
  sourceLabel: "План польотів",
  canEdit: false,
  assignmentId: null,
  institution: "",
  startDate: "2026-09-17",
  endDate: "",
  untilSeparateOrder: false,
  notes: "",
  crewId: 3,
  crewName: "СОКІЛ",
  positionId: 2,
  positionName: "ОРІОН",
  workId: null,
  workType: "",
  updatedAt: "2026-09-17T12:00:00",
};

const manual: PersonnelControlRecord = {
  ...automatic,
  tab: "ВІДР",
  locationType: "ВІДР",
  source: "manual",
  sourceLabel: "Контроль особового складу",
  canEdit: true,
  assignmentId: 8,
  institution: "Навчальний центр",
  untilSeparateOrder: true,
  crewId: null,
  crewName: "",
  positionId: null,
  positionName: "",
};

function renderControl(records = [automatic, manual], history: PersonnelControlHistoryEvent[] = []) {
  invoke.mockImplementation((command: string) => {
    if (command === "list_personnel_control_records") return Promise.resolve(records);
    if (command === "list_personnel_control_history") return Promise.resolve(history);
    return Promise.resolve(undefined);
  });
  render(<NotificationProvider><PersonnelControl people={[person]} hasMorePeople={false} onLoadMorePeople={vi.fn(async () => undefined)} /></NotificationProvider>);
}

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

describe("PersonnelControl", () => {
  it("groups automatic position states while preserving the exact state in the row", async () => {
    renderControl();
    expect(await screen.findByText("ЗБЗ")).toBeInTheDocument();
    expect(screen.getByText("вкладка «На позиції»")).toBeInTheDocument();
    expect(screen.getByText("План польотів")).toBeInTheDocument();
    const automaticRow = screen.getByText("ЗБЗ").closest("tr");
    expect(automaticRow).not.toBeNull();
    if (!automaticRow) throw new Error("Automatic personnel row is missing");
    expect(within(automaticRow).queryByRole("button", { name: `Редагувати ${person.fullName}` })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /На позиції\s*1/u }));
    expect(screen.getByText("ОРІОН")).toBeInTheDocument();
    expect(screen.queryByText("Навчальний центр")).not.toBeInTheDocument();
  });

  it("creates an open-ended business trip through the custom selects", async () => {
    renderControl([]);
    fireEvent.click(await screen.findByRole("button", { name: "Додати місце перебування" }));
    fireEvent.change(screen.getByLabelText("Військовослужбовець"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Тип перебування"), { target: { value: "ВІДР" } });
    fireEvent.change(screen.getByLabelText("Місце / установа відрядження"), { target: { value: "Центр підготовки" } });
    fireEvent.change(screen.getByLabelText("З якого числа"), { target: { value: "2026-09-17" } });
    expect(screen.getByText("Без дати — до окремого розпорядження.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("save_personnel_control_assignment", {
      assignmentId: null,
      draft: { personnelId: 1, locationType: "ВІДР", institution: "Центр підготовки", startDate: "2026-09-17", endDate: "", notes: "" },
    }));
  });

  it("does not save training without its required completion date", async () => {
    renderControl([]);
    fireEvent.click(await screen.findByRole("button", { name: "Додати місце перебування" }));
    fireEvent.change(screen.getByLabelText("Військовослужбовець"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Навчальний заклад"), { target: { value: "Центр підготовки" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(await screen.findByText("Для навчання вкажіть дату завершення.")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("save_personnel_control_assignment", expect.anything());
  });

  it("does not offer a person whose location is controlled automatically", async () => {
    renderControl([automatic]);
    fireEvent.click(await screen.findByRole("button", { name: "Додати місце перебування" }));
    expect(screen.getByLabelText("Військовослужбовець")).toBeDisabled();
    expect(screen.getByText("Люди з автоматичним бойовим станом або активним ручним записом недоступні.")).toBeInTheDocument();
  });

  it("closes a manual record instead of deleting its history", async () => {
    renderControl([manual]);
    fireEvent.click(await screen.findByRole("button", { name: `Завершити ${person.fullName}` }));
    const dialog = screen.getByRole("dialog", { name: "Завершити перебування?" });
    fireEvent.change(within(dialog).getByLabelText("Дата завершення"), { target: { value: "2026-09-17" } });
    fireEvent.change(within(dialog).getByLabelText("Підстава завершення"), { target: { value: "Повернувся" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Завершити" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("close_personnel_control_assignment", { assignmentId: 8, endDate: "2026-09-17", reason: "Повернувся" }));
  });

  it("shows the persistent history of manual assignment changes", async () => {
    renderControl([], [{ id: 4, assignmentId: 8, personnelId: 1, fullName: person.fullName, action: "migrated", locationType: "ВІДР", institution: "Центр підготовки", startDate: "2026-09-17", endDate: "2026-09-19", notes: "Планове відрядження", reason: "Повернувся", occurredAt: "2026-09-19T10:30:00" }]);
    fireEvent.click(await screen.findByRole("button", { name: "Історія" }));
    expect(await screen.findByText("Перенесено зі старої бази")).toBeInTheDocument();
    expect(screen.getByText("Центр підготовки")).toBeInTheDocument();
    expect(screen.getByText("Повернувся · Планове відрядження")).toBeInTheDocument();
    expect(screen.getByText("19.09.2026 10:30")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("list_personnel_control_history", { personnelId: null });
  });
});
