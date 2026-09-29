import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  max?: string;
  ariaLabel?: string;
};

const monthFormatter = new Intl.DateTimeFormat("uk-UA", { month: "long" });

export function shiftIsoMonth(value: string, months: number) {
  if (!/^\d{4}-\d{2}$/u.test(value)) return value;
  const [year, month] = value.split("-").map(Number);
  const shifted = new Date(year, month - 1 + months, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

export function formatIsoMonth(value: string) {
  if (!/^\d{4}-\d{2}$/u.test(value)) return value;
  const [year, month] = value.split("-").map(Number);
  const label = `${monthFormatter.format(new Date(year, month - 1, 1))} ${year}`;
  return label.replace(/^./u, (letter) => letter.toLocaleUpperCase("uk"));
}

export function MonthNavigator({ value, onChange, max, ariaLabel = "Вибір місяця" }: Props) {
  const nextMonth = shiftIsoMonth(value, 1);
  return <div className="date-navigator month-navigator" role="group" aria-label={ariaLabel}>
    <button type="button" className="icon-button" aria-label="Попередній місяць" onClick={() => onChange(shiftIsoMonth(value, -1))}><ChevronLeft /></button>
    <div className="date-navigator__field month-navigator__field"><CalendarDays /><span>Місяць</span><strong>{formatIsoMonth(value)}</strong></div>
    <button type="button" className="icon-button" aria-label="Наступний місяць" disabled={Boolean(max && nextMonth > max)} onClick={() => onChange(nextMonth)}><ChevronRight /></button>
  </div>;
}
