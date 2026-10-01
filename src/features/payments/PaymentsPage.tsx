import { save } from "@tauri-apps/plugin-dialog";
import { Check, CircleOff, FileText, MapPin, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { personnelService } from "../../shared/services/personnelService";
import type { Person } from "../../shared/types/domain";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { formatIsoMonth, MonthNavigator } from "../../shared/ui/MonthNavigator";
import { settingsService } from "../settings/services/settingsService";
import { paymentsService, type PaymentDailyStatus, type PaymentManualStatus, type PaymentReportKind } from "./paymentsService";

const PAGE_SIZE = 100;
const currentIsoMonth = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };
const statusKey = (personnelId: number, date: string) => `${personnelId}:${date}`;
const isoDate = (month: string, day: number) => `${month}-${String(day).padStart(2, "0")}`;
const manualStatuses: Array<{ value: PaymentManualStatus; label: string; hint: string; icon?: "empty" }> = [
  { value: "БР", label: "БР", hint: "база 100 тис." },
  { value: "БР30", label: "БР", hint: "база 30 тис." },
  { value: "30Б", label: "30Б", hint: "база 10 тис." },
  { value: "30", label: "30", hint: "база 30 тис." },
  { value: "ПУСТО", label: "Порожньо", hint: "без нарахування", icon: "empty" },
];

const manualStatusLabel = (status: PaymentManualStatus) => status === "ПУСТО" ? "порожньо" : status === "БР30" ? "БР · база 30 тис." : status;
const safeFileNamePart = (value: string) => value.trim().replace(/[<>:"/\\|?*]/gu, "_").replace(/\s+/gu, " ");
const reportOptions: Array<{ kind: PaymentReportKind; title: string; description: string; fileName: (month: string, unitShortName: string) => string }> = [
  { kind: "duty", title: "Рапорт на ДВ", description: "Виплати за 100 та 30 тис., ненарахування й прикомандировані", fileName: (month, unitShortName) => `Рапорт на ДВ ${safeFileNamePart(unitShortName) || "Підрозділ"} ${month}.xlsx` },
  { kind: "tenK", title: "Рапорт 10к", description: "Виплати за 10 тис. та ненарахування", fileName: (month, unitShortName) => `Рапорт 10к ${month} ${safeFileNamePart(unitShortName) || "Підрозділ"}.xlsx` },
];

async function loadAllPersonnel() {
  const people: Person[] = [];
  let offset = 0;
  while (true) {
    const page = await personnelService.list(offset, PAGE_SIZE);
    people.push(...page.items.filter((person) => !people.some((saved) => saved.id === person.id)));
    offset += page.items.length;
    if (!page.items.length || offset >= page.totalCount) break;
  }
  return people;
}

const statusMap = (items: PaymentDailyStatus[]) => Object.fromEntries(items.map((item) => [statusKey(item.personnelId, item.statusDate), item]));

type ActiveCell = { key: string; keys: string[]; personId: number; personName: string; statuses: PaymentDailyStatus[]; status: PaymentDailyStatus; anchor: HTMLButtonElement };
type DragSelection = { person: Person; startDay: number; currentDay: number; anchor: HTMLButtonElement };
type PopoverPosition = { top: number; left: number };

const POPOVER_MARGIN = 12;
const POPOVER_GAP = 8;

function popoverPosition(anchor: HTMLButtonElement, popover?: HTMLDivElement | null): PopoverPosition {
  if (typeof window === "undefined") return { top: POPOVER_MARGIN, left: POPOVER_MARGIN };
  const anchorRect = anchor.getBoundingClientRect();
  const popoverRect = popover?.getBoundingClientRect();
  const availableWidth = Math.max(0, window.innerWidth - (POPOVER_MARGIN * 2));
  const availableHeight = Math.max(0, window.innerHeight - (POPOVER_MARGIN * 2));
  const width = Math.min(popoverRect?.width || 460, availableWidth);
  const height = Math.min(popoverRect?.height || 380, availableHeight);
  const maximumLeft = Math.max(POPOVER_MARGIN, window.innerWidth - width - POPOVER_MARGIN);
  const left = Math.max(POPOVER_MARGIN, Math.min(anchorRect.left, maximumLeft));
  const spaceBelow = window.innerHeight - anchorRect.bottom - POPOVER_MARGIN;
  const spaceAbove = anchorRect.top - POPOVER_MARGIN;
  const desiredTop = spaceBelow >= height || spaceBelow >= spaceAbove
    ? anchorRect.bottom + POPOVER_GAP
    : anchorRect.top - height - POPOVER_GAP;
  const maximumTop = Math.max(POPOVER_MARGIN, window.innerHeight - height - POPOVER_MARGIN);
  return { top: Math.max(POPOVER_MARGIN, Math.min(desiredTop, maximumTop)), left };
}

function CellPopover({ active, pending, onClose, onChange }: { active: ActiveCell; pending: boolean; onClose: () => void; onChange: (status: PaymentManualStatus | "") => Promise<void> }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [position, setPosition] = useState<PopoverPosition>(() => popoverPosition(active.anchor));
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const restoreTarget = active.anchor;
    ref.current?.querySelector<HTMLButtonElement>(".payment-cell-popover__actions button:not(:disabled), .payment-cell-popover__auto:not(:disabled)")?.focus();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && !ref.current?.contains(target) && !(target instanceof Element && target.closest(`[data-payment-key="${active.key}"]`))) onCloseRef.current();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      if (restoreTarget.isConnected) restoreTarget.focus({ preventScroll: true });
    };
  }, [active.anchor, active.key]);
  useLayoutEffect(() => {
    const reposition = () => {
      if (!active.anchor.isConnected) { onCloseRef.current(); return; }
      setPosition(popoverPosition(active.anchor, ref.current));
    };
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [active.anchor, active.key, active.status]);
  const firstDate = active.statuses[0]?.statusDate ?? active.status.statusDate;
  const lastDate = active.statuses[active.statuses.length - 1]?.statusDate ?? firstDate;
  const dateLabel = active.statuses.length === 1 ? firstDate.split("-").reverse().join(".") : `${firstDate.split("-").reverse().join(".")} — ${lastDate.split("-").reverse().join(".")} · ${active.statuses.length} днів`;
  const commonOverride = active.statuses.every((item) => item.manualOverride === active.statuses[0]?.manualOverride) ? active.statuses[0]?.manualOverride : null;
  const content = <div ref={ref} className="payment-cell-popover" role="dialog" aria-label={active.statuses.length === 1 ? `Облік за ${firstDate}` : `Облік за ${firstDate} — ${lastDate}`} style={position}>
    <header><div><b>{active.personName}</b><span>{dateLabel}</span></div>{active.statuses.length === 1 && <span className={`payment-status-badge tone-${active.status.tone}`}>{active.status.status || "Порожньо"}</span>}</header>
    {active.statuses.length === 1 ? <section className="payment-cell-popover__fact"><MapPin /><div><span>Фактичний стан</span><b>{active.status.actualLocation || "Даних немає"}</b><small>{active.status.sourceDetails || "За цей день джерело не зафіксовано."}</small></div></section> : <section className="payment-cell-popover__fact"><MapPin /><div><span>Групова зміна</span><b>Обрано {active.statuses.length} днів в одному рядку</b><small>Встановлений статус застосовується до всіх обраних днів. Фактичні дані кожного дня залишаться без змін.</small></div></section>}
    {active.statuses.length === 1 && active.status.manualOverride && <p className="payment-cell-popover__override">Вручну встановлено: <b>{manualStatusLabel(active.status.manualOverride)}</b>. Фактичний стан вище збережено без змін.</p>}
    <div className="payment-cell-popover__actions" role="group" aria-label="Встановити статус вручну">
      {manualStatuses.map((option) => <button type="button" key={option.value} className={`${option.icon ? "is-empty" : ""} ${commonOverride === option.value ? "active" : ""}`.trim()} aria-label={option.icon ? "Залишити клітинку порожньою" : undefined} aria-pressed={commonOverride === option.value} disabled={pending} onClick={() => void onChange(option.value)}>{option.icon ? <CircleOff /> : <span>{option.label}</span>}<small>{option.hint}</small>{commonOverride === option.value && <Check className="payment-action-check" />}</button>)}
    </div>
    <button type="button" className="payment-cell-popover__auto" disabled={pending || (active.statuses.length === 1 && !active.status.manualOverride)} onClick={() => void onChange("")}><RotateCcw />Автоматичний розрахунок</button>
  </div>;
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}

export function PaymentsPage() {
  const { notify } = useNotifications();
  const [people, setPeople] = useState<Person[]>([]);
  const [statuses, setStatuses] = useState<Record<string, PaymentDailyStatus>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [unitShortName, setUnitShortName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(currentIsoMonth);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [rangePreview, setRangePreview] = useState<{ personnelId: number; startDay: number; endDay: number } | null>(null);
  const dragSelection = useRef<DragSelection | null>(null);
  const suppressPointerClick = useRef(false);
  const requestId = useRef(0);
  const selectedMonthRef = useRef(selectedMonth);
  const highlightedColumn = useRef<{ column: HTMLTableColElement; header: HTMLTableCellElement | null } | null>(null);
  const month = useMemo(() => { const [year, monthNumber] = selectedMonth.split("-").map(Number); return new Date(year, monthNumber - 1, 1); }, [selectedMonth]);
  const days = useMemo(() => Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, index) => index + 1), [month]);
  const monthLabel = formatIsoMonth(selectedMonth);

  useEffect(() => {
    let active = true;
    void loadAllPersonnel().then((items) => { if (active) setPeople(items); }).catch(() => { if (active) setPeopleError("Не вдалося завантажити особовий склад."); }).finally(() => { if (active) setLoadingPeople(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void settingsService.get().then((settings) => { if (active) setUnitShortName(settings.unit.shortName); }).catch(() => undefined).finally(() => { if (active) setLoadingSettings(false); });
    return () => { active = false; };
  }, []);

  const loadStatuses = useCallback(async (monthValue: string, currentRequest: number) => {
    const items = await paymentsService.list(monthValue);
    if (requestId.current === currentRequest) setStatuses(statusMap(items));
    return items;
  }, []);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setLoadingStatuses(true);
    setStatusError("");
    setStatuses({});
    setActiveCell(null);
    void loadStatuses(selectedMonth, currentRequest).catch(() => {
      if (requestId.current !== currentRequest) return;
      setStatuses({});
      setStatusError("Не вдалося розрахувати виплати.");
    }).finally(() => { if (requestId.current === currentRequest) setLoadingStatuses(false); });
  }, [loadStatuses, selectedMonth]);

  const openCell = useCallback((anchor: HTMLButtonElement, person: Person, selectedStatuses: PaymentDailyStatus[]) => {
    const ordered = [...selectedStatuses].sort((left, right) => left.statusDate.localeCompare(right.statusDate));
    const status = ordered[0];
    if (!status) return;
    const keys = ordered.map((item) => statusKey(person.id, item.statusDate));
    setActiveCell({ key: keys[0], keys, personId: person.id, personName: person.fullName, statuses: ordered, status, anchor });
  }, []);

  const updateStatus = useCallback(async (personnelId: number, dates: string[], status: PaymentManualStatus | "") => {
    const keys = dates.map((date) => statusKey(personnelId, date));
    const mutationMonth = dates[0]?.slice(0, 7) ?? "";
    if (!mutationMonth) return;
    setPending((current) => new Set([...current, ...keys]));
    try {
      if (dates.length === 1) await paymentsService.save(personnelId, dates[0], status);
      else await paymentsService.saveRange(personnelId, dates, status);
      if (selectedMonthRef.current !== mutationMonth) return;
      const currentRequest = ++requestId.current;
      setLoadingStatuses(true);
      setStatusError("");
      setStatuses({});
      try {
        const items = await loadStatuses(mutationMonth, currentRequest);
        if (requestId.current === currentRequest) {
          if (dates.length > 1) setActiveCell(null);
          else {
            const updated = items.find((item) => item.personnelId === personnelId && item.statusDate === dates[0]);
            if (updated) setActiveCell((current) => current?.keys.includes(keys[0]) ? { ...current, status: updated, statuses: [updated] } : current);
          }
        }
      } catch {
        if (requestId.current === currentRequest) {
          setStatuses({});
          setStatusError("Не вдалося оновити розрахунок виплат після збереження.");
          setActiveCell(null);
        }
      } finally {
        if (requestId.current === currentRequest) setLoadingStatuses(false);
      }
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : "Не вдалося зберегти ручне уточнення.", "error");
    } finally {
      setPending((current) => { const next = new Set(current); keys.forEach((key) => next.delete(key)); return next; });
    }
  }, [loadStatuses, notify]);

  useEffect(() => {
    const finishSelection = () => {
      const drag = dragSelection.current;
      if (!drag) return;
      const start = Math.min(drag.startDay, drag.currentDay);
      const end = Math.max(drag.startDay, drag.currentDay);
      const selected = Array.from({ length: end - start + 1 }, (_, index) => statuses[statusKey(drag.person.id, isoDate(selectedMonthRef.current, start + index))]).filter((item): item is PaymentDailyStatus => Boolean(item));
      dragSelection.current = null;
      setRangePreview(null);
      suppressPointerClick.current = true;
      window.setTimeout(() => { suppressPointerClick.current = false; }, 0);
      if (selected.length) openCell(drag.anchor, drag.person, selected);
    };
    const cancelSelection = () => {
      if (!dragSelection.current) return;
      dragSelection.current = null;
      setRangePreview(null);
    };
    document.addEventListener("mouseup", finishSelection);
    window.addEventListener("blur", cancelSelection);
    return () => {
      document.removeEventListener("mouseup", finishSelection);
      window.removeEventListener("blur", cancelSelection);
    };
  }, [openCell, statuses]);

  const beginRange = useCallback((event: React.MouseEvent<HTMLButtonElement>, person: Person, day: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setActiveCell(null);
    dragSelection.current = { person, startDay: day, currentDay: day, anchor: event.currentTarget };
    setRangePreview({ personnelId: person.id, startDay: day, endDay: day });
  }, []);

  const extendRange = useCallback((event: React.MouseEvent<HTMLButtonElement>, person: Person, day: number) => {
    const drag = dragSelection.current;
    if (!drag || drag.person.id !== person.id || event.buttons !== 1) return;
    drag.currentDay = day;
    drag.anchor = event.currentTarget;
    setRangePreview({ personnelId: person.id, startDay: Math.min(drag.startDay, day), endDay: Math.max(drag.startDay, day) });
  }, []);

  const exportReport = useCallback(async (reportKind: PaymentReportKind) => {
    const option = reportOptions.find((item) => item.kind === reportKind);
    if (!option) return;
    setExportMenuOpen(false);
    try {
      const selected = await save({ title: `Зберегти: ${option.title}`, defaultPath: option.fileName(monthLabel, unitShortName), filters: [{ name: "Таблиця Excel", extensions: ["xlsx"] }] });
      if (!selected) return;
      const path = selected.toLowerCase().endsWith(".xlsx") ? selected : `${selected}.xlsx`;
      setExporting(true);
      await paymentsService.exportReport(selectedMonth, path, reportKind);
      notify(`${option.title} сформовано.`, "success");
    }
    catch (exportError) { notify(exportError instanceof Error ? exportError.message : "Не вдалося сформувати рапорт.", "error"); }
    finally { setExporting(false); }
  }, [monthLabel, notify, selectedMonth, unitShortName]);

  const clearColumnHighlight = useCallback(() => {
    highlightedColumn.current?.column.classList.remove("is-hovered");
    highlightedColumn.current?.header?.classList.remove("is-column-highlighted");
    highlightedColumn.current = null;
  }, []);

  const highlightColumn = useCallback((event: React.PointerEvent<HTMLTableElement>) => {
    const target = event.target instanceof Element ? event.target.closest("td") : null;
    if (!(target instanceof HTMLTableCellElement) || !event.currentTarget.contains(target)) return;
    const column = event.currentTarget.querySelectorAll<HTMLTableColElement>("col").item(target.cellIndex);
    if (!column || highlightedColumn.current?.column === column) return;
    clearColumnHighlight();
    const header = event.currentTarget.tHead?.rows.item(0)?.cells.item(target.cellIndex) ?? null;
    column.classList.add("is-hovered");
    header?.classList.add("is-column-highlighted");
    highlightedColumn.current = { column, header };
  }, [clearColumnHighlight]);

  const changeSelectedMonth = useCallback((value: string) => {
    selectedMonthRef.current = value;
    setSelectedMonth(value);
  }, []);
  const loading = loadingPeople || loadingStatuses || loadingSettings;
  return <PageFrame className="payments-page" header={<PageTitle title="Виплати" subtitle={`Таблиця за ${monthLabel}`} actions={<button type="button" className="button primary" disabled={loading || exporting || pending.size > 0 || people.length === 0 || Boolean(peopleError || statusError)} onClick={() => setExportMenuOpen(true)}><FileText />{exporting ? "Формування…" : "Сформувати рапорт"}</button>} />} tools={<MonthNavigator value={selectedMonth} max={currentIsoMonth()} onChange={changeSelectedMonth} ariaLabel="Місяць виплат" />}>
    <section className="panel payments-table" aria-label={`Виплати за ${monthLabel}`} aria-busy={loading}>
      <div className="payments-table__scroll" onScroll={() => setActiveCell(null)}><table onPointerOver={highlightColumn} onPointerLeave={clearColumnHighlight}><colgroup><col className="payment-person-column" />{days.map((day) => <col className="payment-day-column" key={day} />)}</colgroup><thead><tr><th>Військовослужбовці</th>{days.map((day) => <th key={day} title={`${String(day).padStart(2, "0")}.${String(month.getMonth() + 1).padStart(2, "0")}.${month.getFullYear()}`}>{day}</th>)}</tr></thead><tbody>{people.map((person) => <tr key={person.id}><th scope="row"><b>{person.fullName}</b><span>{[person.rank, person.position].filter(Boolean).join(" · ")}</span></th>{days.map((day) => {
        const date = isoDate(selectedMonth, day);
        const key = statusKey(person.id, date);
        const item = statuses[key];
        const visibleStatus = item?.status || "";
        const accessibleStatus = item ? visibleStatus || "порожньо" : "дані недоступні";
        const unavailable = !item || Boolean(statusError);
        const rangeSelected = rangePreview?.personnelId === person.id && day >= rangePreview.startDay && day <= rangePreview.endDay;
        const activeSelected = activeCell?.keys.includes(key) ?? false;
        return <td key={day} className={`tone-${item?.tone ?? "empty"} ${item?.manualOverride ? "is-manual" : ""} ${rangeSelected || activeSelected ? "is-range-selected" : ""}`.trim()}><button type="button" data-payment-key={key} aria-label={`${person.fullName}, ${day} число: ${accessibleStatus}`} aria-haspopup="dialog" aria-expanded={activeSelected} disabled={loadingStatuses || unavailable || pending.has(key)} onMouseDown={item ? (event) => beginRange(event, person, day) : undefined} onMouseEnter={item ? (event) => extendRange(event, person, day) : undefined} onClick={item ? (event) => { if (suppressPointerClick.current) { event.preventDefault(); return; } openCell(event.currentTarget, person, [item]); } : undefined}>{visibleStatus}{item?.manualOverride && visibleStatus && <i>•</i>}</button></td>;
      })}</tr>)}</tbody></table>{loadingPeople && <div className="payments-table__state">Завантаження особового складу…</div>}{!loadingPeople && loadingStatuses && people.length > 0 && <div className="payments-table__state">Розрахунок виплат…</div>}{!loadingPeople && peopleError && <div className="payments-table__state is-error">{peopleError}</div>}{!loadingStatuses && statusError && <div className="payments-table__state is-error">{statusError}</div>}{!loading && !peopleError && !statusError && people.length === 0 && <div className="payments-table__state">В особовому складі ще немає записів.</div>}</div>
    </section>
    {activeCell && <CellPopover active={activeCell} pending={activeCell.keys.some((key) => pending.has(key))} onClose={() => setActiveCell(null)} onChange={(status) => updateStatus(activeCell.personId, activeCell.statuses.map((item) => item.statusDate), status)} />}
    {exportMenuOpen && <Modal title="Сформувати рапорт" subtitle={monthLabel} onClose={() => setExportMenuOpen(false)} className="payments-export-modal"><div className="payments-export-options">{reportOptions.map((option) => <button type="button" key={option.kind} onClick={() => void exportReport(option.kind)}><FileText /><span><b>{option.title}</b><small>{option.description}</small></span></button>)}</div></Modal>}
  </PageFrame>;
}
