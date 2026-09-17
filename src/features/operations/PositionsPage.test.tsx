import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { PositionsPage } from "./PositionsPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const position = { id: 3, name: "БУРЕВІЙ", positionType: "Запасна", stripName: "СМУГА ПІВНІЧ", locality: "НОВОСЕЛІВКА", battleOrder: "БРО-01", sector: "", condition: "", conditionLevel: 0, fieldType: "", size: "", mgrs: "36U UV 12000 67000", suitableUavText: "", isActive: false, crewId: null, crewName: "СОКІЛ", notes: "Тестова позиція", uavIds: [8], uavNames: ["SHARK"] };
const crew = { id: 9, name: "СОКІЛ", positionId: 3, status: "Працюючий", workingStrength: 3, officialStrength: 4, primaryUavId: 8, uavName: "SHARK", sector: "СМУГА ПІВНІЧ", actualMembers: [] };
const linkedEquipment = { id: 8, category: "uav", name: "SHARK", inventoryNumber: "UAV-008", status: "Справний", crewId: 9, crewName: "СОКІЛ", personnelId: null, holderName: null, totalQuantity: 1, dayQuantity: 1, nightQuantity: 0, assetKind: "aircraft", componentsJson: "[]", assignedQuantity: 1, notes: "" };
const availableEquipment = { ...linkedEquipment, id: 18, category: "generator", name: "EcoFlow Delta", inventoryNumber: "GEN-018" };
const freePerson = { personnelId: 42, fullName: "ПЕТРЕНКО Петро Петрович", rank: "солдат", position: "оператор", crewId: null, crewName: null, currentLocation: "ОХ" };
const kspPerson = { ...freePerson, personnelId: 43, fullName: "КСПОВИЙ Кирило Кирилович", currentLocation: "КСП Роти" };
const otherWorkPerson = { ...freePerson, personnelId: 44, fullName: "РОБОЧИЙ Роман Романович", currentLocation: "Реко та облаштування" };
const trainingPerson = { ...freePerson, personnelId: 45, fullName: "НАВЧАЛЬНИЙ Назар Назарович", currentLocation: "НАВЧ" };
const leavingPositionPerson = { ...freePerson, personnelId: 46, fullName: "ВИБУВАЄ Віктор Вікторович", currentLocation: "ПБЗ" };
const currentIsoDate = () => new Date().toLocaleDateString("sv-SE");
const currentPlanDate = () => {
  const [year, month, day] = currentIsoDate().split("-");
  return `${day}.${month}.${year}`;
};
const openPositionSetup = async () => {
  const button = await screen.findByRole("button", { name: "Облаштувати позицію" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
};

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

describe("Картка позиції", () => {
  it("показує тип, зайнятість з плану польотів і корисні оперативні дані без дублювання району", async () => {
    localStorage.setItem("flight-plan-draft-v2", JSON.stringify({ date: currentPlanDate(), selected: [9] }));
    invoke.mockImplementation((command: string) => command === "list_positions" ? Promise.resolve([position]) : command === "list_crews" ? Promise.resolve([crew]) : command === "list_incidents" ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    expect(await screen.findByText("Запасна")).toBeInTheDocument();
    expect(screen.getByText("На позиції")).toBeInTheDocument();
    expect(screen.getByText("БРО-01")).toBeInTheDocument();
    expect(screen.getByText("СОКІЛ")).toHaveClass("position-card__crew", "is-on-position");
    expect(screen.getAllByText("НОВОСЕЛІВКА")).toHaveLength(1);
    expect(screen.queryByText("Інциденти")).not.toBeInTheDocument();
    expect(screen.queryByText("Відкрити")).not.toBeInTheDocument();
    expect(screen.queryByText("СМУГА ПІВНІЧ")).not.toBeInTheDocument();
  });

  it("показує по 20 карток, підвантажує наступні та шукає серед ще не показаних", async () => {
    const positions = Array.from({ length: 25 }, (_, index) => ({ ...position, id: index + 1, name: `ПОЗИЦІЯ ${index + 1}`, battleOrder: `БРО-${index + 1}` }));
    invoke.mockImplementation((command: string) => command === "list_positions" ? Promise.resolve(positions) : command === "list_crews" || command === "list_incidents" ? Promise.resolve([]) : Promise.resolve());
    const { container } = render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    expect(await screen.findByText("Показано 20 із 25")).toBeInTheDocument();
    expect(screen.queryByText("ПОЗИЦІЯ 25")).not.toBeInTheDocument();
    const content = container.querySelector<HTMLElement>(".page-frame__content")!;
    Object.defineProperties(content, { scrollHeight: { value: 1000 }, clientHeight: { value: 500 }, scrollTop: { value: 450, configurable: true } });
    fireEvent.scroll(content);
    await waitFor(() => expect(screen.getByText("Показано 25 із 25")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Пошук за назвою, районом, БРО або екіпажем…"), { target: { value: "ПОЗИЦІЯ 25" } });
    expect(screen.getByText("ПОЗИЦІЯ 25")).toBeInTheDocument();
    expect(screen.getByText("Показано 1 із 1")).toBeInTheDocument();
  });

  it("показує екіпажі окремими записами та автоматично збирає майно екіпажу на позиції", async () => {
    localStorage.setItem("flight-plan-draft-v2", JSON.stringify({ date: currentPlanDate(), selected: [9] }));
    invoke.mockImplementation((command: string, args?: { category?: string }) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_crews") return Promise.resolve([crew]);
      if (command === "list_incidents") return Promise.resolve([]);
      if (command === "list_equipment") return Promise.resolve(args?.category === "uav" ? [linkedEquipment] : args?.category === "generator" ? [availableEquipment] : []);
      if (command === "list_vehicles") return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    fireEvent.click((await screen.findByText("БУРЕВІЙ")).closest("article")!);
    fireEvent.click(screen.getByRole("button", { name: "Екіпажі і майно" }));
    expect(screen.getByText("Статус: Працюючий")).toBeInTheDocument();
    expect(screen.getByText("Основний БпЛА: SHARK · Смуга: СМУГА ПІВНІЧ")).toBeInTheDocument();
    expect(screen.getByText("Майно на позиції")).toBeInTheDocument();
    expect(screen.getByText("UAV-008 · Справний · 1 шт")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Генератори: 1" }));
    expect(screen.getByText("EcoFlow Delta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Додати майно" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Зберегти позицію" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_position", expect.objectContaining({ positionId: 3, draft: expect.objectContaining({ uavIds: [] }) })));
  });

  it("автоматично створює неперетинні періоди робіт та охорони і перераховує їхню тривалість", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_staffing_records") return Promise.resolve([freePerson, kspPerson, trainingPerson]);
      if (["list_crews", "list_incidents", "list_equipment", "list_vehicles", "list_position_work"].includes(command)) return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    await openPositionSetup();
    fireEvent.change(screen.getByLabelText("Позиція для облаштування"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Час події"), { target: { value: "11:00" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /ПЕТРЕНКО Петро Петрович/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /КСПОВИЙ Кирило Кирилович/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /НАВЧАЛЬНИЙ Назар Назарович/ }));
    expect(screen.getAllByText("Період 1")).toHaveLength(3);
    expect(screen.getAllByText("Період 2")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Тривалість чергування"), { target: { value: "4" } });
    expect(screen.getByLabelText("Час початку, період 1: ПЕТРЕНКО Петро Петрович")).toHaveValue("11:00");
    expect(screen.getByLabelText("Час завершення, період 1: ПЕТРЕНКО Петро Петрович")).toHaveValue("15:00");
    expect(screen.getByLabelText("Час початку, період 2: ПЕТРЕНКО Петро Петрович")).toHaveValue("15:01");
    fireEvent.click(screen.getByRole("button", { name: "Розпочати роботи" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "save_position_work",
        expect.objectContaining({
          draft: expect.objectContaining({
            positionId: 3,
            memberAssignments: expect.arrayContaining([
              expect.objectContaining({ personnelId: 42, dutyType: "Облаштування", startTime: "11:00", endTime: "15:00" }),
              expect.objectContaining({ personnelId: 42, dutyType: "Охорона та оборона", startTime: "15:01", endTime: "19:00" }),
              expect.objectContaining({ personnelId: 43, dutyType: "Облаштування", startTime: "15:00", endTime: "19:00" }),
              expect.objectContaining({ personnelId: 45, dutyType: "Охорона та оборона", startTime: "11:00", endTime: "15:00" }),
            ]),
            endTime: "23:00",
          }),
        }),
      ),
    );
    expect(invoke).not.toHaveBeenCalledWith("update_position", expect.anything());
  });

  it("підтягує БРО позиції у роботи, розпочаті безпосередньо з її картки", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_staffing_records") return Promise.resolve([freePerson]);
      if (["list_crews", "list_incidents", "list_equipment", "list_vehicles", "list_position_work"].includes(command)) return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    fireEvent.click((await screen.findByText(position.name)).closest("article")!);
    fireEvent.click(screen.getByRole("button", { name: "Провести облаштування" }));

    expect(screen.getByLabelText("Бойове розпорядження")).toHaveValue(position.battleOrder);
  });

  it("створює нову позицію без екіпажу перед збереженням робіт", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_staffing_records") return Promise.resolve([freePerson]);
      if (command === "create_position") return Promise.resolve(77);
      if (["list_crews", "list_incidents", "list_equipment", "list_vehicles", "list_position_work"].includes(command)) return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    await openPositionSetup();
    fireEvent.change(screen.getByLabelText("Вибір нової або наявної позиції"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText(/^Назва/), { target: { value: "ОРЕЛ" } });
    fireEvent.change(screen.getByLabelText("Базовий тип нової позиції"), { target: { value: "Запасна" } });
    fireEvent.change(screen.getByLabelText("БРО"), { target: { value: "БРО-77" } });
    fireEvent.change(screen.getByLabelText("Смуга роботи"), { target: { value: "СМУГА ЗАХІД" } });
    fireEvent.change(screen.getByLabelText("Сектор"), { target: { value: "СЕКТОР ЗАХІД" } });
    fireEvent.change(screen.getByLabelText("Населений пункт / район"), { target: { value: "ЛІСОВЕ" } });
    fireEvent.change(screen.getByLabelText(/^Координати MGRS/), { target: { value: "36U UV 12000 67000" } });
    fireEvent.change(screen.getByLabelText("Стан позиції"), { target: { value: "Готується" } });
    fireEvent.change(screen.getByLabelText("Готовність, %"), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("Тип місцевості"), { target: { value: "Ліс" } });
    fireEvent.change(screen.getByLabelText("Розмір позиції"), { target: { value: "20 × 30 м" } });
    fireEvent.change(screen.getByLabelText("Придатні БпЛА / БпАК"), { target: { value: "SHARK" } });
    fireEvent.change(screen.getByLabelText("Опис позиції"), { target: { value: "Під’їзд із півночі" } });
    fireEvent.change(screen.getByLabelText("Час події"), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText("Дата завершення групи"), { target: { value: currentIsoDate() } });
    fireEvent.change(screen.getByLabelText("Час завершення групи"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /ПЕТРЕНКО Петро Петрович/ }));
    fireEvent.click(screen.getByRole("button", { name: "Розпочати роботи" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_position", { draft: expect.objectContaining({ name: "ОРЕЛ", positionType: "Запасна", crewId: null, isActive: false, battleOrder: "БРО-77", stripName: "СМУГА ЗАХІД", sector: "СЕКТОР ЗАХІД", locality: "ЛІСОВЕ", mgrs: "36U UV 12000 67000", condition: "Готується", conditionLevel: 35, fieldType: "Ліс", size: "20 × 30 м", suitableUavText: "SHARK", notes: "Під’їзд із півночі" }) }));
    expect(invoke).toHaveBeenCalledWith("save_position_work", expect.objectContaining({ draft: expect.objectContaining({ positionId: 77, battleOrder: "БРО-77" }) }));
  });

  it("не створює нову позицію без реквізитів, потрібних підсумковому донесенню", async () => {
    invoke.mockImplementation((command: string) => command === "list_positions" ? Promise.resolve([position]) : ["list_crews", "list_incidents", "list_equipment", "list_vehicles", "list_staffing_records", "list_position_work"].includes(command) ? Promise.resolve([]) : Promise.resolve());
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    await openPositionSetup();
    fireEvent.change(screen.getByLabelText("Вибір нової або наявної позиції"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText(/^Назва/), { target: { value: "ОРЕЛ" } });
    fireEvent.click(screen.getByRole("button", { name: "Розпочати роботи" }));

    expect(await screen.findByText("Для нової позиції вкажіть БРО, смугу роботи, населений пункт, координати MGRS та придатні БпЛА / БпАК.")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("create_position", expect.anything());
  });

  it("показує всіх, хто не перебуває на позиції, але виключає переходи та інші роботи на позиції", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_staffing_records") return Promise.resolve([freePerson, kspPerson, otherWorkPerson, trainingPerson, leavingPositionPerson]);
      if (["list_crews", "list_incidents", "list_equipment", "list_vehicles", "list_position_work"].includes(command)) return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    await openPositionSetup();
    expect(screen.getByRole("checkbox", { name: /ПЕТРЕНКО Петро Петрович/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /КСПОВИЙ Кирило Кирилович/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /НАВЧАЛЬНИЙ Назар Назарович/ })).toBeInTheDocument();
    expect(screen.queryByText(otherWorkPerson.fullName)).not.toBeInTheDocument();
    expect(screen.queryByText(leavingPositionPerson.fullName)).not.toBeInTheDocument();
  });

  it("не вважає склад застарілого плану польотів поточним", async () => {
    localStorage.setItem("flight-plan-draft-v2", JSON.stringify({
      date: "14.09.2026",
      selected: [9],
      entries: { 9: { actualMemberIds: [freePerson.personnelId], startTime: "18:01", endTime: "18:00" } },
    }));
    invoke.mockImplementation((command: string) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_crews") return Promise.resolve([{ ...crew, actualMembers: [{ personnelId: freePerson.personnelId }] }]);
      if (command === "list_staffing_records") return Promise.resolve([freePerson]);
      if (["list_incidents", "list_equipment", "list_vehicles", "list_position_work"].includes(command)) return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    await openPositionSetup();
    expect(screen.getByRole("checkbox", { name: new RegExp(freePerson.fullName) })).toBeInTheDocument();
  });

  it("резервує склад окремо для екіпажу, запис якого відсутній у поточному плані", async () => {
    const fallbackPerson = { ...freePerson, personnelId: 43, fullName: "ЗАПАСНИЙ Захар Захарович" };
    const today = new Date().toLocaleDateString("sv-SE");
    const [year, month, day] = today.split("-");
    localStorage.setItem("flight-plan-draft-v2", JSON.stringify({
      date: `${day}.${month}.${year}`,
      selected: [9, 10],
      entries: { 9: { actualMemberIds: [freePerson.personnelId], startTime: "18:01", endTime: "18:00" } },
    }));
    invoke.mockImplementation((command: string) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_crews") return Promise.resolve([
        { ...crew, actualMembers: [{ personnelId: freePerson.personnelId }] },
        { ...crew, id: 10, name: "БАРС", actualMembers: [{ personnelId: fallbackPerson.personnelId }] },
      ]);
      if (command === "list_staffing_records") return Promise.resolve([freePerson, fallbackPerson]);
      if (["list_incidents", "list_equipment", "list_vehicles", "list_position_work"].includes(command)) return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    await openPositionSetup();
    expect(screen.queryByText(freePerson.fullName)).not.toBeInTheDocument();
    expect(screen.queryByText(fallbackPerson.fullName)).not.toBeInTheDocument();
  });

  it("залишає раніше обрану, але вже зайняту людину видимою, щоб її можна було прибрати", async () => {
    const existingWork = {
      id: 10,
      positionId: 3,
      positionName: position.name,
      workType: "Облаштування",
      status: "Продовжують",
      startDate: "2026-09-15",
      startTime: "08:00",
      endDate: "2026-09-15",
      endTime: "18:00",
      battleOrder: "БРО-01",
      notes: "",
      members: [{ assignmentId: 101, personnelId: kspPerson.personnelId, fullName: kspPerson.fullName, rank: kspPerson.rank, dutyType: "Облаштування", startDate: "2026-09-15", startTime: "08:00", endDate: "2026-09-15", endTime: "18:00" }],
    };
    invoke.mockImplementation((command: string) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_staffing_records") return Promise.resolve([kspPerson]);
      if (command === "list_position_work") return Promise.resolve([existingWork]);
      if (["list_crews", "list_incidents", "list_equipment", "list_vehicles"].includes(command)) return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    fireEvent.click((await screen.findByText(position.name)).closest("article")!);
    fireEvent.click(await screen.findByRole("button", { name: /Редагувати роботи: Облаштування/ }));
    const checkbox = screen.getByRole("checkbox", { name: new RegExp(kspPerson.fullName) });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("дозволяє прибрати legacy-учасника, якого вже немає у відповіді БЧС", async () => {
    const missingPerson = { ...freePerson, personnelId: 99, fullName: "АРХІВНИЙ Артем Артемович" };
    const existingWork = {
      id: 11, positionId: 3, positionName: position.name, workType: "Рекогностування", status: "Продовжують",
      startDate: "2026-09-15", startTime: "08:00", endDate: "2026-09-15", endTime: "18:00", battleOrder: "БРО-01", notes: "",
      members: [{ assignmentId: 102, personnelId: missingPerson.personnelId, fullName: missingPerson.fullName, rank: missingPerson.rank, dutyType: "Рекогностування", startDate: "2026-09-15", startTime: "08:00", endDate: "2026-09-15", endTime: "18:00" }],
    };
    invoke.mockImplementation((command: string) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_staffing_records") return Promise.resolve([]);
      if (command === "list_position_work") return Promise.resolve([existingWork]);
      if (["list_crews", "list_incidents", "list_equipment", "list_vehicles"].includes(command)) return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    fireEvent.click((await screen.findByText(position.name)).closest("article")!);
    fireEvent.click(await screen.findByRole("button", { name: /Редагувати роботи: Рекогностування/ }));
    const checkbox = screen.getByRole("checkbox", { name: new RegExp(missingPerson.fullName) });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("не зберігає період поза межами роботи групи", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_staffing_records") return Promise.resolve([freePerson]);
      if (["list_crews", "list_incidents", "list_equipment", "list_vehicles", "list_position_work"].includes(command)) return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    await openPositionSetup();
    fireEvent.change(screen.getByLabelText("Позиція для облаштування"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Час події"), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText("Дата завершення групи"), { target: { value: currentIsoDate() } });
    fireEvent.change(screen.getByLabelText("Час завершення групи"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /ПЕТРЕНКО Петро Петрович/ }));
    fireEvent.change(screen.getByLabelText(`Час завершення, період 1: ${freePerson.fullName}`), { target: { value: "19:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Розпочати роботи" }));

    expect(await screen.findByText("Кожен період має бути в межах часу роботи групи.")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("save_position_work", expect.anything());
  });

  it("видаляє щойно створену позицію, якщо збереження робіт не вдалося", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "list_positions") return Promise.resolve([position]);
      if (command === "list_staffing_records") return Promise.resolve([freePerson]);
      if (command === "create_position") return Promise.resolve(77);
      if (command === "save_position_work") return Promise.reject("Не вдалося зберегти роботи.");
      if (["list_crews", "list_incidents", "list_equipment", "list_vehicles", "list_position_work"].includes(command)) return Promise.resolve([]);
      return Promise.resolve();
    });
    render(<NotificationProvider><PositionsPage /></NotificationProvider>);

    await openPositionSetup();
    fireEvent.change(screen.getByLabelText("Вибір нової або наявної позиції"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText(/^Назва/), { target: { value: "ОРЕЛ" } });
    fireEvent.change(screen.getByLabelText("БРО"), { target: { value: "БРО-77" } });
    fireEvent.change(screen.getByLabelText("Смуга роботи"), { target: { value: "СМУГА ЗАХІД" } });
    fireEvent.change(screen.getByLabelText("Населений пункт / район"), { target: { value: "ЛІСОВЕ" } });
    fireEvent.change(screen.getByLabelText(/^Координати MGRS/), { target: { value: "36U UV 12000 67000" } });
    fireEvent.change(screen.getByLabelText("Придатні БпЛА / БпАК"), { target: { value: "SHARK" } });
    fireEvent.change(screen.getByLabelText("Час події"), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText("Дата завершення групи"), { target: { value: currentIsoDate() } });
    fireEvent.change(screen.getByLabelText("Час завершення групи"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /ПЕТРЕНКО Петро Петрович/ }));
    fireEvent.click(screen.getByRole("button", { name: "Розпочати роботи" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("delete_position", { positionId: 77 }));
  });
});
