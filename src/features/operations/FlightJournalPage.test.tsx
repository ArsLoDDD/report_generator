import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { FlightJournalPage } from "./FlightJournalPage";
import { FLIGHT_PLAN_STORAGE_KEY } from "./flight-plan-storage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const crew = { id: 4, name: "ГРІМ", positionName: "САПСАН", positionId: 2, battleOrder: "БРО-02", sector: "СМУГА СХІД", primaryUavId: 8, uavName: "MAVIC 3T", uavType: "Коптер", status: "Працюючий", actualMembers: [], members: [] };
const uav = { id: 8, category: "uav", name: "MAVIC 3T", inventoryNumber: "UAV-008", uavType: "Коптер", crewId: 4, weaponKind: "weapon" };
const position = { id: 2, name: "САПСАН", battleOrder: "БРО-02" };
const pendingPlan = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 3,
  date: "13.09.2026",
  unitName: "РБПАК",
  selected: [4],
  entries: {
    4: {
      crewId: 4,
      actualMemberIds: [],
      startTime: "08:40",
      endTime: "09:55",
      areaPoints: [],
      task: "Виправлене завдання",
      uavSelections: [{ equipmentId: 8 }],
      ...overrides,
    },
  },
  rotations: {},
  pendingSave: { date: "2026-09-13", revision: 2, updatedAt: 200 },
});
const journalEntry = (id: number, flightDate: string, crewName = `ЕКІПАЖ-${id}`) => ({
  id,
  flightDate,
  skyTime: "08:00",
  groundTime: "09:00",
  crewId: id,
  crewName,
  positionId: id,
  positionName: `ПОЗИЦІЯ-${id}`,
  battleOrder: `БРО-${id}`,
  workStrip: "СМУГА",
  uavId: id,
  uavName: `БПЛА-${id}`,
  uavType: "Коптер",
  uavSerialNumber: `UAV-${id}`,
  mission: "Розвідка",
  payloadSource: "equipment",
  payloadId: id,
  payloadType: `БК-${id}`,
  payloadSerialNumber: `PAYLOAD-${id}`,
  notes: "",
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};
const scrollToBottom = (element: HTMLElement) => {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 400 },
    scrollTop: { configurable: true, value: 600 },
  });
  fireEvent.scroll(element);
};

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

describe("Журнал польотів", () => {
  it("не позначає тестове наповнення окремим статусом у журналі та картці", async () => {
    const seeded = { ...journalEntry(1, "2026-09-28", "ГРІМ"), notes: "[DEV-SEED:flight-journal-v1] Демонстраційний запис — не є підтвердженим фактом польоту." };
    invoke.mockImplementation((command: string) => {
      if (command === "list_flight_journal_entries") return Promise.resolve([seeded]);
      if (["list_crews", "list_positions", "list_equipment", "list_workshop_products"].includes(command)) return Promise.resolve([]);
      if (command === "get_app_settings") return Promise.resolve({ commissionTemplates: [] });
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    fireEvent.click(await screen.findByText("ГРІМ"));
    expect(screen.queryByText("Демонстраційний запис")).not.toBeInTheDocument();
    expect(screen.queryByText(/не є підтвердженим фактом/u)).not.toBeInTheDocument();
  });

  it("при першому відкритті завжди показує сьогоднішню дату, а не дату останнього запису", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "list_flight_journal_entries") return Promise.resolve([journalEntry(1, "2025-01-03")]);
      if (["list_crews", "list_positions", "list_equipment", "list_workshop_products"].includes(command)) return Promise.resolve([]);
      if (command === "get_app_settings") return Promise.resolve({ commissionTemplates: [] });
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    expect(await screen.findByLabelText("Дата польоту")).toHaveValue(today);
  });

  it("підставляє погоджені поля з плану, не показує джерело та залишає нотатки останніми", async () => {
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_flight_journal_entries") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [uav] : []);
      if (command === "list_workshop_products") return Promise.resolve([]);
      if (command === "get_flight_plan_snapshot") return Promise.resolve(JSON.stringify({ unitName: "РБПАК", entries: [{ crewId: 4, startTime: "06:10", endTime: "07:25", task: "Розвідка", uavSelections: [{ equipmentId: 8 }], payloadSelection: null }] }));
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/Джерело даних/i)).not.toBeInTheDocument();
    fireEvent.change(dialog.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: "2026-09-13" } });
    fireEvent.change(within(dialog).getByLabelText("Екіпаж польоту"), { target: { value: "4" } });
    expect(await within(dialog).findByDisplayValue("06:10")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("07:25")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("СМУГА СХІД")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("UAV-008")).toBeInTheDocument();
    const fieldNames = [...dialog.querySelectorAll<HTMLElement>(".operation-editor__body > .form-field > span")].map((element) => element.textContent?.trim());
    expect(fieldNames[fieldNames.length - 1]).toBe("Нотатки");
  });

  it("надає валідному pending-виправленню пріоритет над старим знімком БД", async () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify(pendingPlan()));
    invoke.mockImplementation((command: string, args?: { category?: string; planDate?: string }) => {
      if (command === "list_flight_journal_entries") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [uav] : []);
      if (command === "list_workshop_products") return Promise.resolve([]);
      if (command === "get_flight_plan_snapshot") return Promise.resolve(JSON.stringify({ unitName: "РБПАК", entries: [{ crewId: 4, startTime: "06:10", endTime: "07:25", task: "Старе завдання", uavSelections: [] }] }));
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: "2026-09-13" } });
    fireEvent.change(within(dialog).getByLabelText("Екіпаж польоту"), { target: { value: "4" } });

    expect(await within(dialog).findByDisplayValue("08:40")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("09:55")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("Виправлене завдання")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("get_flight_plan_snapshot", { planDate: "2026-09-13" });
  });

  it("ігнорує невалідний pending і використовує знімок БД", async () => {
    localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY, JSON.stringify(pendingPlan({ areaPoints: "не масив" })));
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_flight_journal_entries") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [uav] : []);
      if (command === "list_workshop_products") return Promise.resolve([]);
      if (command === "get_flight_plan_snapshot") return Promise.resolve(JSON.stringify({ unitName: "РБПАК", entries: [{ crewId: 4, startTime: "06:10", endTime: "07:25", task: "Знімок БД", uavSelections: [] }] }));
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: "2026-09-13" } });
    fireEvent.change(within(dialog).getByLabelText("Екіпаж польоту"), { target: { value: "4" } });

    expect(await within(dialog).findByDisplayValue("06:10")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("07:25")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("Знімок БД")).toBeInTheDocument();
  });

  it("зберігає датовані назви екіпажу, позиції та БпЛА, навіть якщо пов’язані записи вже змінені або видалені", async () => {
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_flight_journal_entries") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [uav] : []);
      if (command === "list_workshop_products") return Promise.resolve([]);
      if (command === "get_flight_plan_snapshot") return Promise.resolve(JSON.stringify({
        unitName: "РБПАК",
        entries: [{
          crewId: 4,
          crewName: "ГРІМ-СТАРИЙ",
          crewUavType: "Літакового типу",
          positionId: 77,
          positionName: "АРХІВНА ПОЗИЦІЯ",
          battleOrder: "БРО-77",
          workStrip: "СМУГА ПІВНІЧ",
          startTime: "06:10",
          endTime: "07:25",
          task: "Архівне завдання",
          uavSelections: [{ equipmentId: 88 }],
          uavSnapshots: [{ equipmentId: 88, name: "ЛЕЛЕКА-100", serialNumber: "UAV-OLD" }],
          payloadSelection: null,
        }],
      }));
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: "2026-09-13" } });
    fireEvent.change(within(dialog).getByLabelText("Екіпаж польоту"), { target: { value: "4" } });

    expect(await within(dialog).findByText(/АРХІВНА ПОЗИЦІЯ · зі знімка/u)).toBeInTheDocument();
    expect(within(dialog).getByText(/ЛЕЛЕКА-100 · UAV-OLD · зі знімка/u)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Зберегти запис" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_flight_journal_entry", {
      draft: expect.objectContaining({
        crewId: 4,
        crewName: "ГРІМ-СТАРИЙ",
        positionId: null,
        positionName: "АРХІВНА ПОЗИЦІЯ",
        battleOrder: "БРО-77",
        workStrip: "СМУГА ПІВНІЧ",
        uavId: null,
        uavName: "ЛЕЛЕКА-100",
        uavType: "Літакового типу",
        uavSerialNumber: "UAV-OLD",
      }),
    }));
  });

  it("не застосовує запізнілу відповідь після зміни дати", async () => {
    let resolveOld: ((value: string) => void) | undefined;
    let resolveNew: ((value: string) => void) | undefined;
    invoke.mockImplementation((command: string, args?: { category?: string; planDate?: string }) => {
      if (command === "list_flight_journal_entries") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [uav] : []);
      if (command === "list_workshop_products") return Promise.resolve([]);
      if (command === "get_flight_plan_snapshot") return new Promise<string>((resolve) => {
        if (args?.planDate === "2026-09-12") resolveOld = resolve;
        else resolveNew = resolve;
      });
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    const dialog = screen.getByRole("dialog");
    const dateInput = dialog.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(dateInput, { target: { value: "2026-09-12" } });
    fireEvent.change(within(dialog).getByLabelText("Екіпаж польоту"), { target: { value: "4" } });
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"));

    fireEvent.change(dateInput, { target: { value: "2026-09-13" } });
    fireEvent.change(within(dialog).getByLabelText("Екіпаж польоту"), { target: { value: "4" } });
    await waitFor(() => expect(resolveNew).toBeTypeOf("function"));
    await act(async () => resolveNew?.(JSON.stringify({ unitName: "РБПАК", entries: [{ crewId: 4, startTime: "08:00", endTime: "09:00", task: "НОВЕ ЗАВДАННЯ" }] })));
    expect(await within(dialog).findByDisplayValue("НОВЕ ЗАВДАННЯ")).toBeInTheDocument();

    await act(async () => resolveOld?.(JSON.stringify({ unitName: "РБПАК", entries: [{ crewId: 4, startTime: "06:00", endTime: "07:00", task: "СТАРЕ ЗАВДАННЯ" }] })));
    expect(within(dialog).getByDisplayValue("НОВЕ ЗАВДАННЯ")).toBeInTheDocument();
    expect(within(dialog).queryByDisplayValue("СТАРЕ ЗАВДАННЯ")).not.toBeInTheDocument();
  });

  it("не дозволяє повільному запиту попереднього екіпажу перезаписати новий вибір", async () => {
    const secondCrew = { ...crew, id: 5, name: "БАРС", primaryUavId: null };
    const resolvers: Array<(value: string) => void> = [];
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_flight_journal_entries") return Promise.resolve([]);
      if (command === "list_crews") return Promise.resolve([crew, secondCrew]);
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [uav] : []);
      if (command === "list_workshop_products") return Promise.resolve([]);
      if (command === "get_flight_plan_snapshot") return new Promise<string>((resolve) => { resolvers.push(resolve); });
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    const dialog = screen.getByRole("dialog");
    const crewSelect = within(dialog).getByLabelText("Екіпаж польоту");
    fireEvent.change(crewSelect, { target: { value: "4" } });
    fireEvent.change(crewSelect, { target: { value: "5" } });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    const snapshot = JSON.stringify({ unitName: "РБПАК", entries: [{ crewId: 4, startTime: "06:00", endTime: "07:00", task: "ЗАВДАННЯ ГРІМ" }, { crewId: 5, startTime: "08:00", endTime: "09:00", task: "ЗАВДАННЯ БАРС" }] });

    await act(async () => resolvers[1](snapshot));
    expect(await within(dialog).findByDisplayValue("ЗАВДАННЯ БАРС")).toBeInTheDocument();
    await act(async () => resolvers[0](snapshot));
    expect(within(dialog).getByDisplayValue("ЗАВДАННЯ БАРС")).toBeInTheDocument();
    expect(crewSelect).toHaveValue("5");
  });

  it("зберігає запис без поля джерела даних", async () => {
    invoke.mockImplementation((command: string) => command === "list_flight_journal_entries" || command === "list_crews" || command === "list_positions" || command === "list_equipment" || command === "list_workshop_products" ? Promise.resolve(command === "list_crews" ? [crew] : []) : Promise.resolve());
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    fireEvent.change(screen.getByLabelText("Екіпаж польоту"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Час «Небо»"), { target: { value: "07:10" } });
    fireEvent.change(screen.getByLabelText("Час «Земля»"), { target: { value: "08:20" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти запис" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_flight_journal_entry", { draft: expect.not.objectContaining({ source: expect.anything() }) }));
  });

  it("зберігає заповнений фактичний політ при закритті вікна хрестиком", async () => {
    invoke.mockImplementation((command: string) => command === "list_flight_journal_entries" || command === "list_positions" || command === "list_equipment" || command === "list_workshop_products" ? Promise.resolve([]) : command === "list_crews" ? Promise.resolve([crew]) : command === "get_flight_plan_snapshot" ? Promise.resolve(null) : Promise.resolve());
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    const dialog = screen.getByRole("dialog", { name: "Новий запис польоту" });
    fireEvent.change(within(dialog).getByLabelText("Екіпаж польоту"), { target: { value: "4" } });
    fireEvent.change(within(dialog).getByLabelText("Час «Небо»"), { target: { value: "07:10" } });
    fireEvent.change(within(dialog).getByLabelText("Час «Земля»"), { target: { value: "08:20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Закрити" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_flight_journal_entry", { draft: expect.objectContaining({ crewId: 4, skyTime: "07:10", groundTime: "08:20" }) }));
  });

  it("не зберігає політ без обох обов’язкових часів Небо і Земля", async () => {
    invoke.mockImplementation((command: string) => command === "list_flight_journal_entries" || command === "list_crews" || command === "list_positions" || command === "list_equipment" || command === "list_workshop_products" ? Promise.resolve(command === "list_crews" ? [crew] : []) : Promise.resolve());
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Додати" }));
    fireEvent.change(screen.getByLabelText("Екіпаж польоту"), { target: { value: "4" } });
    const skyTime=screen.getByLabelText("Час «Небо»");
    const groundTime=screen.getByLabelText("Час «Земля»");
    expect(skyTime).toBeRequired();
    expect(groundTime).toBeRequired();

    fireEvent.click(screen.getByRole("button", { name: "Зберегти запис" }));
    expect(await screen.findByText("Вкажіть обов’язкові часи «Небо» та «Земля».")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("create_flight_journal_entry", expect.anything());

    fireEvent.change(skyTime, { target: { value: "07:10" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти запис" }));
    expect(invoke).not.toHaveBeenCalledWith("create_flight_journal_entry", expect.anything());

    fireEvent.change(groundTime, { target: { value: "08:20" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти запис" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_flight_journal_entry", { draft: expect.objectContaining({ skyTime: "07:10", groundTime: "08:20" }) }));
  });

  it("фільтрує записи за датою, перемикає сусідні дні та пагінує вже відфільтрований список", async () => {
    const firstDate = "2026-09-13";
    const secondDate = "2026-09-14";
    const entries = [
      ...Array.from({ length: 25 }, (_, index) => journalEntry(index + 1, firstDate)),
      journalEntry(101, secondDate),
      journalEntry(102, secondDate),
    ];
    invoke.mockImplementation((command: string) => {
      if (command === "list_flight_journal_entries") return Promise.resolve(entries);
      if (["list_crews", "list_positions", "list_equipment", "list_workshop_products"].includes(command)) return Promise.resolve([]);
      if (command === "get_app_settings") return Promise.resolve({ commissionTemplates: [] });
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    const dateInput = screen.getByLabelText("Дата польоту");
    fireEvent.change(dateInput, { target: { value: firstDate } });
    expect(await screen.findByText("Показано 20 із 25")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сьогодні" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Завтра" })).not.toBeInTheDocument();

    scrollToBottom(document.querySelector<HTMLElement>(".flight-journal-table .data-table__scroll")!);
    expect(await screen.findByText("Показано 25 із 25")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Наступний день" }));
    expect(dateInput).toHaveValue(secondDate);
    expect(await screen.findByText("Показано 2 із 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "За весь час" }));
    expect(screen.getByRole("button", { name: "За весь час" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("Показано 20 із 27")).toBeInTheDocument();
    scrollToBottom(document.querySelector<HTMLElement>(".flight-journal-table .data-table__scroll")!);
    expect(await screen.findByText("Показано 27 із 27")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "За весь час" }));
    expect(screen.getByRole("button", { name: "За весь час" })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByText("Показано 2 із 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    const editor = screen.getByRole("dialog", { name: "Новий запис польоту" });
    expect(editor.querySelector<HTMLInputElement>('input[type="date"]')).toHaveValue(secondDate);
    fireEvent.click(within(editor).getByRole("button", { name: "Скасувати" }));
  });

  it("показує безпечний попередній перегляд АП з комісією, але не виконує генерацію або списання", async () => {
    const selectedDate = "2026-09-13";
    const entries = [journalEntry(1, selectedDate, "ГРІМ"), journalEntry(2, selectedDate, "БАРС"), journalEntry(3, "2026-09-14", "СОКІЛ")];
    invoke.mockImplementation((command: string) => {
      if (command === "list_flight_journal_entries") return Promise.resolve(entries);
      if (["list_crews", "list_positions", "list_equipment", "list_workshop_products"].includes(command)) return Promise.resolve([]);
      if (command === "get_app_settings") return Promise.resolve({ commissionTemplates: [{ id: "commission-1", name: "Комісія зі списання", variable: "комісія_списання", members: [{ id: "member-1", signerRoleId: "commander", order: 0 }] }] });
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    fireEvent.change(screen.getByLabelText("Дата польоту"), { target: { value: selectedDate } });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_app_settings"));
    fireEvent.click(screen.getByRole("button", { name: "Сформувати АП" }));

    const dialog = screen.getByRole("dialog", { name: "Сформувати АП" });
    expect(within(dialog).getByText("Формування АП у розробці")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Дата польотів для АП")).toHaveValue(selectedDate);
    expect(within(dialog).getByLabelText("Комісія для АП")).toHaveValue("commission-1");
    expect(within(dialog).getByText("ГРІМ")).toBeInTheDocument();
    expect(within(dialog).getByText("БАРС")).toBeInTheDocument();
    expect(within(dialog).queryByText("СОКІЛ")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Обрати всі польоти" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Обрати політ №1" }));
    expect(dialog.querySelector(".flight-journal-ap__selection > header small")).toHaveTextContent("Вибрано: 1 із 2");
    expect(within(dialog).getByLabelText("Підсумок вибору")).toHaveTextContent("Вартість і служби з’являться після погодження зв’язків із майном");
    expect(within(dialog).getByRole("button", { name: "Сформувати АП" })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Дата польотів для АП"), { target: { value: "2026-09-14" } });
    expect(within(dialog).getByText("СОКІЛ")).toBeInTheDocument();
    expect(within(dialog).queryByText("ГРІМ")).not.toBeInTheDocument();

    const commands = invoke.mock.calls.map(([command]) => command);
    expect(commands.every((command) => typeof command === "string" && (command.startsWith("list_") || command === "get_app_settings"))).toBe(true);
  });

  it("не відкриває попередній перегляд АП до завершення завантаження журналу", async () => {
    const entries = deferred<ReturnType<typeof journalEntry>[]>();
    invoke.mockImplementation((command: string) => {
      if (command === "list_flight_journal_entries") return entries.promise;
      if (["list_crews", "list_positions", "list_equipment", "list_workshop_products"].includes(command)) return Promise.resolve([]);
      if (command === "get_app_settings") return Promise.resolve({ commissionTemplates: [] });
      return Promise.resolve();
    });
    render(<NotificationProvider><FlightJournalPage /></NotificationProvider>);

    expect(screen.getByRole("button", { name: "Завантаження…" })).toBeDisabled();
    expect(screen.queryByRole("dialog", { name: "Сформувати АП" })).not.toBeInTheDocument();

    await act(async () => { entries.resolve([journalEntry(1, "2026-09-28")]); });
    const button = await screen.findByRole("button", { name: "Сформувати АП" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "Сформувати АП" })).toBeInTheDocument();
  });
});
