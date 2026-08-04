import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, FileText, FolderOpen, MoreVertical, RefreshCw, Users } from "lucide-react";
import type { Template, TemplateInspection } from "../../shared/types/domain";
import { FilterButton } from "../../shared/ui/FilterButton";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { RecentReportsList } from "../../shared/ui/RecentReportsList";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { includesSearch } from "../../shared/utils/search";
import { useLoadMoreOnScroll } from "../../shared/hooks/useLoadMoreOnScroll";
import { useGeneratedReports } from "../generated-reports/hooks/useGeneratedReports";
import { VariableGroup } from "./components/VariableGroup";
import { templateService } from "./services/templateService";

const emptyInspection: TemplateInspection = { isValid: true, errors: [], variables: [] };

type TemplatesPageProps = {
  templates: Template[];
  totalCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => Promise<void>;
  selected: Template | null;
  onSelect: (template: Template | null) => void;
  onRefresh: () => Promise<Template[]>;
};

export function TemplatesPage({ templates, totalCount, hasMore, isLoadingMore, onLoadMore, selected, onSelect, onRefresh }: TemplatesPageProps) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState("all");
  const [inspection, setInspection] = useState<TemplateInspection>(emptyInspection);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { reports } = useGeneratedReports();
  const { notify } = useNotifications();

  const inspectSelectedTemplate = async () => {
    if (!selected?.sourcePath) return;
    try {
      const result = await templateService.inspect(selected.sourcePath);
      setInspection(result);
      notify(result.isValid ? "Шаблон перевірено: помилок не виявлено." : result.errors[0] ?? "Шаблон потребує уваги.", result.isValid ? "success" : "error");
    } catch { notify("Не вдалося перевірити шаблон.", "error"); }
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

  useEffect(() => {
    if (!selected?.sourcePath) { setInspection(emptyInspection); return; }
    void templateService.inspect(selected.sourcePath).then(setInspection).catch(() => setInspection({ isValid: false, errors: ["Не вдалося прочитати шаблон."], variables: [] }));
  }, [selected?.sourcePath]);

  const filteredTemplates = templates.filter((item) => (status === "all" || item.status === status) && includesSearch(query, item.name, item.description));
  const recentReports = reports.filter((report) => report.template === selected?.name).slice(0, 3).map((report) => ({ name: report.name, createdAt: report.generatedAt }));
  const variableGroups = useMemo(() => ({
    document: inspection.variables.filter((value) => value.startsWith("document.")),
    people: inspection.variables.filter((value) => value.startsWith("soldier.") || value.startsWith("soldiers[")),
    signers: inspection.variables.filter((value) => !value.startsWith("document.") && !value.startsWith("soldier.") && !value.startsWith("soldiers["))
  }), [inspection.variables]);
  const onTemplatesScroll = useLoadMoreOnScroll({ hasMore, isLoading: isLoadingMore, loadMore: onLoadMore });

  const listFooter = <div className="pagination template-list__footer"><span>Показано {filteredTemplates.length} із {totalCount}</span><div><button className="button" onClick={() => void openTemplatesDirectory()}><FolderOpen />Відкрити папку</button><button className="button icon-only" aria-label="Оновити" title="Оновити" onClick={() => void refreshTemplates()} disabled={isRefreshing}><RefreshCw className={isRefreshing ? "spin" : undefined} /></button></div></div>;

  if (!selected) return <PageFrame className="templates-page"><section className="panel template-empty-page"><div><FileText /><h2>Шаблони не знайдено</h2><p>Додайте DOCX-файли до папки шаблонів і оновіть список.</p></div>{listFooter}</section></PageFrame>;

  return <PageFrame className="templates-page"><div className="templates-layout">
    <section className="panel template-list">
      <div className="template-list__tools"><div className="table-tools"><SearchInput placeholder="Пошук шаблонів…" value={query} onChange={setQuery} /><FilterButton active={filtersOpen} onClick={() => setFiltersOpen((current) => !current)} /></div>{filtersOpen && <div className="inline-filters"><Select ariaLabel="Статус шаблону" value={status} onChange={setStatus} options={[{ value: "all", label: "Усі статуси" }, { value: "ready", label: "Готові" }, { value: "error", label: "З помилками" }]} /><button className="button" onClick={() => { setQuery(""); setStatus("all"); }}>Скинути</button></div>}<div className="list-sort"><span>Знайдено: <b>{filteredTemplates.length}</b></span><span>Сортування: <b>Назва (А-Я)</b></span></div></div>
      <div className="template-list__scroll" onScroll={onTemplatesScroll}>{filteredTemplates.map((item) => <button key={item.sourcePath ?? item.name} onClick={() => onSelect(item)} className={`template-row ${selected.sourcePath === item.sourcePath ? "template-selected" : ""}`}><FileText /><div><b>{item.name}</b><span className={`status-pill ${item.status}`}>{item.status === "ready" ? "Готовий" : "Є помилки"}</span><p>{item.description}</p><small>Останнє редагування: {item.changed}</small></div><MoreVertical /></button>)}{isLoadingMore && <div className="infinite-loading">Завантаження наступних 20 шаблонів…</div>}</div>
      {listFooter}
    </section>
    <section className="panel template-details"><div className="template-details__scroll">
      <h2>{selected.name}</h2><p>{selected.description}</p><div className="document-meta">▣ DOCX · Змінних: {inspection.variables.length} · {selected.changed}</div>
      <div className="actions-line"><button className="button success" onClick={() => void openSelectedTemplate()}><FolderOpen />Відкрити</button><button className="button success" onClick={() => void inspectSelectedTemplate()}><CheckCircle2 />Перевірити шаблон</button></div>
      <div className="validation"><div className="validation-summary"><h3>Результати перевірки</h3><div className={inspection.isValid ? "validation-good" : "validation-bad"}>{inspection.isValid ? <CheckCircle2 /> : <CircleAlert />}<div><b>{inspection.isValid ? "Помилок не виявлено" : "Потрібна увага"}</b><p>{inspection.isValid ? "Шаблон готовий до використання" : inspection.errors[0]}</p></div></div></div></div>
      <div className="detail-cards"><article className="variables-card"><header className="variables-card__title"><div><h3>Використовувані змінні</h3><p>Прочитані безпосередньо з обраного DOCX-файлу.</p></div><span>{inspection.variables.length}</span></header>{variableGroups.document.length > 0 && <VariableGroup icon={FileText} label="Документ" hint="Дата та реквізити" values={variableGroups.document.map((value) => `{{${value}}}`)} />}{variableGroups.people.length > 0 && <VariableGroup icon={Users} label="Військовослужбовці" hint="Обрані особи" tone="collection" values={variableGroups.people.map((value) => `{{${value}}}`)} />}{variableGroups.signers.length > 0 && <VariableGroup icon={FolderOpen} label="Підписанти" hint="Дані з налаштувань" values={variableGroups.signers.map((value) => `{{${value}}}`)} />}{inspection.variables.length === 0 && <p className="variables-empty">У шаблоні не знайдено змінних у форматі {"{{...}}"}.</p>}</article><article className="template-side"><h3>Деталі шаблону</h3><dl><dt>Тип файлу:</dt><dd>DOCX</dd><dt>Стан:</dt><dd>{inspection.isValid ? "Готовий" : "Потрібна перевірка"}</dd><dt>Використання дати:</dt><dd>{variableGroups.document.includes("document.date") ? "Користувач обирає дату" : "Не потрібна"}</dd></dl><div className="recent-template-reports"><header><div><h3>Останні рапорти</h3><p>Створені за цим шаблоном</p></div></header><RecentReportsList reports={recentReports} /></div></article></div>
    </div></section>
  </div></PageFrame>;
}
