import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Person, PersonnelDraft } from "../../shared/types/domain";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { PersonnelPage } from "./PersonnelPage";

const person: Person = {
  id: 1, fullName: "ВАСИЛЬОК Іван Аркадійович", rank: "Солдат", surname: "ВАСИЛЬОК", givenName: "Іван", patronymic: "Аркадійович",
  position: "Стрілець, військова частина А0000", taxId: "7462389812", birthDate: "02.03.1999 року", educationLevel: "вища",
  educationDetails: "Львівська комерційна академія у 2002р", armedForcesServiceStartDate: "у ЗС — із 27.02.2022 року",
  positionAssignedDate: "02.08.2026 року", positionAssignmentOrder: "КВ ОК «Пуп» №000-ПС", militaryId: "АВ №077672",
  assignedVehicleName: "Great Wall", assignedVehicleRegistration: "АВ 7265"
};

function renderPage(overrides: Partial<Parameters<typeof PersonnelPage>[0]> = {}) {
  const props: Parameters<typeof PersonnelPage>[0] = {
    people: [person], totalCount: 1, hasMore: false, isLoading: false, isLoadingMore: false, errorMessage: null, onCreate: vi.fn(async (draft: PersonnelDraft) => ({ ...draft, id: 2, fullName: `${draft.surname} ${draft.givenName} ${draft.patronymic}` })),
    onUpdate: vi.fn(async (_id, draft) => ({ ...draft, id: 1, fullName: `${draft.surname} ${draft.givenName} ${draft.patronymic}` })),
    onDelete: vi.fn(async () => undefined), onRefresh: vi.fn(async () => undefined), onLoadMore: vi.fn(async () => undefined), ...overrides
  };
  render(<NotificationProvider><PersonnelPage {...props} /></NotificationProvider>);
  return props;
}

afterEach(cleanup);

describe("PersonnelPage CRUD", () => {
  it("renders every approved database field as a table column", () => {
    renderPage();
    ["Звання", "Прізвище", "Ім’я", "По батькові", "Посада", "ІПН", "Дата народження", "Формат освіти", "Де отримана освіта", "У ЗСУ з", "Дата призначення", "Наказ про призначення", "Військовий квиток", "Автомобіль", "Номер автомобіля"].forEach((name) => expect(screen.getByRole("columnheader", { name })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Імпорт" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Експорт" })).not.toBeInTheDocument();
  });

  it("highlights personnel records with missing fields", () => {
    renderPage({ people: [{ ...person, educationDetails: "" }] });
    expect(screen.getByTitle("Неповні дані")).toBeInTheDocument();
  });

  it("creates a person through the shared editor form", async () => {
    const props = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Додати військовослужбовця" }));
    fireEvent.change(screen.getByLabelText(/Звання/), { target: { value: "Сержант" } });
    fireEvent.change(screen.getByLabelText(/Прізвище/), { target: { value: "НОВИЙ" } });
    fireEvent.change(screen.getByLabelText(/^Ім’я/), { target: { value: "Петро" } });
    fireEvent.change(screen.getByLabelText(/Посада/), { target: { value: "Командир" } });
    fireEvent.change(screen.getByPlaceholderText("7462389812"), { target: { value: "1234567890" } });
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({ surname: "НОВИЙ", taxId: "1234567890" })));
  });

  it("updates and deletes the selected database record", async () => {
    const props = renderPage();
    fireEvent.click(screen.getByRole("button", { name: `Редагувати ${person.fullName}` }));
    fireEvent.change(screen.getByLabelText(/Посада/), { target: { value: "Командир відділення" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти зміни" }));
    await waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(1, expect.objectContaining({ position: "Командир відділення" })));
    fireEvent.click(screen.getByRole("button", { name: `Видалити ${person.fullName}` }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Видалити запис?" })).getByRole("button", { name: "Видалити" }));
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith(1));
  });
});
