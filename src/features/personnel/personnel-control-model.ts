import type { PersonnelControlDraft, PersonnelControlRecord } from "./types";

export const MANUAL_PERSONNEL_LOCATIONS = ["НАВЧ", "ВІДР", "ЛІК"] as const;

export const PERSONNEL_CONTROL_TAB_ORDER = [
  "На позиції",
  "Реко та облаштування",
  "ПУ",
  "ШТАБ",
  "УПР",
  "КСП Роти",
  "ЗАБ",
  "ОХ",
  "ЗХВ",
  "ВІДП",
  "НАВЧ",
  "ВІДР",
  "ЛІК",
  "Відкомандировані",
  "ОХП",
  "Прикомандирований",
  "СЗЧ",
  "ПТЗ Новостав",
  "Логістика на позиції",
  "Не вказано",
] as const;

export function todayLocal(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function controlTab(record: PersonnelControlRecord) {
  return record.tab.trim() || record.locationType.trim() || "Не вказано";
}

export function controlTabs(records: PersonnelControlRecord[]) {
  const values = new Set(records.map(controlTab));
  const ordered = PERSONNEL_CONTROL_TAB_ORDER.filter((tab) => values.has(tab));
  const known = new Set<string>(PERSONNEL_CONTROL_TAB_ORDER);
  const remaining = [...values].filter((tab) => !known.has(tab)).sort((left, right) => left.localeCompare(right, "uk"));
  return [...ordered, ...remaining];
}

export function validatePersonnelControlDraft(draft: PersonnelControlDraft) {
  const errors: Partial<Record<keyof PersonnelControlDraft, string>> = {};
  if (!draft.personnelId) errors.personnelId = "Оберіть військовослужбовця.";
  if (!MANUAL_PERSONNEL_LOCATIONS.includes(draft.locationType)) errors.locationType = "Оберіть тип перебування.";
  if (!draft.institution.trim()) errors.institution = "Вкажіть заклад або місце перебування.";
  if (!draft.startDate) errors.startDate = "Вкажіть дату початку.";
  else if (draft.startDate > todayLocal()) errors.startDate = "Дата початку не може бути пізніше за сьогодні.";
  if (draft.locationType === "НАВЧ" && !draft.endDate) errors.endDate = "Для навчання вкажіть дату завершення.";
  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) errors.endDate = "Дата завершення не може бути раніше початку.";
  else if (draft.endDate && draft.endDate < todayLocal()) errors.endDate = "Активний запис не може завершуватися раніше за сьогодні.";
  return errors;
}

export function controlPeriod(record: PersonnelControlRecord) {
  if (!record.startDate && !record.endDate) return "Поточний стан";
  if (record.untilSeparateOrder) return `з ${formatControlDate(record.startDate)} · до окремого розпорядження`;
  if (!record.endDate) return `з ${formatControlDate(record.startDate)}`;
  return `${formatControlDate(record.startDate)} — ${formatControlDate(record.endDate)}`;
}

export function formatControlDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || "—";
}

export function formatControlDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/u.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}` : formatControlDate(value);
}
