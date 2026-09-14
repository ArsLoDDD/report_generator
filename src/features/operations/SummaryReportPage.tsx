import { renderAsync } from "docx-preview";
import { save } from "@tauri-apps/plugin-dialog";
import { FileOutput, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings } from "../../shared/types/domain";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { settingsService } from "../settings/services/settingsService";
import { operationsService } from "./services/operationsService";
import { summaryReportService } from "./services/summaryReportService";
import { buildSummaryDocument, canOpenNextReport, carryForwardSummary, defaultSummaryManual, displayDate, initialReportDate, shiftDate, type SummaryManual, type SummaryTextItem } from "./summary-report-model";
import type { Crew, FlightJournalEntry, FlightPlanRequest, Position } from "./types";

const parseDraft = (value: string | null): SummaryManual | null => { try { return value ? { ...defaultSummaryManual(), ...JSON.parse(value) as SummaryManual } : null; } catch { return null; } };
const blankSettings = (): AppSettings => ({ mainSigner: { fullName: "", rank: "", position: "" }, commander: { fullName: "", rank: "", position: "" }, chief: { fullName: "", rank: "", position: "" }, deputyPpp: { fullName: "", rank: "", position: "" }, deputyArmament: { fullName: "", rank: "", position: "" }, deputyRear: { fullName: "", rank: "", position: "" }, fuelChief: { fullName: "", rank: "", position: "" }, signerRoles: [], unit: { kind: "Інше", shortName: "", authorizedStrength: 0 } });
const parseSnapshot = (value: string | null): FlightPlanRequest | null => { try { return value ? JSON.parse(value) as FlightPlanRequest : null; } catch { return null; } };

function ItemEditor({ title, items, onChange }: { title: string; items: SummaryTextItem[]; onChange: (items: SummaryTextItem[]) => void }) {
  return <section className="summary-editor-block"><header><b>{title}</b><button className="icon-button" aria-label={`Додати: ${title}`} onClick={() => onChange([...items, { id: crypto.randomUUID(), text: "" }])}><Plus /></button></header>{items.length ? items.map((item) => <div className="summary-object" key={item.id}><textarea value={item.text} onChange={(event) => onChange(items.map((value) => value.id === item.id ? { ...value, text: event.target.value } : value))} /><button className="icon-button danger" aria-label="Видалити" onClick={() => onChange(items.filter((value) => value.id !== item.id))}><Trash2 /></button></div>) : <small>Об’єктів немає. Додайте за потреби.</small>}</section>;
}

function NumberGrid({ title, values, labels, onChange }: { title: string; values: Record<string, string>; labels: Array<[string, string]>; onChange: (value: Record<string, string>) => void }) {
  return <section className="summary-editor-block"><header><b>{title}</b></header><div className="summary-number-grid">{labels.map(([key, label]) => <label className="form-field" key={key}><span>{label}</span><input inputMode="numeric" value={values[key] ?? ""} onChange={(event) => onChange({ ...values, [key]: event.target.value.replace(/[^0-9]/gu, "") })} /></label>)}</div></section>;
}

function AutoEditor({ title, field, automatic, manual, onChange, onBaseline }: { title: string; field: string; automatic: string; manual: SummaryManual; onChange: (value: Record<string, string>) => void; onBaseline: (value: Record<string, string>) => void }) {
  const override = manual.autoOverrides[field];
  const sourceChanged = override !== undefined && manual.autoBaselines[field] !== undefined && manual.autoBaselines[field] !== automatic;
  const reset = () => { const overrides = { ...manual.autoOverrides }; const baselines = { ...manual.autoBaselines }; delete overrides[field]; delete baselines[field]; onChange(overrides); onBaseline(baselines); };
  return <section className="summary-editor-block"><header><b>{title}</b><span className="source-badge">автоматично</span></header>{sourceChanged && <div className="summary-source-change"><b>Дані у джерелах змінилися</b><span>Оберіть, що залишити в донесенні.</span><div><button className="button" onClick={() => onBaseline({ ...manual.autoBaselines, [field]: automatic })}>Залишити ручний текст</button><button className="button" onClick={reset}>Оновити з джерел</button></div></div>}{override === undefined ? <><small>{automatic}</small><button className="button" onClick={() => { onChange({ ...manual.autoOverrides, [field]: automatic }); onBaseline({ ...manual.autoBaselines, [field]: automatic }); }}>Редагувати вручну</button></> : <><textarea value={override} onChange={(event) => onChange({ ...manual.autoOverrides, [field]: event.target.value })} /><button className="button" onClick={reset}>Повернути автоматичні дані</button></>}</section>;
}

export function SummaryReportPage() {
  const { notify } = useNotifications();
  const [reportDate, setReportDate] = useState(initialReportDate);
  const [manual, setManual] = useState<SummaryManual>(defaultSummaryManual);
  const [settings, setSettings] = useState<AppSettings>(blankSettings);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [journal, setJournal] = useState<FlightJournalEntry[]>([]);
  const [snapshots, setSnapshots] = useState<Array<FlightPlanRequest | null>>([]);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [lastPath, setLastPath] = useState("");
  const [, setClock] = useState(() => Date.now());
  const previewRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (date = reportDate) => {
    try {
      const [draft, nextSettings, nextCrews, nextPositions, nextJournal, previousSnapshot, currentSnapshot] = await Promise.all([summaryReportService.loadDraft(date), settingsService.get(), operationsService.listCrews(), operationsService.listPositions(), operationsService.listFlightJournalEntries(), operationsService.getFlightPlanSnapshot(shiftDate(date, -1)), operationsService.getFlightPlanSnapshot(date)]);
      setSettings(nextSettings); setCrews(nextCrews); setPositions(nextPositions); setJournal(nextJournal); setSnapshots([parseSnapshot(previousSnapshot), parseSnapshot(currentSnapshot)]);
      setManual(parseDraft(draft.current) ?? carryForwardSummary(parseDraft(draft.previous)));
      setReady(true);
    } catch { notify("Не вдалося завантажити підсумкове донесення.", "error"); }
  }, [notify, reportDate]);
  useEffect(() => { setReady(false); void load(reportDate); }, [load, reportDate]);
  useEffect(() => { const refresh = () => { if (document.visibilityState === "visible") void load(reportDate); }; window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, [load, reportDate]);
  useEffect(() => { const timer = window.setInterval(() => { const now = new Date(); setClock(now.getTime()); const automaticDate = initialReportDate(now); if (automaticDate > reportDate) setReportDate(automaticDate); }, 60_000); return () => window.clearInterval(timer); }, [reportDate]);
  useEffect(() => { if (!ready) return; const timer = window.setTimeout(() => void summaryReportService.saveDraft(reportDate, JSON.stringify(manual)).catch(() => notify("Не вдалося автоматично зберегти правки донесення.", "error")), 350); return () => window.clearTimeout(timer); }, [manual, notify, ready, reportDate]);

  const built = useMemo(() => buildSummaryDocument({ reportDate, manual, settings, crews, positions, journal, snapshots }), [crews, journal, manual, positions, reportDate, settings, snapshots]);
  useEffect(() => {
    if (!ready || !previewRef.current) return;
    let cancelled = false; const target = previewRef.current; setPreviewError("");
    const timer = window.setTimeout(() => void summaryReportService.render(built.document).then((bytes) => { if (cancelled) return; target.replaceChildren(); return renderAsync(new Blob([new Uint8Array(bytes)]), target, target, { inWrapper: true, breakPages: true, renderHeaders: true, renderFooters: true, useBase64URL: true }); }).catch(() => { if (!cancelled) setPreviewError("Не вдалося оновити перегляд документа."); }), 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [built.document, ready]);

  const patch = <K extends keyof SummaryManual>(key: K, value: SummaryManual[K]) => setManual((current) => ({ ...current, [key]: value }));
  const exportDocument = async () => {
    if (built.warnings.length) { notify("Спочатку заповніть критичні поля, перелічені над редактором.", "error"); return; }
    const shortName = settings.unit.shortName || "Підрозділ";
    const defaultPath = `Підсумкове бойове донесення_${shortName}_${displayDate(reportDate)}.docx`;
    const selected = await save({ title: "Зберегти підсумкове донесення", defaultPath, filters: [{ name: "Документ Word", extensions: ["docx"] }] });
    if (!selected) return; const path = selected.endsWith(".docx") ? selected : `${selected}.docx`;
    setExporting(true); try { await summaryReportService.saveDraft(reportDate, JSON.stringify(manual)); await summaryReportService.export(path, built.document); setLastPath(path); notify("Підсумкове донесення збережено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося створити донесення.", "error"); } finally { setExporting(false); }
  };
  const moveNext = () => setReportDate(shiftDate(reportDate, 1));

  return <PageFrame className="summary-report-page" header={<PageTitle title="Підсумкове донесення" subtitle={`Звітний період: ${displayDate(shiftDate(reportDate, -1))} 18:01 — ${displayDate(reportDate)} 18:00`} actions={<div className="summary-title-actions">{canOpenNextReport(reportDate) && <button className="button" onClick={moveNext}>Перейти до нового донесення</button>}<button className="button primary" disabled={exporting || !ready} onClick={() => void exportDocument()}><FileOutput />{exporting ? "Створення…" : "Створити підсумкове донесення"}</button></div>} />}>
    <div className="summary-report-layout">
      <section className="panel summary-preview"><header><div><b>Документ за {displayDate(reportDate)}</b><small>Перегляд змінюється разом із даними програми та ручними правками.</small></div><button className="icon-button" aria-label="Оновити" onClick={() => void load()}><RefreshCw /></button></header><div ref={previewRef} className="summary-preview__document">{previewError && <div className="empty-state">{previewError}</div>}</div></section>
      <aside className="summary-controls">
        {built.warnings.length > 0 && <section className="summary-warnings"><b>Потрібно заповнити перед створенням</b>{built.warnings.map((warning) => <span key={warning}>{warning}</span>)}</section>}
        <section className="summary-editor-block"><header><b>Параметри документа</b><span className="source-badge">вручну</span></header><label className="form-field"><span>Номер донесення</span><input value={manual.reportNumber} onChange={(event) => patch("reportNumber", event.target.value)} /></label><small>Дата: {displayDate(reportDate)} · Прим. № 1</small></section>
        <details open><summary>1. Обстановка та склад</summary><NumberGrid title="Втрати противника" values={manual.enemyLosses} onChange={(value) => patch("enemyLosses", value)} labels={[["personnel", "Особовий склад"], ["tanks", "Танки"], ["afv", "ББМ"], ["artillery", "Артсистеми"], ["uav", "БпЛА"], ["vehicles", "Автотехніка"]]} /><section className="summary-editor-block"><label className="check-row"><input type="checkbox" checked={manual.compositionOverride} onChange={(event) => patch("compositionOverride", event.target.checked)} /><span>Змінити «Без змін» вручну</span></label>{manual.compositionOverride && <textarea value={manual.compositionChanges} onChange={(event) => patch("compositionChanges", event.target.value)} />}</section><AutoEditor title="Склад і бойовий порядок" field="forceComposition" automatic={built.automatic.forceComposition} manual={manual} onChange={(value) => patch("autoOverrides", value)} onBaseline={(value) => patch("autoBaselines", value)} /><AutoEditor title="Положення підрозділів" field="positions" automatic={built.automatic.positions} manual={manual} onChange={(value) => patch("autoOverrides", value)} onBaseline={(value) => patch("autoBaselines", value)} /><section className="summary-editor-block"><header><b>Укомплектованість</b><span className="source-badge">вручну</span></header>{(["personnel", "weapons", "equipment"] as const).map((key) => <label className="form-field" key={key}><span>{key}</span><input value={manual.completeness[key]} onChange={(event) => patch("completeness", { ...manual.completeness, [key]: event.target.value })} /></label>)}</section></details>
        <details><summary>2. Дії противника</summary><section className="summary-editor-block"><div className="summary-number-grid">{(["rocketStrikes", "airStrikes", "va", "sha", "aa"] as const).map((key) => <label className="form-field" key={key}><span>{key}</span><input inputMode="numeric" value={manual[key]} onChange={(event) => patch(key, event.target.value.replace(/[^0-9]/gu, ""))} /></label>)}</div><label className="check-row"><input type="checkbox" checked={manual.enemyAssault} onChange={(event) => patch("enemyAssault", event.target.checked)} />Штурмові дії були</label>{manual.enemyAssault && <textarea value={manual.enemyAssaultText} onChange={(event) => patch("enemyAssaultText", event.target.value)} />}</section><section className="summary-editor-block"><header><b>Обстріли</b><button className="icon-button" onClick={() => patch("shellings", [...manual.shellings, { id: crypto.randomUUID(), time: "", shellingType: "", target: "", direction: "", response: "" }])}><Plus /></button></header>{manual.shellings.map((row) => <div className="summary-shelling" key={row.id}>{(["time", "shellingType", "target", "direction", "response"] as const).map((key) => <input key={key} placeholder={key} value={row[key]} onChange={(event) => patch("shellings", manual.shellings.map((item) => item.id === row.id ? { ...item, [key]: event.target.value } : item))} />)}<button className="icon-button danger" onClick={() => patch("shellings", manual.shellings.filter((item) => item.id !== row.id))}><Trash2 /></button></div>)}</section></details>
        <details><summary>3–5. Робота підрозділу</summary><div className="summary-auto-note"><span className="source-badge">план польотів</span><span className="source-badge">журнал польотів</span><span className="source-badge">ротації</span></div><section className="summary-editor-block"><label className="check-row"><input type="checkbox" checked={manual.ownAssault} onChange={(event) => patch("ownAssault", event.target.checked)} />Підрозділ проводив наступальні дії</label>{manual.ownAssault && <textarea value={manual.ownAssaultText} onChange={(event) => patch("ownAssaultText", event.target.value)} />}</section><AutoEditor title="Польоти" field="flightOperations" automatic={built.automatic.flightOperations} manual={manual} onChange={(value) => patch("autoOverrides", value)} onBaseline={(value) => patch("autoBaselines", value)} /><ItemEditor title="Чергові на пункті управління" items={manual.commandDuties} onChange={(value) => patch("commandDuties", value)} /><ItemEditor title="Склад охорони" items={manual.guardDuties} onChange={(value) => patch("guardDuties", value)} /><ItemEditor title="Додаткові події за період" items={manual.manualEvents} onChange={(value) => patch("manualEvents", value)} /><AutoEditor title="Усі події у документі" field="periodEvents" automatic={built.automatic.periodEvents} manual={manual} onChange={(value) => patch("autoOverrides", value)} onBaseline={(value) => patch("autoBaselines", value)} />{([["commissionsOverride", "commissions", "Робота комісій"], ["fortificationOverride", "fortification", "Фортифікаційне обладнання"], ["dzvinOverride", "dzvin", "АС «ДЗВІН»"]] as const).map(([toggle, field, title]) => <section className="summary-editor-block" key={field}><label className="check-row"><input type="checkbox" checked={manual[toggle]} onChange={(event) => patch(toggle, event.target.checked)} />{title}: змінити «Без змін»</label>{manual[toggle] && <textarea value={manual[field]} onChange={(event) => patch(field, event.target.value)} />}</section>)}</details>
        <details><summary>6. Завдання</summary><ItemEditor title="Завдання на наступну добу" items={manual.nextTasks} onChange={(value) => patch("nextTasks", value)} /></details>
        <details><summary>7. Втрати та витрати</summary><NumberGrid title="Втрати особового складу" values={manual.personnelLosses} onChange={(value) => patch("personnelLosses", value)} labels={[["killed", "Загинуло"], ["wounded", "Поранено"], ["missing", "Зникло"], ["captured", "Полон"], ["sick", "Захворіло"]]} /><NumberGrid title="Втрати техніки" values={manual.equipmentLosses} onChange={(value) => patch("equipmentLosses", value)} labels={[["destroyed", "Знищено"], ["damaged", "Пошкоджено"], ["lost", "Втрачено"]]} /><section className="summary-editor-block"><label className="form-field"><span>Деталі втрат техніки</span><textarea value={manual.equipmentLossesDetails} onChange={(event) => patch("equipmentLossesDetails", event.target.value)} /></label><label className="form-field"><span>Витрати боєприпасів</span><textarea value={manual.ammunitionExpenses} onChange={(event) => patch("ammunitionExpenses", event.target.value)} /></label></section></details>
        <details><summary>8. Проблемні та інші питання</summary><section className="summary-editor-block"><label className="form-field"><span>Проблемні питання</span><textarea value={manual.problems} onChange={(event) => patch("problems", event.target.value)} /></label></section><ItemEditor title="Інші питання" items={manual.otherIssues} onChange={(value) => patch("otherIssues", value)} /></details>
        {lastPath && <button className="button full" onClick={() => void summaryReportService.open(lastPath)}>Відкрити створений DOCX</button>}
      </aside>
    </div>
  </PageFrame>;
}
