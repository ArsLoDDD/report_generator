import { useEffect, useState } from "react";
import { AlertTriangle, BatteryCharging, BookOpen, Car, ChevronDown, Crosshair, FileSearch, FileText, Folder, Home, MapPinned, Network, PanelLeftClose, PanelLeftOpen, Radio, Settings, Shield, Users, UsersRound, WandSparkles } from "lucide-react";
import appIcon from "./assets/shablonizator-header-mark.png";
import { useStartupWarnings } from "./app/hooks/useStartupWarnings";
import { ProgramGuidePage } from "./features/documentation/ProgramGuidePage";
import { VariableConstructorPage } from "./features/documentation/DocumentationPage";
import { GeneratedReportsPage } from "./features/generated-reports/GeneratedReportsPage";
import { prefetchGeneratedReports } from "./features/generated-reports/hooks/useGeneratedReports";
import { PersonnelPage } from "./features/personnel/PersonnelPage";
import { VehiclesPage } from "./features/vehicles/VehiclesPage";
import { CrewsPage, EquipmentPage, IncidentsPage, PositionsPage, StaffingBcsPage } from "./features/operations/OperationalPages";
import { usePersonnel } from "./features/personnel/hooks/usePersonnel";
import { ReportGenerationPage } from "./features/report-generation/ReportGenerationPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TemplatesPage } from "./features/templates/TemplatesPage";
import { ReportAnalyserPage } from "./features/templates/ReportAnalyserPage";
import { useTemplates } from "./features/templates/hooks/useTemplates";
import type { Screen, Template } from "./shared/types/domain";
import { NotificationProvider } from "./shared/ui/NotificationProvider";

const navigationGroups = [
  { label: "Документи", items: [["generator", "Генерація рапортів", Home], ["templates", "Шаблони", FileText], ["report-analyser", "Аналізатор рапортів", FileSearch], ["generated", "Згенеровані рапорти", Folder], ["variable-constructor", "Конструктор змінних", WandSparkles]] },
  { label: "Особовий склад", items: [["people", "Особовий склад", Users], ["staffing-bcs", "Штат та БЧС", Network], ["crews", "Екіпажі", UsersRound]] },
  { label: "Бойова робота", items: [["positions", "Позиції", MapPinned], ["incidents", "Інциденти", AlertTriangle]] },
  { label: "Техніка та майно", items: [["vehicles", "Автомобілі", Car], ["generators", "Генератори", BatteryCharging], ["uavs", "БпЛА", Crosshair], ["communications", "Зв’язок", Radio], ["weapons", "Зброя та БК", Shield]] },
] as const;

export default function App() {
  const [screen, setScreen] = useState<Screen>("generator");
  const { personnel: people, totalCount: personnelTotalCount, hasMore: personnelHasMore, isLoading: personnelLoading, isLoadingMore: personnelLoadingMore, errorMessage: personnelError, refresh: refreshPersonnel, loadMore: loadMorePersonnel, createPersonnel, updatePersonnel, deletePersonnel } = usePersonnel();
  const { templates, totalCount: templatesTotalCount, hasMore: templatesHasMore, isRefreshing: templatesRefreshing, isLoadingMore: templatesLoadingMore, loadMore: loadMoreTemplates, refresh: refreshTemplates } = useTemplates();
  const startupWarnings = useStartupWarnings().filter((warning) =>
    !["personnel-empty", "database-missing"].includes(warning.code) || people.length === 0,
  );
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateInfo, setTemplateInfo] = useState<Template | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem("shablonizator.sidebarCollapsed") === "true");
  const [analyserVisited, setAnalyserVisited] = useState(false);
  const [constructorOpen, setConstructorOpen] = useState(false);
  const [openNavigationGroups, setOpenNavigationGroups] = useState<string[]>(navigationGroups.map((group) => group.label));

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
      <section className="sidebar-menu"><nav>{navigationGroups.map((group) => <section className="nav-group" key={group.label}><button className="nav-group__title" aria-label={`${openNavigationGroups.includes(group.label) ? "Згорнути" : "Розгорнути"} групу ${group.label}`} title={group.label} onClick={() => setOpenNavigationGroups((current) => current.includes(group.label) ? current.filter((label) => label !== group.label) : [...current, group.label])}><span>{group.label}</span><ChevronDown className={openNavigationGroups.includes(group.label) ? "" : "nav-group__chevron--closed"} /></button>{openNavigationGroups.includes(group.label) && <div className="nav-group__items">{group.items.map(([id, label, Icon]) => <button key={id} title={label} onClick={() => { if (id === "report-analyser") setAnalyserVisited(true); setScreen(id); }} className={screen === id ? "nav-active" : ""}><Icon size={23} /><span>{label}</span></button>)}</div>}</section>)}</nav></section>
      <section className="sidebar-middle">{startupWarnings.length > 0 && <section className="sidebar-warnings" aria-label="Попередження програми">{startupWarnings.map((warning) => <article key={warning.code} title={warning.message}><AlertTriangle /><div><b>{warning.title}</b><span>{warning.message}</span></div></article>)}</section>}</section>
      <footer className="sidebar-bottom"><button title="Довідник" onClick={() => setScreen("documentation")} className={screen === "documentation" ? "nav-active" : ""}><BookOpen size={23} /><span>Довідник</span></button><button title="Налаштування" onClick={() => setScreen("settings")} className={screen === "settings" ? "nav-active" : ""}><Settings size={23} /><span>Налаштування</span></button></footer>
      <button className="sidebar-toggle sidebar-toggle--rail" aria-label={sidebarCollapsed ? "Розгорнути сайдбар" : "Згорнути сайдбар"} title={sidebarCollapsed ? "Розгорнути сайдбар" : "Згорнути сайдбар"} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
    </aside>
    <main className="workspace">
      {screen === "generator" && <ReportGenerationPage template={selectedTemplate} templates={templates} hasMoreTemplates={templatesHasMore} isLoadingMoreTemplates={templatesLoadingMore} onLoadMoreTemplates={loadMoreTemplates} people={people} hasMorePeople={personnelHasMore} isLoadingMorePeople={personnelLoadingMore} onLoadMorePeople={loadMorePersonnel} selected={selectedPeople} onToggle={togglePerson} onAll={toggleAllPeople} onClear={clearSelectedPeople} onChoose={toggleTemplate} />}
      {screen === "templates" && <TemplatesPage templates={templates} totalCount={templatesTotalCount} hasMore={templatesHasMore} isRefreshing={templatesRefreshing} isLoadingMore={templatesLoadingMore} onLoadMore={loadMoreTemplates} selected={templateInfo ?? templates[0] ?? null} onSelect={setTemplateInfo} onRefresh={refreshTemplates} />}
      {(screen === "report-analyser" || analyserVisited) && <div className="persistent-screen" hidden={screen !== "report-analyser"}><ReportAnalyserPage onOpenConstructor={() => setConstructorOpen(true)} onCreated={(createdPath) => { void refreshTemplates().then((items) => { setTemplateInfo(items.find((template) => template.sourcePath === createdPath) ?? null); setScreen("templates"); }); }} /></div>}
      {screen === "people" && <PersonnelPage people={people} totalCount={personnelTotalCount} hasMore={personnelHasMore} isLoading={personnelLoading} isLoadingMore={personnelLoadingMore} errorMessage={personnelError} onCreate={createPersonnel} onUpdate={updatePersonnel} onDelete={deletePersonnel} onRefresh={refreshPersonnel} onLoadMore={loadMorePersonnel} />}
      {screen === "staffing-bcs" && <StaffingBcsPage />}
      {screen === "positions" && <PositionsPage />}
      {screen === "vehicles" && <VehiclesPage people={people} />}
      {screen === "generators" && <EquipmentPage category="generator" people={people} />}
      {screen === "uavs" && <EquipmentPage category="uav" people={people} />}
      {screen === "communications" && <EquipmentPage category="communications" people={people} />}
      {screen === "weapons" && <EquipmentPage category="weapon_ammo" people={people} />}
      {screen === "crews" && <CrewsPage people={people} />}
      {screen === "incidents" && <IncidentsPage />}
      {screen === "generated" && <GeneratedReportsPage />}
      {screen === "settings" && <SettingsPage />}
      {screen === "documentation" && <ProgramGuidePage />}
      {screen === "variable-constructor" && <VariableConstructorPage />}
      {constructorOpen && <div className="modal-backdrop constructor-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) setConstructorOpen(false); }}><section className="modal-panel" role="dialog" aria-modal="true" aria-label="Конструктор змінних"><header className="modal-header"><div><h2>Конструктор змінних</h2><p>Складіть змінну та скопіюйте її до документа.</p></div><button className="icon-button" aria-label="Закрити" onClick={() => setConstructorOpen(false)}>×</button></header><VariableConstructorPage embedded /></section></div>}
    </main>
  </div></NotificationProvider>;
}
