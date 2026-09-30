import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { IncidentsPage } from "./IncidentsPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const people = [
  { id: 1, fullName: "ІВАНЕНКО Іван Іванович", rank: "солдат", position: "Оператор" },
  { id: 2, fullName: "ПЕТРЕНКО Петро Петрович", rank: "сержант", position: "Командир" },
  { id: 3, fullName: "КОВАЛЕНКО Марія Олегівна", rank: "старший солдат", position: "Медик" },
].map((item) => ({
  ...item,
  surname: item.fullName.split(" ")[0],
  givenName: item.fullName.split(" ")[1],
  patronymic: item.fullName.split(" ")[2],
  taxId: "",
  birthDate: "",
  educationLevel: "",
  educationDetails: "",
  armedForcesServiceStartDate: "",
  positionAssignedDate: "",
  positionAssignmentOrder: "",
  militaryId: "",
  assignedVehicleName: "",
  assignedVehicleRegistration: "",
}));

const crew = {
  id: 4,
  name: "ГРІМ",
  positionId: 2,
  positionName: "ХИЖАК",
  reconnaissanceArea: "СТЕПОВЕ",
  members: people.map((item) => ({ personnelId: item.id, fullName: item.fullName, rank: item.rank, position: item.position, callsign: "" })),
  actualMembers: people.map((item) => ({ personnelId: item.id, fullName: item.fullName, rank: item.rank, position: item.position, callsign: "" })),
};

const position = { id: 2, name: "ХИЖАК", locality: "СЕЛО", mgrs: "36U AA 12345 67890" };

const asset = (id: number, name: string, category = "uav", crewId: number | null = 4) => ({
  id,
  category,
  name,
  inventoryNumber: `INV-${id}`,
  status: "Справний",
  crewId,
  crewName: crewId ? "ГРІМ" : null,
  personnelId: null,
  holderName: null,
  totalQuantity: 1,
  dayQuantity: 1,
  nightQuantity: 0,
  assetKind: "aircraft",
  componentsJson: "[]",
  assignedQuantity: 1,
  weaponKind: "component",
  measurementUnit: "шт.",
  stockQuantity: 1,
  notes: "",
});

const vehicle = {
  id: 15,
  name: "Ford Ranger",
  registrationNumber: "АА 1234 КТ",
  status: "Справний",
  personnelId: 2,
  driverName: "ПЕТРЕНКО Петро Петрович",
  crewId: 4,
  crewName: "ГРІМ",
};

const incident = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  category: "Інше",
  incidentType: `Подія ${id}`,
  customTypeName: "",
  status: "Чернетка",
  occurredAt: "2026-08-18T09:30",
  crewId: null,
  crewName: null,
  equipmentId: null,
  equipmentName: null,
  equipmentIds: [] as number[],
  equipmentNames: [] as string[],
  personnelIds: [1],
  personnelNames: ["ІВАНЕНКО Іван Іванович"],
  positionName: "",
  reconnaissanceArea: "",
  crewSnapshot: "",
  vehicleName: "",
  description: `Опис ${id}`,
  immediateActions: "",
  consequences: "",
  flightStage: "",
  preliminaryCause: "",
  snapshotSource: "current",
  reportedTo: "",
  reportedAt: "",
  sourceFlightId: null,
  vehicleId: null,
  eventData: {},
  archivedAt: "",
  archiveReason: "",
  steps: [],
  documents: [],
  history: [],
  ...overrides,
});

type MockData = {
  incidents?: ReturnType<typeof incident>[];
  archived?: ReturnType<typeof incident>[];
  crews?: unknown[];
  positions?: unknown[];
  flights?: unknown[];
  equipment?: unknown[];
  people?: unknown[];
  vehicles?: unknown[];
  plan?: string | null;
};

function mockData(data: MockData = {}) {
  invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === "list_incidents") return Promise.resolve(data.incidents ?? []);
    if (command === "list_archived_incidents") return Promise.resolve(data.archived ?? []);
    if (command === "list_crews") return Promise.resolve(data.crews ?? []);
    if (command === "list_positions") return Promise.resolve(data.positions ?? []);
    if (command === "list_flight_journal_entries") return Promise.resolve(data.flights ?? []);
    if (command === "list_equipment") return Promise.resolve((data.equipment ?? []).filter((item) => (item as { category?: unknown }).category === args?.category));
    if (command === "list_personnel") return Promise.resolve({ items: data.people ?? [], totalCount: data.people?.length ?? 0 });
    if (command === "list_vehicles") return Promise.resolve(data.vehicles ?? []);
    if (command === "get_flight_plan_snapshot") return Promise.resolve(data.plan ?? null);
    return Promise.resolve();
  });
}

function renderPage() {
  return render(<NotificationProvider><IncidentsPage /></NotificationProvider>);
}

async function openNewIncident() {
  fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
  return screen.getByRole("dialog", { name: "Новий інцидент" });
}

function topDialog() {
  const dialogs = screen.getAllByRole("dialog");
  return dialogs[dialogs.length - 1];
}

async function chooseSearchable(label: string, search: string, option: RegExp | string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.change(screen.getByRole("textbox", { name: `Пошук: ${label}` }), { target: { value: search } });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe("Журнал інцидентів", () => {
  it("використовує окремий компактний перемикач активних та архівних записів", () => {
    mockData();
    renderPage();
    expect(screen.getByRole("navigation", { name: "Стан списку інцидентів" })).toHaveClass("incident-list-tabs");
  });

  it("створює інший інцидент з окремо введених назви, дати й часу", async () => {
    mockData();
    renderPage();
    await openNewIncident();

    fireEvent.change(screen.getByLabelText("Категорія інциденту"), { target: { value: "Інше" } });
    fireEvent.change(screen.getByPlaceholderText("Наприклад, вимушена посадка"), { target: { value: "Вимушена посадка" } });
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-09-12" } });
    fireEvent.change(screen.getByLabelText("Час"), { target: { value: "14:45" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", {
      draft: expect.objectContaining({ category: "Інше", incidentType: "Інший інцидент", customTypeName: "Вимушена посадка", occurredAt: "2026-09-12T14:45" }),
    }));
  });

  it("повторно показує і дозволяє змінити власну назву іншого інциденту", async () => {
    mockData({ incidents: [incident(9, { incidentType: "Інший інцидент", customTypeName: "Несправність генератора" })] });
    renderPage();

    fireEvent.click(await screen.findByText("Несправність генератора"));
    expect(screen.getByRole("heading", { name: /Несправність генератора/u })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Редагувати чернетку" }));
    const name = screen.getByPlaceholderText("Наприклад, вимушена посадка");
    expect(name).toHaveValue("Несправність генератора");
    fireEvent.change(name, { target: { value: "Аварійне відключення генератора" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти зміни" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_incident_draft", {
      incidentId: 9,
      draft: expect.objectContaining({ incidentType: "Інший інцидент", customTypeName: "Аварійне відключення генератора" }),
    }));
  });

  it("для особового складу дає один пошуковий вибір людини, без «Особи події», а у пораненні немає зони ураження", async () => {
    mockData({ people });
    renderPage();
    await openNewIncident();

    fireEvent.change(screen.getByLabelText("Категорія інциденту"), { target: { value: "Особовий склад" } });
    expect(screen.getByLabelText("Тип інциденту")).toHaveValue("Поранення");
    expect(screen.queryByText("Зона ураження")).not.toBeInTheDocument();
    expect(screen.queryByText("Особи події")).not.toBeInTheDocument();

    await chooseSearchable("Військовослужбовець інциденту", "Марія", /КОВАЛЕНКО Марія Олегівна/u);
    expect(screen.getByRole("button", { name: "Військовослужбовець інциденту" })).toHaveTextContent("КОВАЛЕНКО Марія Олегівна");
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", {
      draft: expect.objectContaining({ incidentType: "Поранення", personnelIds: [3] }),
    }));
  });

  it("для травми вимагає двох різних свідків з поясненнями", async () => {
    mockData({ people });
    renderPage();
    await openNewIncident();
    fireEvent.change(screen.getByLabelText("Категорія інциденту"), { target: { value: "Особовий склад" } });
    fireEvent.change(screen.getByLabelText("Тип інциденту"), { target: { value: "Травма" } });
    expect(screen.getByText("Зона травми")).toBeInTheDocument();
    await chooseSearchable("Військовослужбовець інциденту", "Іваненко", /ІВАНЕНКО Іван Іванович/u);

    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));
    expect(await screen.findByText("Додайте щонайменше два пояснення свідків.")).toBeInTheDocument();

    await chooseSearchable("Свідок 1", "Петренко", /ПЕТРЕНКО Петро Петрович/u);
    fireEvent.change(screen.getByLabelText("Пояснення 1"), { target: { value: "Бачив подію" } });
    fireEvent.click(screen.getByRole("button", { name: "Свідок 2" }));
    expect(screen.queryByRole("option", { name: /ПЕТРЕНКО Петро Петрович/u })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Пошук: Свідок 2" }), { target: { value: "Коваленко" } });
    fireEvent.click(screen.getByRole("option", { name: /КОВАЛЕНКО Марія Олегівна/u }));
    fireEvent.change(screen.getByLabelText("Пояснення 2"), { target: { value: "Підтверджую" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", {
      draft: expect.objectContaining({
        incidentType: "Травма",
        personnelIds: [1],
        eventData: expect.objectContaining({ explanations: [
          expect.objectContaining({ personId: 2, text: "Бачив подію" }),
          expect.objectContaining({ personId: 3, text: "Підтверджую" }),
        ] }),
      }),
    }));
  });

  it("для втрати майна показує достовірний контекст лише для читання і дозволяє обрати тільки закріплене майно", async () => {
    const ownUav = asset(8, "MAVIC 3T");
    const ownGenerator = asset(9, "EcoFlow", "generator");
    const foreign = asset(10, "Hytera", "communications", null);
    mockData({ crews: [crew], positions: [position], equipment: [ownUav, ownGenerator, foreign] });
    renderPage();
    await openNewIncident();

    expect(screen.getByRole("button", { name: /Обрати майно/u })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Екіпаж інциденту"), { target: { value: "4" } });
    await waitFor(() => expect(screen.getByText("ХИЖАК")).toBeInTheDocument());
    expect(screen.queryByDisplayValue("ХИЖАК")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Обрати майно/u }));
    const picker = topDialog();
    expect(within(picker).getByText("MAVIC 3T")).toBeInTheDocument();
    expect(within(picker).getByText("EcoFlow")).toBeInTheDocument();
    expect(within(picker).queryByText("Hytera")).not.toBeInTheDocument();
    fireEvent.click(within(picker).getByRole("checkbox", { name: /MAVIC 3T/u }));
    fireEvent.click(within(picker).getByRole("checkbox", { name: /EcoFlow/u }));
    fireEvent.click(within(picker).getByRole("button", { name: "Готово" }));
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", {
      draft: expect.objectContaining({ crewId: 4, positionName: "ХИЖАК", equipmentIds: [8, 9] }),
    }));
  });

  it("блокує дані втрати БпЛА до вибору польоту, а потім показує похідні поля тільки для читання", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-13T10:00:00"));
    const flight = {
      id: 77,
      flightDate: "2026-09-12",
      skyTime: "14:45",
      groundTime: "15:10",
      crewId: 4,
      crewName: "ГРІМ",
      positionId: 2,
      positionName: "АРХІВНА",
      battleOrder: "БРО-2",
      workStrip: "СМУГА",
      uavId: 8,
      uavName: "MAVIC 3T",
      uavType: "Коптер",
      uavSerialNumber: "UAV-8",
      personnelIds: [1, 2, 3],
      mission: "Розвідка",
      payloadType: "БК",
      payloadSerialNumber: "БК-9",
      notes: "",
    };
    mockData({ crews: [crew], positions: [position], flights: [flight], equipment: [asset(8, "MAVIC 3T")], people });
    renderPage();
    await openNewIncident();
    fireEvent.change(screen.getByLabelText("Категорія інциденту"), { target: { value: "БпЛА" } });

    expect(screen.getByText("Спочатку оберіть запис журналу польотів")).toBeInTheDocument();
    expect(screen.getByLabelText("Дата")).toBeDisabled();
    expect(screen.getByLabelText("Час")).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Фактичні дані події" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Екіпаж інциденту")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Запис журналу польотів"), { target: { value: "77" } });
    expect(screen.getByLabelText("Дата")).toHaveValue("2026-09-12");
    expect(screen.getByLabelText("Час")).toHaveValue("14:45");
    expect(screen.getByText("UAV-8 · БК: БК")).toBeInTheDocument();
    expect(screen.getByText("АРХІВНА")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("АРХІВНА")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Фактичні дані події" })).toBeInTheDocument();
  });

  it("для втрати БпЛА залишає тільки польоти останніх 24 годин і вимагає два пояснення", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-28T12:00:00"));
    const flights = [
      { id: 1, flightDate: "2026-09-27", skyTime: "11:59", crewId: 4, crewName: "СТАРИЙ", uavId: 8, uavName: "UAV-1", notes: "" },
      { id: 2, flightDate: "2026-09-27", skyTime: "12:01", crewId: 4, crewName: "АКТУАЛЬНИЙ", positionName: "ХИЖАК", uavId: 8, uavName: "UAV-2", uavSerialNumber: "UAV-2-SN", personnelIds: [1, 2, 3], notes: "" },
    ];
    mockData({
      crews: [crew],
      flights,
      equipment: [asset(8, "UAV-2")],
      people,
      plan: JSON.stringify({ unitName: "РБПАК", entries: [{ crewId: 4, actualMemberIds: [3], positionName: "СТАРИЙ СКЛАД" }] }),
    });
    renderPage();
    await openNewIncident();
    fireEvent.change(screen.getByLabelText("Категорія інциденту"), { target: { value: "БпЛА" } });

    const source = screen.getByLabelText("Запис журналу польотів");
    expect(within(source).queryByRole("option", { name: /СТАРИЙ/u })).not.toBeInTheDocument();
    expect(within(source).getByRole("option", { name: /АКТУАЛЬНИЙ/u })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));
    expect(await screen.findByText("Для втрати БпЛА оберіть запис із журналу польотів.")).toBeInTheDocument();

    fireEvent.change(source, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));
    expect(await screen.findByText("Додайте щонайменше два пояснення свідків.")).toBeInTheDocument();
    await chooseSearchable("Свідок 1", "Іваненко", /ІВАНЕНКО Іван Іванович/u);
    fireEvent.change(screen.getByLabelText("Пояснення 1"), { target: { value: "Перше пояснення" } });
    await chooseSearchable("Свідок 2", "Петренко", /ПЕТРЕНКО Петро Петрович/u);
    fireEvent.change(screen.getByLabelText("Пояснення 2"), { target: { value: "Друге пояснення" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", {
      draft: expect.objectContaining({
        sourceFlightId: 2,
        crewId: 4,
        equipmentIds: [8],
        snapshotSource: "flight-journal",
        eventData: expect.objectContaining({ explanations: expect.arrayContaining([
          expect.objectContaining({ personId: 1, text: "Перше пояснення" }),
          expect.objectContaining({ personId: 2, text: "Друге пояснення" }),
        ]) }),
      }),
    }));
  });

  it("для транспортної події завантажує автомобілі, шукає і зберігає вибраний автомобіль", async () => {
    mockData({ crews: [crew], positions: [position], people, vehicles: [vehicle] });
    renderPage();
    await openNewIncident();
    fireEvent.change(screen.getByLabelText("Категорія інциденту"), { target: { value: "Транспорт" } });

    expect(invoke).toHaveBeenCalledWith("list_vehicles");
    await chooseSearchable("Автомобіль інциденту", "1234", /Ford Ranger/u);
    expect(screen.getByRole("button", { name: "Автомобіль інциденту" })).toHaveTextContent("Ford Ranger");
    expect(screen.getByText("АА 1234 КТ · ПЕТРЕНКО Петро Петрович")).toBeInTheDocument();
    expect(screen.getByText("ХИЖАК")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", {
      draft: expect.objectContaining({
        incidentType: "Знищення машини",
        vehicleId: 15,
        crewId: 4,
        personnelIds: [2],
        eventData: expect.objectContaining({ vehicleName: "Ford Ranger", vehicleRegistrationNumber: "АА 1234 КТ" }),
      }),
    }));
  });

  it("підтверджує зміну стану інциденту і не пропонує повернення назад", async () => {
    mockData({ incidents: [incident(20, { status: "Опрацьовується" })] });
    renderPage();
    fireEvent.click(await screen.findByText("Подія 20"));

    const status = screen.getByLabelText("Стан інциденту");
    expect(within(status).queryByRole("option", { name: "Чернетка" })).not.toBeInTheDocument();
    expect(within(status).queryByRole("option", { name: "Зареєстровано" })).not.toBeInTheDocument();
    expect(within(status).queryByRole("option", { name: "Першочергові дії" })).not.toBeInTheDocument();
    expect(within(status).getByRole("option", { name: "Очікує" })).toBeInTheDocument();
    fireEvent.change(status, { target: { value: "Очікує" } });

    expect(screen.getByRole("heading", { name: "Підтвердити зміну стану інциденту" })).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("update_incident_status", expect.anything());
    fireEvent.click(within(topDialog()).getByRole("button", { name: "Підтвердити" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_incident_status", { incidentId: 20, status: "Очікує", reason: "" }));
  });

  it("перед реєстрацією встигає зберегти останню зміну даних чернетки", async () => {
    mockData({ incidents: [incident(22, { description: "Початковий опис" })] });
    renderPage();
    fireEvent.click(await screen.findByText("Подія 22"));
    fireEvent.click(screen.getByRole("button", { name: "Дані події" }));
    fireEvent.change(screen.getByDisplayValue("Початковий опис"), { target: { value: "Остання правка перед реєстрацією" } });
    fireEvent.click(screen.getByRole("button", { name: "Огляд" }));
    fireEvent.change(screen.getByLabelText("Стан інциденту"), { target: { value: "Зареєстровано" } });
    fireEvent.click(within(topDialog()).getByRole("button", { name: "Підтвердити" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_incident_status", { incidentId: 22, status: "Зареєстровано", reason: "" }));
    const dataCall = invoke.mock.calls.findIndex(([command]) => command === "update_incident_data");
    const statusCall = invoke.mock.calls.findIndex(([command]) => command === "update_incident_status");
    expect(dataCall).toBeGreaterThanOrEqual(0);
    expect(statusCall).toBeGreaterThan(dataCall);
  });

  it("підтверджує forward-only стан кроку, вимагає причину пропуску і має короткий плейсхолдер", async () => {
    const step = { id: 7, order: 1, title: "Першочергове донесення", description: "Подати донесення", required: true, status: "В роботі", dueAt: "2026-09-30T13:00", completedAt: "", comment: "", updatedAt: "" };
    mockData({ incidents: [incident(21, { status: "Зареєстровано", steps: [step] })] });
    renderPage();
    fireEvent.click(await screen.findByText("Подія 21"));
    fireEvent.click(screen.getByRole("button", { name: "Алгоритм" }));

    expect(screen.getByPlaceholderText("Додати коментар…")).toBeInTheDocument();
    const state = screen.getByLabelText("Стан кроку Першочергове донесення");
    expect(within(state).queryByRole("option", { name: "Не розпочато" })).not.toBeInTheDocument();
    fireEvent.change(state, { target: { value: "Пропущено" } });
    const confirmation = topDialog();
    const confirm = within(confirmation).getByRole("button", { name: "Підтвердити" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(confirmation).getByPlaceholderText("Вкажіть причину пропуску"), { target: { value: "Не застосовується" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_incident_step", {
      incidentId: 21,
      stepId: 7,
      status: "Пропущено",
      comment: "Не застосовується",
    }));
  });

  it("дозволяє видалити лише чернетку після підтвердження", async () => {
    mockData({ incidents: [incident(30, { incidentType: "Чернетка для видалення" })] });
    renderPage();
    fireEvent.click(await screen.findByText("Чернетка для видалення"));

    const card = screen.getByRole("dialog");
    expect(within(card).getByRole("button", { name: "Редагувати чернетку" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Видалити" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Архівувати" })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Видалити" }));
    expect(screen.getByRole("heading", { name: "Видалити чернетку?" })).toBeInTheDocument();
    fireEvent.click(within(topDialog()).getByRole("button", { name: "Видалити" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("delete_incident", { incidentId: 30 }));
  });

  it("не видаляє зареєстрований інцидент, а архівує його з обов’язковою причиною", async () => {
    mockData({ incidents: [incident(31, { incidentType: "Зареєстрована подія", status: "Зареєстровано" })] });
    renderPage();
    fireEvent.click(await screen.findByText("Зареєстрована подія"));

    const card = screen.getByRole("dialog");
    expect(within(card).queryByRole("button", { name: "Видалити" })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Архівувати" }));
    const archiveDialog = topDialog();
    fireEvent.change(within(archiveDialog).getByLabelText("Причина архівації"), { target: { value: "Інше" } });
    const confirm = within(archiveDialog).getByRole("button", { name: "Архівувати" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(archiveDialog).getByPlaceholderText("Вкажіть причину"), { target: { value: "Передано до іншого підрозділу" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("archive_incident", { incidentId: 31, reason: "Передано до іншого підрозділу" }));
  });

  it("показує архів окремо лише для читання з причиною", async () => {
    const archived = incident(32, { status: "Завершено", archivedAt: "2026-09-30T10:00", archiveReason: "Опрацювання завершено" });
    mockData({ archived: [archived] });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Архів" }));

    expect(await screen.findByText("Опрацювання завершено")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Додати інцидент" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Подія 32"));
    const card = screen.getByRole("dialog");
    expect(within(card).getByText("Архів · Опрацювання завершено")).toBeInTheDocument();
    expect(within(card).queryByLabelText("Стан інциденту")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Редагувати чернетку" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Архівувати" })).not.toBeInTheDocument();
  });

  it("відкриває повну форму редагування чернетки й зберігає змінені поля", async () => {
    const item = incident(40, {
      category: "Особовий склад",
      incidentType: "Поранення",
      personnelIds: [1],
      personnelNames: [people[0].fullName],
      eventData: { severity: "Легка" },
    });
    mockData({ incidents: [item], people });
    renderPage();
    fireEvent.click(await screen.findByText("Поранення"));
    fireEvent.click(screen.getByRole("button", { name: "Редагувати чернетку" }));

    expect(screen.getByRole("heading", { name: "Редагування чернетки" })).toBeInTheDocument();
    expect(screen.getByLabelText("Категорія інциденту")).toHaveValue("Особовий склад");
    expect(screen.getByLabelText("Тип інциденту")).toHaveValue("Поранення");
    expect(screen.getByRole("button", { name: "Військовослужбовець інциденту" })).toHaveTextContent(people[0].fullName);
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-09-29" } });
    fireEvent.change(screen.getByLabelText("Час"), { target: { value: "18:15" } });
    fireEvent.change(screen.getByDisplayValue("Легка"), { target: { value: "Середня" } });
    fireEvent.change(screen.getByLabelText("Обставини події"), { target: { value: "Уточнені обставини" } });
    await chooseSearchable("Військовослужбовець інциденту", "Петренко", /ПЕТРЕНКО Петро Петрович/u);
    fireEvent.click(screen.getByRole("button", { name: "Зберегти зміни" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_incident_draft", {
      incidentId: 40,
      draft: expect.objectContaining({
        category: "Особовий склад",
        incidentType: "Поранення",
        occurredAt: "2026-09-29T18:15",
        personnelIds: [2],
        description: "Уточнені обставини",
        eventData: expect.objectContaining({ severity: "Середня" }),
      }),
    }));
  });

  it("не показує майно та зайві поля в картці загибелі", async () => {
    const item = incident(41, {
      category: "Особовий склад",
      incidentType: "Загибель",
      status: "Зареєстровано",
      crewId: 4,
      crewName: "ГРІМ",
      equipmentId: 8,
      equipmentName: "VAMPIRE",
      equipmentIds: [8],
      equipmentNames: ["VAMPIRE"],
      personnelIds: [1],
      personnelNames: [people[0].fullName],
    });
    mockData({ incidents: [item], equipment: [asset(8, "VAMPIRE")], crews: [crew] });
    renderPage();
    fireEvent.click(await screen.findByText("Загибель"));
    const card = screen.getByRole("dialog");

    expect(within(card).queryByText("Майно")).not.toBeInTheDocument();
    expect(within(card).queryByText("VAMPIRE")).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Дані події" }));
    expect(within(card).queryByText("Майно")).not.toBeInTheDocument();
    expect(within(card).queryByText("Зона ураження")).not.toBeInTheDocument();
  });

  it("питає підтвердження перед закриттям навіть незміненої нової форми з незаповненими обов’язковими даними", async () => {
    mockData();
    renderPage();
    const editor = await openNewIncident();
    fireEvent.click(within(editor).getByRole("button", { name: "Закрити" }));

    expect(screen.getByRole("heading", { name: "Закрити без створення?" })).toBeInTheDocument();
    fireEvent.click(within(topDialog()).getByRole("button", { name: "Скасувати" }));
    expect(screen.getByRole("heading", { name: "Новий інцидент" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Новий інцидент" })).getByRole("button", { name: "Закрити" }));
    fireEvent.click(within(topDialog()).getByRole("button", { name: "Закрити без збереження" }));
    expect(screen.queryByRole("heading", { name: "Новий інцидент" })).not.toBeInTheDocument();
  });

  it("автоматично зберігає повну форму при закритті", async () => {
    mockData();
    renderPage();
    const editor = await openNewIncident();
    fireEvent.change(within(editor).getByLabelText("Категорія інциденту"), { target: { value: "Інше" } });
    fireEvent.change(within(editor).getByPlaceholderText("Наприклад, вимушена посадка"), { target: { value: "Інша подія" } });
    fireEvent.change(within(editor).getByLabelText("Обставини події"), { target: { value: "Повністю заповнено" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Закрити" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", {
      draft: expect.objectContaining({ incidentType: "Інший інцидент", customTypeName: "Інша подія", description: "Повністю заповнено" }),
    }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Новий інцидент" })).not.toBeInTheDocument());
  });

  it("не закриває форму, якщо виділення тексту почалося всередині й завершилося на фоні", async () => {
    mockData();
    renderPage();
    const editor = await openNewIncident();
    fireEvent.change(within(editor).getByLabelText("Обставини події"), { target: { value: "Текст для виділення" } });
    const textarea = within(editor).getByLabelText("Обставини події");
    const backdrop = editor.closest(".modal-backdrop")!;

    fireEvent.pointerDown(textarea, { pointerId: 17 });
    fireEvent.pointerUp(backdrop, { pointerId: 17 });

    expect(screen.getByRole("heading", { name: "Новий інцидент" })).toBeInTheDocument();
    expect(textarea).toHaveValue("Текст для виділення");
    expect(invoke).not.toHaveBeenCalledWith("create_incident", expect.anything());
  });
});
