import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Car, FileText, Folder, Home, PanelLeftClose, PanelLeftOpen, Settings, Users, WandSparkles } from "lucide-react";
import appIcon from "./assets/shablonizator-header-mark.png";
import { useStartupWarnings } from "./app/hooks/useStartupWarnings";
import { ProgramGuidePage } from "./features/documentation/ProgramGuidePage";
import { VariableConstructorPage } from "./features/documentation/DocumentationPage";
import { GeneratedReportsPage } from "./features/generated-reports/GeneratedReportsPage";
import { prefetchGeneratedReports } from "./features/generated-reports/hooks/useGeneratedReports";
import { PersonnelPage } from "./features/personnel/PersonnelPage";
import { VehiclesPage } from "./features/vehicles/VehiclesPage";
import { usePersonnel } from "./features/personnel/hooks/usePersonnel";
import { ReportGenerationPage } from "./features/report-generation/ReportGenerationPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TemplatesPage } from "./features/templates/TemplatesPage";
import { useTemplates } from "./features/templates/hooks/useTemplates";
import type { Screen, Template } from "./shared/types/domain";
import { NotificationProvider } from "./shared/ui/NotificationProvider";

const navigation = [
  ["generator", "Генерація рапортів", Home], ["templates", "Шаблони", FileText], ["people", "Особовий склад", Users], ["vehicles", "Автомобілі", Car],
  ["generated", "Згенеровані рапорти", Folder], ["variable-constructor", "Конструктор змінних", WandSparkles]
] as const;

export default function App() {
  const [screen, setScreen] = useState<Screen>("generator");
  const { personnel: people, totalCount: personnelTotalCount, hasMore: personnelHasMore, isLoading: personnelLoading, isLoadingMore: personnelLoadingMore, errorMessage: personnelError, refresh: refreshPersonnel, loadMore: loadMorePersonnel, createPersonnel, updatePersonnel, deletePersonnel } = usePersonnel();
  const { templates, totalCount: templatesTotalCount, hasMore: templatesHasMore, isRefreshing: templatesRefreshing, isLoadingMore: templatesLoadingMore, loadMore: loadMoreTemplates, refresh: refreshTemplates } = useTemplates();
  const startupWarnings = useStartupWarnings().filter((warning) => !["personnel-empty", "database-missing"].includes(warning.code) || people.length === 0);
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateInfo, setTemplateInfo] = useState<Template | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem("shablonizator.sidebarCollapsed") === "true");

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

  useEffect(() => {
    const timer = window.setTimeout(() => { void prefetchGeneratedReports(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleSidebar = () => setSidebarCollapsed((current) => {
    const next = !current;
    window.localStorage.setItem("shablonizator.sidebarCollapsed", String(next));
    return next;
  });

  useEffect(() => {
    const closeOnBackdrop = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains("modal-backdrop")) target.querySelector<HTMLButtonElement>(".modal-actions .button")?.click();
    };
    document.addEventListener("click", closeOnBackdrop);
    return () => document.removeEventListener("click", closeOnBackdrop);
  }, []);

  return <NotificationProvider><div className={`product-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <aside className="sidebar">
      <div className="sidebar-top"><div className="product-logo"><img src={appIcon} alt="" /><div><b>Шаблонізатор</b><span>службові документи</span></div></div></div>
      <nav>{navigation.map(([id, label, Icon]) => <button key={id} title={label} onClick={() => setScreen(id)} className={screen === id ? "nav-active" : ""}><Icon size={23} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><button title="Довідник" onClick={() => setScreen("documentation")} className={screen === "documentation" ? "nav-active" : ""}><BookOpen size={23} /><span>Довідник</span></button><button title="Налаштування" onClick={() => setScreen("settings")} className={screen === "settings" ? "nav-active" : ""}><Settings size={23} /><span>Налаштування</span></button></div>
      {startupWarnings.length > 0 && <section className="sidebar-warnings" aria-label="Попередження програми">{startupWarnings.map((warning) => <article key={warning.code} title={warning.message}><AlertTriangle /><div><b>{warning.title}</b><span>{warning.message}</span></div></article>)}</section>}
      <button className="sidebar-toggle sidebar-toggle--rail" aria-label={sidebarCollapsed ? "Розгорнути сайдбар" : "Згорнути сайдбар"} title={sidebarCollapsed ? "Розгорнути сайдбар" : "Згорнути сайдбар"} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
    </aside>
    <main className="workspace">
      {screen === "generator" && <ReportGenerationPage template={selectedTemplate} templates={templates} hasMoreTemplates={templatesHasMore} isLoadingMoreTemplates={templatesLoadingMore} onLoadMoreTemplates={loadMoreTemplates} people={people} hasMorePeople={personnelHasMore} isLoadingMorePeople={personnelLoadingMore} onLoadMorePeople={loadMorePersonnel} selected={selectedPeople} onToggle={togglePerson} onAll={toggleAllPeople} onClear={clearSelectedPeople} onChoose={toggleTemplate} />}
      {screen === "templates" && <TemplatesPage templates={templates} totalCount={templatesTotalCount} hasMore={templatesHasMore} isRefreshing={templatesRefreshing} isLoadingMore={templatesLoadingMore} onLoadMore={loadMoreTemplates} selected={templateInfo ?? templates[0] ?? null} onSelect={setTemplateInfo} onRefresh={refreshTemplates} />}
      {screen === "people" && <PersonnelPage people={people} totalCount={personnelTotalCount} hasMore={personnelHasMore} isLoading={personnelLoading} isLoadingMore={personnelLoadingMore} errorMessage={personnelError} onCreate={createPersonnel} onUpdate={updatePersonnel} onDelete={deletePersonnel} onRefresh={refreshPersonnel} onLoadMore={loadMorePersonnel} />}
      {screen === "vehicles" && <VehiclesPage people={people} />}
      {screen === "generated" && <GeneratedReportsPage />}
      {screen === "settings" && <SettingsPage />}
      {screen === "documentation" && <ProgramGuidePage />}
      {screen === "variable-constructor" && <VariableConstructorPage />}
    </main>
  </div></NotificationProvider>;
}
