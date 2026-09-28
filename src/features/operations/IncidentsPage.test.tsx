import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { IncidentsPage } from "./IncidentsPage";
import { FLIGHT_PLAN_STORAGE_KEY } from "./flight-plan-storage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const incident = (id: number) => ({ id, category: "Майно", incidentType: `Подія ${id}`, status: "Чернетка", occurredAt: "2026-08-18T09:30", crewId: 4, crewName: "ГРІМ", equipmentId: 8, equipmentName: "VAMPIRE", equipmentIds: [8], equipmentNames: ["VAMPIRE"], personnelIds: [12], personnelNames: ["ЖУК Дмитро Петрович"], positionName: "ХИЖАК", reconnaissanceArea: "СТЕПОВЕ", crewSnapshot: "Іваненко Іван Іванович", vehicleName: "Toyota Hilux АА 2103 КТ", description: `Опис ${id}`, immediateActions: "", consequences: "", flightStage: "", preliminaryCause: "", snapshotSource: "current", reportedTo: "", reportedAt: "", sourceFlightId: null, eventData: {}, steps: [], documents: [], history: [] });
const pendingPlan = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 3,
  date: "12.09.2026",
  unitName: "РБПАК",
  selected: [4],
  entries: {
    4: {
      crewId: 4,
      actualMemberIds: [],
      startTime: "07:00",
      endTime: "12:00",
      areaPoints: [],
      uavSelections: [],
      positionName: "ВИПРАВЛЕНА",
      ...overrides,
    },
  },
  rotations: {},
  pendingSave: { date: "2026-09-12", revision: 2, updatedAt: 200 },
});

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); localStorage.clear(); });

describe("Журнал інцидентів", () => {
  it("показує по 20 записів, підвантажує решту та відкриває деталі з нормальною датою і часом", async () => {
    const incidents = Array.from({ length: 25 }, (_, index) => incident(index + 1));
    invoke.mockImplementation((command: string) => command === "list_incidents" ? Promise.resolve(incidents) : command === "list_crews" || command === "list_equipment" ? Promise.resolve([]) : Promise.resolve());
    const { container } = render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    expect(await screen.findByText("Показано 20 із 25")).toBeInTheDocument();
    expect(screen.queryByText("Подія 25")).not.toBeInTheDocument();
    const scroll = container.querySelector<HTMLElement>(".data-table__scroll")!;
    Object.defineProperties(scroll, { scrollHeight: { value: 1000 }, clientHeight: { value: 500 }, scrollTop: { value: 450, configurable: true } });
    fireEvent.scroll(scroll);
    await waitFor(() => expect(screen.getByText("Показано 25 із 25")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Подія 25"));
    expect(screen.getByRole("heading", { name: "Подія 25 - ЖУК Д.П. - 18.08.2026" })).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Інцидент №25")).toBeInTheDocument();
    expect(within(dialog).getByText("18.08.2026 · 09:30")).toBeInTheDocument();
  });

  it("додає +N до першої основної особи у назві відкритої картки", async () => {
    const item = { ...incident(1), personnelNames: ["Жук Дмитро Петрович", "Іваненко Іван Іванович", "Петренко Олег Сергійович"] };
    invoke.mockImplementation((command: string) => command === "list_incidents" ? Promise.resolve([item]) : command === "list_crews" || command === "list_equipment" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByText("Подія 1"));
    expect(screen.getByRole("heading", { name: "Подія 1 - ЖУК Д.П. +2 - 18.08.2026" })).toBeInTheDocument();
  });

  it("використовує закріплену за майном особу, якщо окремих осіб інциденту немає", async () => {
    const item = { ...incident(2), personnelIds: [], personnelNames: [] };
    const asset = { id: 8, category: "uav", name: "VAMPIRE", inventoryNumber: "UAV-008", status: "Справний", crewId: 4, crewName: "ГРІМ", personnelId: 17, holderName: "Коваленко Марія Олегівна", totalQuantity: 1, dayQuantity: 1, nightQuantity: 0, assetKind: "aircraft", componentsJson: "[]", assignedQuantity: 1, weaponKind: "component", measurementUnit: "шт.", stockQuantity: 1, notes: "" };
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_incidents") return Promise.resolve([item]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [asset] : []);
      if (command === "list_crews") return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByText("Подія 2"));
    expect(await screen.findByRole("heading", { name: "Подія 2 - КОВАЛЕНКО М.О. - 18.08.2026" })).toBeInTheDocument();
  });

  it("використовує історичний знімок перед поточним екіпажем або нейтральний текст", async () => {
    const withCrew = { ...incident(3), equipmentId: null, equipmentIds: [], equipmentName: null, equipmentNames: [], personnelIds: [], personnelNames: [] };
    const withoutResponsible = { ...withCrew, id: 4, incidentType: "Подія 4", crewId: null, crewName: null, crewSnapshot: "" };
    const commander = { personnelId: 31, fullName: "Романенко Назар Володимирович", rank: "старший сержант", position: "Командир екіпажу", callsign: "" };
    const crew = { id: 4, name: "ГРІМ", members: [commander], actualMembers: [commander] };
    invoke.mockImplementation((command: string) => command === "list_incidents" ? Promise.resolve([withCrew, withoutResponsible]) : command === "list_crews" ? Promise.resolve([crew]) : command === "list_equipment" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByText("Подія 3"));
    expect(await screen.findByRole("heading", { name: "Подія 3 - ІВАНЕНКО І.І. - 18.08.2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    fireEvent.click(screen.getByText("Подія 4"));
    expect(screen.getByRole("heading", { name: "Подія 4 - особу не вказано - 18.08.2026" })).toBeInTheDocument();
  });

  it("для іншого інциденту просить назву події та зберігає дату і час з окремих полів", async () => {
    invoke.mockImplementation((command: string) => command === "list_incidents" || command === "list_crews" || command === "list_equipment" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    fireEvent.change(screen.getByLabelText("Категорія інциденту"), { target: { value: "Інше" } });
    fireEvent.change(screen.getByPlaceholderText("Наприклад, вимушена посадка"), { target: { value: "Вимушена посадка" } });
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-09-12" } });
    fireEvent.change(screen.getByLabelText("Час"), { target: { value: "14:45" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", { draft: expect.objectContaining({ incidentType: "Вимушена посадка", occurredAt: "2026-09-12T14:45" }) }));
  });

  it("не надсилає інцидент без обов’язкових дати та часу", async () => {
    invoke.mockImplementation((command: string) => command === "list_incidents" || command === "list_crews" || command === "list_equipment" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    const date=screen.getByLabelText("Дата");
    const time=screen.getByLabelText("Час");
    expect(date).toBeRequired();
    expect(time).toBeRequired();

    fireEvent.change(time, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));
    expect(await screen.findByText("Вкажіть обов’язкові дату та час інциденту.")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("create_incident", expect.anything());

    fireEvent.change(time, { target: { value: "14:45" } });
    fireEvent.change(date, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));
    expect(invoke).not.toHaveBeenCalledWith("create_incident", expect.anything());

    fireEvent.change(date, { target: { value: "2026-09-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", { draft: expect.objectContaining({ occurredAt: "2026-09-12T14:45" }) }));
  });

  it("не показує у створенні поступові службові поля, яких немає у факті нової події", async () => {
    invoke.mockImplementation((command: string) => command === "list_incidents" || command === "list_crews" || command === "list_equipment" || command === "list_flight_journal_entries" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    expect(screen.getByRole("heading", { name: "Фактичні дані події" })).toBeInTheDocument();
    expect(screen.getByLabelText("Обставини події")).toBeInTheDocument();
    for (const label of ["Ланцюжок доповіді", "Спосіб доповіді", "Відповідальний за супровід", "Першочергові дії", "Кому доповіли", "Дата доповіді", "Час доповіді", "Наслідки / поточний результат", "Пояснення", "Списання"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("показує фактичний склад і дозволяє вибрати кілька одиниць лише з майна обраного екіпажу", async () => {
    const member = { personnelId: 41, fullName: "ІВАНЕНКО Іван Іванович", rank: "солдат", position: "Оператор", callsign: "СОКІЛ" };
    const crew = { id: 4, name: "ГРІМ", positionName: "ХИЖАК", reconnaissanceArea: "СТЕПОВЕ", actualMembers: [member] };
    const asset = (id: number, category: string, name: string, crewId: number | null) => ({ id, category, name, inventoryNumber: `INV-${id}`, status: "Справний", crewId, crewName: crewId ? "ГРІМ" : null, personnelId: null, holderName: null, totalQuantity: 1, dayQuantity: 1, nightQuantity: 0, assetKind: "aircraft", componentsJson: "[]", assignedQuantity: 1, notes: "" });
    const mavic = asset(8, "uav", "MAVIC 3T", 4);
    const generator = asset(9, "generator", "EcoFlow", 4);
    const foreign = asset(10, "communications", "Hytera", null);
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_incidents") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [mavic] : args?.category === "generator" ? [generator] : args?.category === "communications" ? [foreign] : []);
      return Promise.resolve();
    });
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    expect(screen.getByRole("button", { name: "Додати майно" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Екіпаж інциденту"), { target: { value: "4" } });
    expect(screen.getByDisplayValue("ХИЖАК")).toBeInTheDocument();
    expect(screen.getByText("ІВАНЕНКО Іван Іванович")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Додати майно" }));
    expect(screen.queryByText("Hytera")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("MAVIC 3T"));
    fireEvent.click(screen.getByText("EcoFlow"));
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", { draft: expect.objectContaining({ crewId: 4, positionName: "ХИЖАК", equipmentIds: [8, 9] }) }));
  });

  it("підтягує позицію зі знімка БД саме за датою інциденту", async () => {
    const crew = { id: 4, name: "ГРІМ", positionName: "ПОТОЧНА", reconnaissanceArea: "СТЕПОВЕ", actualMembers: [] };
    invoke.mockImplementation((command: string, args?: { planDate?: string }) => {
      if (command === "list_incidents" || command === "list_equipment") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "get_flight_plan_snapshot") {
        return Promise.resolve(args?.planDate === "2026-09-12"
          ? JSON.stringify({ unitName: "РБПАК", entries: [{ crewId: 4, positionName: "АРХІВНА" }] })
          : null);
      }
      return Promise.resolve();
    });
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    fireEvent.change(screen.getByLabelText("Екіпаж інциденту"), { target: { value: "4" } });
    expect(screen.getByDisplayValue("ПОТОЧНА")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-09-12" } });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_flight_plan_snapshot", { planDate: "2026-09-12" }));
    await waitFor(() => expect(screen.getByDisplayValue("АРХІВНА")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", {
      draft: expect.objectContaining({ occurredAt: expect.stringMatching(/^2026-09-12T/u), positionName: "АРХІВНА", snapshotSource: "flight-plan-snapshot" }),
    }));
  });

  it("надає валідному pending-виправленню пріоритет над старим знімком БД", async () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify(pendingPlan()));
    const crew = { id: 4, name: "ГРІМ", positionName: "ПОТОЧНА", reconnaissanceArea: "СТЕПОВЕ", actualMembers: [] };
    invoke.mockImplementation((command: string) => {
      if (command === "list_incidents" || command === "list_equipment") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "get_flight_plan_snapshot") return Promise.resolve(JSON.stringify({ unitName: "РБПАК", entries: [{ crewId: 4, positionName: "СТАРА З БД" }] }));
      return Promise.resolve();
    });
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    fireEvent.change(screen.getByLabelText("Екіпаж інциденту"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-09-12" } });

    await waitFor(() => expect(screen.getByDisplayValue("ВИПРАВЛЕНА")).toBeInTheDocument());
    expect(screen.queryByDisplayValue("СТАРА З БД")).not.toBeInTheDocument();
  });

  it("ігнорує невалідний pending і використовує знімок БД", async () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify(pendingPlan({ areaPoints: "не масив" })));
    const crew = { id: 4, name: "ГРІМ", positionName: "ПОТОЧНА", reconnaissanceArea: "СТЕПОВЕ", actualMembers: [] };
    invoke.mockImplementation((command: string) => {
      if (command === "list_incidents" || command === "list_equipment") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "get_flight_plan_snapshot") return Promise.resolve(JSON.stringify({ unitName: "РБПАК", entries: [{ crewId: 4, positionName: "АКТУАЛЬНА З БД" }] }));
      return Promise.resolve();
    });
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    fireEvent.change(screen.getByLabelText("Екіпаж інциденту"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-09-12" } });

    await waitFor(() => expect(screen.getByDisplayValue("АКТУАЛЬНА З БД")).toBeInTheDocument());
    expect(screen.queryByDisplayValue("ВИПРАВЛЕНА")).not.toBeInTheDocument();
  });

  it("не підмішує завтрашню локальну чернетку до інциденту за іншу дату", async () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify({
      date: "18.09.2026",
      unitName: "РБПАК",
      selected: [4],
      entries: { 4: { crewId: 4, actualMemberIds: [], startTime: "07:00", endTime: "12:00", positionName: "ЗАВТРА" } },
    }));
    const crew = { id: 4, name: "ГРІМ", positionName: "ПОТОЧНА", reconnaissanceArea: "СТЕПОВЕ", actualMembers: [] };
    invoke.mockImplementation((command: string) => {
      if (command === "list_incidents" || command === "list_equipment") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "get_flight_plan_snapshot") return Promise.resolve(null);
      return Promise.resolve();
    });
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-09-17" } });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_flight_plan_snapshot", { planDate: "2026-09-17" }));
    fireEvent.change(screen.getByLabelText("Екіпаж інциденту"), { target: { value: "4" } });

    expect(screen.getByDisplayValue("ПОТОЧНА")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("ЗАВТРА")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", {
      draft: expect.objectContaining({ positionName: "ПОТОЧНА", snapshotSource: "current" }),
    }));
  });

  it("створює втрату БпЛА від запису журналу та вимагає два пояснення", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-13T10:00:00"));
    const members = [
      { personnelId: 41, fullName: "ІВАНЕНКО Іван Іванович", rank: "солдат", position: "Оператор", callsign: "" },
      { personnelId: 42, fullName: "ПЕТРЕНКО Петро Петрович", rank: "сержант", position: "Командир", callsign: "" },
    ];
    const crew = { id: 4, name: "ГРІМ", positionName: "ПОТОЧНА", reconnaissanceArea: "СТЕПОВЕ", actualMembers: members };
    const flight = { id: 77, flightDate: "2026-09-12", skyTime: "14:45", groundTime: "15:10", crewId: 4, crewName: "ГРІМ", positionId: 2, positionName: "АРХІВНА", battleOrder: "БРО-2", workStrip: "СМУГА", uavId: 8, uavName: "MAVIC 3T", uavType: "Коптер", uavSerialNumber: "UAV-8", mission: "Розвідка", payloadSource: "equipment", payloadId: 9, payloadType: "БК", payloadSerialNumber: "БК-9", notes: "" };
    const asset = { id: 8, category: "uav", name: "MAVIC 3T", inventoryNumber: "UAV-8", status: "Справний", crewId: 4, crewName: "ГРІМ", personnelId: null, holderName: null, totalQuantity: 1, dayQuantity: 1, nightQuantity: 0, assetKind: "aircraft", componentsJson: "[]", assignedQuantity: 1, weaponKind: "component", measurementUnit: "шт.", stockQuantity: 1, notes: "" };
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_incidents") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_flight_journal_entries") return Promise.resolve([flight]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [asset] : []);
      if (command === "get_flight_plan_snapshot") return Promise.resolve(null);
      return Promise.resolve();
    });
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    fireEvent.change(screen.getByLabelText("Категорія інциденту"), { target: { value: "БпЛА" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));
    expect(await screen.findByText("Для втрати БпЛА оберіть запис із журналу польотів.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Запис журналу польотів"), { target: { value: "77" } });
    expect(screen.getByLabelText("Дата")).toHaveValue("2026-09-12");
    expect(screen.getByLabelText("Час")).toHaveValue("14:45");
    fireEvent.change(screen.getByLabelText("Особа пояснення 1"), { target: { value: "41" } });
    fireEvent.change(screen.getByLabelText("Пояснення 1"), { target: { value: "Перше пояснення" } });
    fireEvent.change(screen.getByLabelText("Особа пояснення 2"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("Пояснення 2"), { target: { value: "Друге пояснення" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти інцидент" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_incident", { draft: expect.objectContaining({ sourceFlightId: 77, crewId: 4, positionName: "АРХІВНА", equipmentIds: [8], snapshotSource: "flight-journal", eventData: expect.objectContaining({ sourceFlight: expect.stringContaining("Політ №77"), explanations: expect.arrayContaining([expect.objectContaining({ text: "Перше пояснення" }), expect.objectContaining({ text: "Друге пояснення" })]) }) }) }));
  });

  it("для втрати БпЛА показує тільки польоти за останні 24 години", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-28T12:00:00"));
    const flights = [
      { id: 1, flightDate: "2026-09-27", skyTime: "11:59", crewName: "СТАРИЙ", uavName: "UAV-1", notes: "" },
      { id: 2, flightDate: "2026-09-27", skyTime: "12:01", crewName: "АКТУАЛЬНИЙ", uavName: "UAV-2", notes: "" },
    ];
    invoke.mockImplementation((command: string) => command === "list_flight_journal_entries" ? Promise.resolve(flights) : command === "list_incidents" || command === "list_crews" || command === "list_equipment" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати інцидент" }));
    fireEvent.change(screen.getByLabelText("Категорія інциденту"), { target: { value: "БпЛА" } });
    const select = screen.getByLabelText("Запис журналу польотів");
    expect(within(select).queryByRole("option", { name: /СТАРИЙ/u })).not.toBeInTheDocument();
    expect(within(select).getByRole("option", { name: /АКТУАЛЬНИЙ/u })).toBeInTheDocument();
  });

  it("зберігає стан одразу без кнопки «Застосувати»", async () => {
    const item = { ...incident(50), incidentType: "Втрата майна" };
    invoke.mockImplementation((command: string) => command === "list_incidents" ? Promise.resolve([item]) : command === "list_crews" || command === "list_equipment" || command === "list_flight_journal_entries" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByText("Втрата майна"));
    expect(screen.queryByRole("button", { name: "Застосувати" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Стан інциденту"), { target: { value: "Зареєстровано" } });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_incident_status", { incidentId: 50, status: "Зареєстровано", reason: "" }));
  });

  it("автоматично зберігає доповнення у картці інциденту", async () => {
    const item = { ...incident(51), incidentType: "Втрата майна" };
    invoke.mockImplementation((command: string) => command === "list_incidents" ? Promise.resolve([item]) : command === "list_crews" || command === "list_equipment" || command === "list_flight_journal_entries" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByText("Втрата майна"));
    fireEvent.click(screen.getByRole("button", { name: "Дані події" }));
    fireEvent.change(screen.getByLabelText("Обставини події"), { target: { value: "Доповнені фактичні обставини" } });

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_incident_data", { incidentId: 51, draft: expect.objectContaining({ description: "Доповнені фактичні обставини" }) }), { timeout: 1500 });
  });

  it("показує компактний алгоритм зі строками та окрему вкладку документів", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0));
    const step = (id: number, order: number, title: string, dueAt: string, status = "Не розпочато") => ({ id, order, title, description: `Опис кроку ${order}`, required: true, status, dueAt, completedAt: status === "Виконано" ? "2026-09-28T11:30" : "", comment: "", updatedAt: "2026-09-28 11:30:00" });
    const item = {
      ...incident(52),
      category: "БпЛА",
      incidentType: "Втрата БпЛА",
      occurredAt: "2026-09-28T10:00",
      steps: [
        step(1, 1, "Негайна доповідь", "", "Виконано"),
        step(2, 2, "Першочергове донесення", "2026-09-28T13:00"),
        step(3, 3, "Позатермінове донесення", "2026-09-29T10:00"),
        step(4, 4, "Рапорт на втрату", "2026-10-01T10:00"),
      ],
      documents: [
        { id: 1, documentType: "Першочергове донесення", status: "Не створено", updatedAt: "2026-09-28 10:00:00" },
        { id: 2, documentType: "Позатермінове донесення", status: "Чернетка", updatedAt: "2026-09-28 11:00:00" },
      ],
    };
    invoke.mockImplementation((command: string) => command === "list_incidents" ? Promise.resolve([item]) : command === "list_crews" || command === "list_equipment" || command === "list_flight_journal_entries" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><IncidentsPage /></NotificationProvider>);

    fireEvent.click(await screen.findByText("Втрата БпЛА"));
    fireEvent.click(screen.getByRole("button", { name: "Алгоритм" }));
    expect(screen.getByRole("heading", { name: "Контрольні кроки" })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === "1 із 4")).toBeInTheDocument();
    expect(screen.getAllByText("Сьогодні о 13:00").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Стан кроку Першочергове донесення")).toHaveValue("Не розпочато");

    fireEvent.click(screen.getByRole("button", { name: "Документи" }));
    expect(screen.getByRole("heading", { name: "Документи" })).toBeInTheDocument();
    expect(screen.getByText("із 2 сформовано")).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: "Створити документ" })) expect(button).toBeDisabled();
  });
});
