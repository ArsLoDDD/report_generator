import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProgramGuidePage } from "./ProgramGuidePage";
import { guideTopics } from "./program-guide-content";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "#");
});

const topicText = (id: string) => {
  const topic = guideTopics.find((item) => item.id === id);
  if (!topic) throw new Error(`Unknown guide topic: ${id}`);
  return [topic.summary, ...topic.steps, ...(topic.receives ?? []), ...(topic.sends ?? []), ...(topic.rules ?? [])].join(" ");
};

describe("Довідник", () => {
  it("covers the complete work cycle and explains the data connections", () => {
    render(<ProgramGuidePage />);

    expect(screen.getByRole("heading", { name: "Як працювати з програмою", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Швидкий старт", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Як інформація проходить через програму", level: 2 })).toBeInTheDocument();
    ["personnel", "staffing-bcs", "flight-plan", "flight-journal", "incidents", "summary-report", "assets", "warnings"].forEach((id) => expect(document.getElementById(`guide-${id}`)).toBeInTheDocument());
    expect(screen.getByText(/Дані й документи залишаються на цьому комп’ютері/)).toBeInTheDocument();
    expect(screen.getAllByText("Бере дані з").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Передає дані в").length).toBeGreaterThan(0);
  });

  it("requires every search word and understands synonyms and a common typo", async () => {
    render(<ProgramGuidePage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Знайти відповідь у довіднику…" }), { target: { value: "інцедент екіпаж" } });

    await waitFor(() => expect(document.getElementById("guide-incidents")).toBeInTheDocument());
    expect(document.getElementById("guide-weapons-workshop")).not.toBeInTheDocument();
  });

  it("lets a user collapse a result while search is active", async () => {
    render(<ProgramGuidePage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Знайти відповідь у довіднику…" }), { target: { value: "Цукерня" } });

    const toggle = await screen.findByRole("button", { name: /Зброя, БК, вибухові матеріали та Цукерня/ });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByRole("region", { name: "Зброя, БК, вибухові матеріали та Цукерня" })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Зброя, БК, вибухові матеріали та Цукерня" })).not.toBeInTheDocument();
  });

  it("uses headings, labelled regions and focusable hash navigation", async () => {
    render(<ProgramGuidePage />);
    const article = document.getElementById("guide-flight-plan") as HTMLElement;
    expect(within(article).getByRole("heading", { name: "План польотів", level: 3 })).toBeInTheDocument();
    expect(within(article).getByRole("region", { name: "План польотів" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Кастомні поля" }));
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("guide-toggle-custom-fields")));
    expect(window.location.hash).toBe("#guide-custom-fields");
  });

  it("documents destructive imports, exact plan checks and irreversible field deletion", () => {
    expect(topicText("settings-backup")).toMatch(/«Замінити базу даних».+видаляє інциденти, позиції, майно, автомобілі, екіпажі, особовий склад і визначення кастомних полів/u);
    expect(topicText("settings-backup")).toMatch(/«Доповнити базу даних» додає нові записи, але не оновлює наявні дублікати/u);
    expect(topicText("custom-fields")).toMatch(/безповоротно видаляє його значення для всіх записів/u);
    expect(topicText("custom-fields")).toMatch(/починатися з малої латинської літери.+a–z, цифри або знак підкреслення/u);
    expect(topicText("flight-plan")).toMatch(/Чернетка автоматично зберігається.+коректний графік переходів/u);
    expect(topicText("flight-plan")).toMatch(/експорт.+додатково перевіряє позивні, маршрут, район, висоту та робочі години/ui);
  });

  it("explains official crew grouping and composed BCS notes", () => {
    expect(topicText("staffing-bcs")).toMatch(/лише з офіційного складу/u);
    expect(topicText("staffing-bcs")).toMatch(/Працює в екіпажі НАЗВА/u);
    expect(topicText("staffing-bcs")).toMatch(/ТВО.+до примітки.+не змінюючи штатну посаду/u);
    expect(topicText("staffing-bcs")).toMatch(/незалежні модифікатори через кому/u);
  });

  it("explains automatic position-work rotation and incident titles", () => {
    expect(topicText("position-work")).toMatch(/два неперетинні періоди.+основна робота та охорона/u);
    expect(topicText("position-work")).toMatch(/«ЗБЗ» чи «ПБЗ»/u);
    expect(topicText("incidents")).toMatch(/Тип інциденту - ПРІЗВИЩЕ І\.П\. - дата/u);
  });

  it("distinguishes snapshots, current drafts, static DOCX files and planned features", () => {
    expect(topicText("rotation")).toContain("Окремого незмінного журналу історії переходів у програмі зараз немає.");
    expect(topicText("summary-report")).toMatch(/одну поточну чернетку.+не створює історію ревізій/u);
    expect(topicText("summary-report")).toMatch(/Експортований DOCX.+сам не оновлюється/u);
    expect(topicText("generated-reports")).toMatch(/видаляє сам DOCX-файл без можливості відновлення/u);
    expect(topicText("planned-features")).toMatch(/заплановано/u);
  });

  it("documents automatic migrations and backward-compatible imports", () => {
    expect(topicText("updates-compatibility")).toMatch(/автоматично додає.+таблиці й колонки/u);
    expect(topicText("updates-compatibility")).toMatch(/старий Excel-файл.+безпечне початкове значення/u);
    expect(topicText("updates-compatibility")).toMatch(/чернетки й знімки.+актуальний формат/u);
    expect(topicText("updates-compatibility")).toMatch(/не повинно вимагати чистої бази даних/u);
  });
});
