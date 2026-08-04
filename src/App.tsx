import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, FileCheck2, FileText, Folder, Home, Settings, Users } from "lucide-react";
import { useStartupWarnings } from "./app/hooks/useStartupWarnings";
import { DocumentationPage } from "./features/documentation/DocumentationPage";
import { GeneratedReportsPage } from "./features/generated-reports/GeneratedReportsPage";
import { PersonnelPage } from "./features/personnel/PersonnelPage";
import { usePersonnel } from "./features/personnel/hooks/usePersonnel";
import { ReportGenerationPage } from "./features/report-generation/ReportGenerationPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TemplatesPage } from "./features/templates/TemplatesPage";
import { useTemplates } from "./features/templates/hooks/useTemplates";
import type { Screen, Template } from "./shared/types/domain";
import { NotificationProvider } from "./shared/ui/NotificationProvider";

const navigation = [
  ["generator", "Генерація рапортів", Home], ["templates", "Шаблони", FileText], ["people", "Особовий склад", Users],
  ["generated", "Згенеровані рапорти", Folder], ["settings", "Налаштування", Settings], ["documentation", "Довідник", BookOpen]
] as const;

export default function App() {
  const [screen, setScreen] = useState<Screen>("generator");
  const { personnel: people, totalCount: personnelTotalCount, hasMore: personnelHasMore, isLoading: personnelLoading, isLoadingMore: personnelLoadingMore, errorMessage: personnelError, refresh: refreshPersonnel, loadMore: loadMorePersonnel, createPersonnel, updatePersonnel, deletePersonnel } = usePersonnel();
  const { templates, totalCount: templatesTotalCount, hasMore: templatesHasMore, isLoadingMore: templatesLoadingMore, loadMore: loadMoreTemplates, refresh: refreshTemplates } = useTemplates();
  const startupWarnings = useStartupWarnings().filter((warning) => !["personnel-empty", "database-missing"].includes(warning.code) || people.length === 0);
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateInfo, setTemplateInfo] = useState<Template | null>(null);

  const togglePerson = (id: number) => setSelectedPeople((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleAllPeople = () => setSelectedPeople((current) => current.length === people.length ? [] : people.map((person) => person.id));
  const clearSelectedPeople = () => setSelectedPeople([]);
  const toggleTemplate = (template: Template) => setSelectedTemplate((current) => current?.name === template.name ? null : template);

  useEffect(() => {
    const existingIds = new Set(people.map((person) => person.id));
    setSelectedPeople((current) => current.filter((id) => existingIds.has(id)));
  }, [people]);

  useEffect(() => {
    setTemplateInfo((current) => current ? templates.find((template) => template.sourcePath === current.sourcePath) ?? templates[0] ?? null : current);
  }, [templates]);

  return <NotificationProvider><div className="product-shell">
    <aside className="sidebar">
      <div className="product-logo"><FileCheck2 /><div><b>Генератор рапортів</b><span>по шаблону</span></div></div>
      <nav>{navigation.map(([id, label, Icon]) => <button key={id} onClick={() => setScreen(id)} className={screen === id ? "nav-active" : ""}><Icon size={23} />{label}</button>)}</nav>
      {startupWarnings.length > 0 && <section className="sidebar-warnings" aria-label="Попередження програми">{startupWarnings.map((warning) => <article key={warning.code} title={warning.message}><AlertTriangle /><div><b>{warning.title}</b><span>{warning.message}</span></div></article>)}</section>}
    </aside>
    <main className="workspace">
      {screen === "generator" && <ReportGenerationPage template={selectedTemplate} templates={templates} hasMoreTemplates={templatesHasMore} isLoadingMoreTemplates={templatesLoadingMore} onLoadMoreTemplates={loadMoreTemplates} people={people} hasMorePeople={personnelHasMore} isLoadingMorePeople={personnelLoadingMore} onLoadMorePeople={loadMorePersonnel} selected={selectedPeople} onToggle={togglePerson} onAll={toggleAllPeople} onClear={clearSelectedPeople} onChoose={toggleTemplate} />}
      {screen === "templates" && <TemplatesPage templates={templates} totalCount={templatesTotalCount} hasMore={templatesHasMore} isLoadingMore={templatesLoadingMore} onLoadMore={loadMoreTemplates} selected={templateInfo ?? templates[0] ?? null} onSelect={setTemplateInfo} onRefresh={refreshTemplates} />}
      {screen === "people" && <PersonnelPage people={people} totalCount={personnelTotalCount} hasMore={personnelHasMore} isLoading={personnelLoading} isLoadingMore={personnelLoadingMore} errorMessage={personnelError} onCreate={createPersonnel} onUpdate={updatePersonnel} onDelete={deletePersonnel} onRefresh={refreshPersonnel} onLoadMore={loadMorePersonnel} />}
      {screen === "generated" && <GeneratedReportsPage />}
      {screen === "settings" && <SettingsPage />}
      {screen === "documentation" && <DocumentationPage />}
    </main>
  </div></NotificationProvider>;
}
