import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export type DateNavigatorShortcut = {
  label: string;
  value: string;
};

type DateNavigatorProps = {
  ariaLabel: string;
  dateLabel: string;
  value: string;
  onChange: (value: string) => void | Promise<void>;
  min?: string;
  max?: string;
  disabled?: boolean;
  shortcuts?: DateNavigatorShortcut[];
  allTime?: {
    active: boolean;
    label?: string;
    onSelect: () => void;
  };
  className?: string;
};

export const shiftIsoDate = (value: string, days: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(year, month - 1, day + days);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
};

export function DateNavigator({
  ariaLabel,
  dateLabel,
  value,
  onChange,
  min,
  max,
  disabled = false,
  shortcuts = [],
  allTime,
  className = "",
}: DateNavigatorProps) {
  const selectDate = (nextValue: string) => { void onChange(nextValue); };
  const previousDisabled = disabled || Boolean(min && value <= min);
  const nextDisabled = disabled || Boolean(max && value >= max);

  return <div className={`date-navigator ${className}`.trim()} role="group" aria-label={ariaLabel}>
    <button type="button" className="icon-button" aria-label="Попередній день" disabled={previousDisabled} onClick={() => selectDate(shiftIsoDate(value, -1))}><ChevronLeft /></button>
    <label className="date-navigator__field"><CalendarDays /><span>{dateLabel}</span><input aria-label={dateLabel} type="date" min={min} max={max} value={value} disabled={disabled} onChange={(event) => selectDate(event.target.value)} /></label>
    <button type="button" className="icon-button" aria-label="Наступний день" disabled={nextDisabled} onClick={() => selectDate(shiftIsoDate(value, 1))}><ChevronRight /></button>
    {shortcuts.map((shortcut) => <button key={`${shortcut.label}:${shortcut.value}`} type="button" className="button compact" disabled={disabled || (!allTime?.active && value === shortcut.value)} onClick={() => selectDate(shortcut.value)}>{shortcut.label}</button>)}
    {allTime && <button type="button" className={`button compact${allTime.active ? " active" : ""}`} aria-pressed={allTime.active} disabled={disabled} onClick={allTime.onSelect}>{allTime.label ?? "За весь час"}</button>}
  </div>;
}
