import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, FileText, FolderOpen, RefreshCw, Trash2, Users } from "lucide-react";
import type { Template, TemplateInspection } from "../../shared/types/domain";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { FilterButton } from "../../shared/ui/FilterButton";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { RecentReportsList } from "../../shared/ui/RecentReportsList";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { includesSearch } from "../../shared/utils/search";
import { useLoadMoreOnScroll } from "../../shared/hooks/useLoadMoreOnScroll";
import { useGeneratedReports } from "../generated-reports/hooks/useGeneratedReports";
import { generatedReportsService } from "../generated-reports/services/generatedReportsService";
import { VariableGroup } from "./components/VariableGroup";
import { templateService } from "./services/templateService";
import { getVariable } from "../../shared/template-language/registry";

const emptyInspection: TemplateInspection = { isValid: true, errors: [], variables: [] };

type TemplatesPageProps = {
  templates: Template[];
  totalCount: number;
  hasMore: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  errorMessage?: string | null;
  onLoadMore: () => Promise<void>;
  selected: Template | null;
  onSelect: (template: Template | null) => void;
  onRefresh: () => Promise<Template[]>;
};

export function TemplatesPage({ templates, totalCount, hasMore, isRefreshing: isBackgroundRefreshing, isLoadingMore, errorMessage = null, onLoadMore, selected, onSelect, onRefresh }: TemplatesPageProps) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState("all");
  const [inspection, setInspection] = useState<TemplateInspection>(emptyInspection);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const inspectionRequest = useRef(0);
  const { reports } = useGeneratedReports();
  const { notify } = useNotifications();

  const inspectSelectedTemplate = async () => {
    if (!selected?.sourcePath) return;
    const request = ++inspectionRequest.current;
    try {
      const result = await templateService.inspect(selected.sourcePath);
      if (request !== inspectionRequest.current) return;
      setInspection(result);
      notify(result.isValid ? "Шаблон перевірено: помилок не виявлено." : result.errors.join("\n") || "Шаблон потребує уваги.", result.isValid ? "success" : "error");
    } catch (reason) { if (request === inspectionRequest.current) notify(typeof reason === "string" ? reason : "Не вдалося перевірити шаблон.", "error"); }
  };

  const openSelectedTemplate = async () => {
    if (!selected?.sourcePath) return;
    try { await templateService.open(selected.sourcePath); }
    catch { notify(`Не вдалося відкрити шаблон «${selected.name}».`, "error"); }
  };

  const openTemplatesDirectory = async () => {
    try { await templateService.openDirectory(); }
    catch { notify("Не вдалося відкрити папку шаблонів.", "error"); }
  };

  const refreshTemplates = async () => {
    setIsRefreshing(true);
    try {
      const refreshed = await onRefresh();
      const nextSelected = selected ? refreshed.find((template) => template.sourcePath === selected.sourcePath) : null;
      onSelect(nextSelected ?? refreshed[0] ?? null);
      notify("Список шаблонів оновлено.", "success");
    } catch { notify("Не вдалося оновити список шаблонів.", "error"); }
    finally { setIsRefreshing(false); }
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete?.sourcePath) return;
    setIsDeleting(true);
    try {
      await templateService.delete(templateToDelete.sourcePath);
      const refreshed = await onRefresh();
      onSelect(refreshed[0] ?? null);
      setTemplateToDelete(null);
      notify("Шаблон переміщено до кошика програми.", "success");
    } catch { notify(`Не вдалося видалити шаблон «${templateToDelete.name}». Можливо, файл відкритий у Word.`, "error"); }
    finally { setIsDeleting(false); }
  };

  useEffect(() => {
    const request = ++inspectionRequest.current;
    if (!selected?.sourcePath) { setInspection(emptyInspection); return; }
    setInspection(emptyInspection);
    void templateService.inspect(selected.sourcePath).then((result) => { if (request === inspectionRequest.current) setInspection(result); }).catch((reason) => { if (request === inspectionRequest.current) setInspection({ isValid: false, errors: [typeof reason === "string" ? reason : "Не вдалося прочитати шаблон."], variables: [] }); });
  }, [selected?.sourcePath]);

  const filteredTemplates = templates.filter((item) => (status === "all" || item.status === status) && includesSearch(query, item.name, item.description));
  const recentReports = reports.filter((report) => report.template === selected?.name).slice(0, 3).map((report) => ({ name: report.name, createdAt: report.generatedAt, docxPath: report.docxPath }));
  const openRecentReport = async (reportPath: string) => {
    try { await generatedReportsService.openDocument(reportPath); }
    catch { notify("Не вдалося відкрити рапорт. Перевірте, чи файл існує.", "error"); }
  };
  const variableGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const value of inspection.variables) {
      const definition = getVariable(value.split(":")[0]);
      const category = definition?.category ?? "Інші змінні";
      groups.set(category, [...(groups.get(category) ?? []), value]);
    }
    return [...groups.entries()];
  }, [inspection.variables]);
  const documentParameterCount = variableGroups.find(([category]) => category === "Параметри документа")?.[1].length ?? 0;
  const onTemplatesScroll = useLoadMoreOnScroll({ hasMore, isLoading: isLoadingMore, loadMore: onLoadMore });

  const listFooter = <div className="pagination template-list__footer"><span>{isBackgroundRefreshing && templates.length > 0 ? "Оновлення…" : `Показано ${filteredTemplates.length} із ${totalCount}`}</span><div><button className="button" onClick={() => void openTemplatesDirectory()}><FolderOpen />Відкрити папку</button><button className="button icon-only" aria-label="Оновити" title="Оновити" onClick={() => void refreshTemplates()} disabled={isRefreshing || isBackgroundRefreshing}><RefreshCw className={isRefreshing || isBackgroundRefreshing ? "spin" : undefined} /></button></div></div>;

  if (!selected) return <PageFrame className="templates-page"><section className="panel template-empty-page"><div>{errorMessage ? <><CircleAlert /><h2>Не вдалося завантажити шаблони</h2><p role="alert">{errorMessage}</p><button className="button" onClick={() => void refreshTemplates()}>Повторити</button></> : <><FileText /><h2>Шаблони не знайдено</h2><p>Додайте DOCX-файли до папки шаблонів і оновіть список.</p></>}</div>{listFooter}</section></PageFrame>;

  return <PageFrame className="templates-page"><div className="templates-layout">
    <section className="panel template-list">
      {errorMessage && <div className="template-load-warning" role="alert"><CircleAlert /><span>{errorMessage}</span><button className="button" onClick={() => void refreshTemplates()}>Повторити</button></div>}
      <div className="template-list__tools"><div className="table-tools"><SearchInput placeholder="Пошук шаблонів…" value={query} onChange={setQuery} /><FilterButton active={filtersOpen} onClick={() => setFiltersOpen((current) => !current)} /></div>{filtersOpen && <div className="inline-filters"><Select ariaLabel="Статус шаблону" value={status} onChange={setStatus} options={[{ value: "all", label: "Усі статуси" }, { value: "ready", label: "Готові" }, { value: "error", label: "З помилками" }]} /><button className="button" onClick={() => { setQuery(""); setStatus("all"); }}>Скинути</button></div>}<div className="list-sort"><span>Знайдено: <b>{filteredTemplates.length}</b></span><span>Сортування: <b>Назва (А-Я)</b></span></div></div>
      <div className="template-list__scroll" onScroll={onTemplatesScroll}>{filteredTemplates.map((item) => <button key={item.sourcePath ?? item.name} onClick={() => onSelect(item)} className={`template-row ${selected.sourcePath === item.sourcePath ? "template-selected" : ""}`}><FileText /><div><b>{item.name}</b><span className={`status-pill ${item.status}`}>{item.status === "ready" ? "Готовий" : "Є помилки"}</span><p>{item.description}</p><small>Останнє редагування: {item.changed}</small></div></button>)}{isLoadingMore && <div className="infinite-loading">Завантаження наступних 20 шаблонів…</div>}</div>
      {listFooter}
    </section>
    <section className="panel template-details"><div className="template-details__scroll">
      <h2>{selected.name}</h2><p>{selected.description}</p><div className="document-meta">▣ DOCX · Змінних: {inspection.variables.length} · {selected.changed}</div>
      <div className="actions-line"><button className="button success" onClick={() => void openSelectedTemplate()}><FolderOpen />Відкрити</button><button className="button success" onClick={() => void inspectSelectedTemplate()}><CheckCircle2 />Перевірити шаблон</button><button className="button danger" onClick={() => setTemplateToDelete(selected)}><Trash2 />Видалити</button></div>
      <div className="validation"><div className="validation-summary"><h3>Результати перевірки</h3><div className={inspection.isValid ? "validation-good" : "validation-bad"}>{inspection.isValid ? <CheckCircle2 /> : <CircleAlert />}<div><b>{inspection.isValid ? "Помилок не виявлено" : "Потрібна увага"}</b>{inspection.isValid ? <p>Шаблон готовий до використання</p> : <ul>{inspection.errors.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}</div></div></div></div>
      <div className="detail-cards"><article className="variables-card"><header className="variables-card__title"><div><h3>Використовувані змінні</h3><p>Прочитані безпосередньо з обраного DOCX-файлу.</p></div><span>{inspection.variables.length}</span></header>{variableGroups.map(([category, values]) => <VariableGroup key={category} icon={category.includes("Військовослужбовець") ? Users : category === "Параметри документа" ? FileText : FolderOpen} label={category} hint={category === "Параметри документа" ? "Значення перед генерацією" : "Дані з відповідного джерела"} tone={category.includes("Військовослужбовець") ? "collection" : undefined} values={values.map((value) => `{{${value}}}`)} />)}{inspection.variables.length === 0 && <p className="variables-empty">У шаблоні не знайдено змінних у форматі {"{{...}}"}.</p>}</article><article className="template-side"><h3>Деталі шаблону</h3><dl><dt>Тип файлу:</dt><dd>DOCX</dd><dt>Стан:</dt><dd>{inspection.isValid ? "Готовий" : "Потрібна перевірка"}</dd><dt>Параметри документа:</dt><dd>{documentParameterCount ? "Користувач заповнює значення" : "Не потрібні"}</dd></dl><div className="recent-template-reports"><header><div><h3>Останні рапорти</h3><p>Створені за цим шаблоном</p></div></header><RecentReportsList reports={recentReports} onOpen={(reportPath) => void openRecentReport(reportPath)} /></div></article></div>
    </div></section>
  </div>{templateToDelete && <ConfirmDialog title="Перемістити шаблон у кошик?" message={`DOCX-файл «${templateToDelete.name}» буде переміщено з папки «Шаблони» до кошика програми.`} confirmLabel="Перемістити" onConfirm={() => void confirmDeleteTemplate()} onCancel={() => setTemplateToDelete(null)} busy={isDeleting} />}</PageFrame>;
}
