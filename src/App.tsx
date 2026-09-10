import { useEffect, useState } from "react";
import { useStartupWarnings } from "./app/hooks/useStartupWarnings";
import { ProgramGuidePage } from "./features/documentation/ProgramGuidePage";
import { VariableConstructorPage } from "./features/documentation/DocumentationPage";
import { GeneratedReportsPage } from "./features/generated-reports/GeneratedReportsPage";
import { prefetchGeneratedReports } from "./features/generated-reports/hooks/useGeneratedReports";
import { PersonnelPage } from "./features/personnel/PersonnelPage";
import { VehiclesPage } from "./features/vehicles/VehiclesPage";
import { CrewsPage, EquipmentPage, FlightPlanningPage, IncidentsPage, PositionsPage, StaffingBcsPage } from "./features/operations/OperationalPages";
import { usePersonnel } from "./features/personnel/hooks/usePersonnel";
import { ReportGenerationPage } from "./features/report-generation/ReportGenerationPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TemplatesPage } from "./features/templates/TemplatesPage";
import { ReportAnalyserPage } from "./features/templates/ReportAnalyserPage";
import { useTemplates } from "./features/templates/hooks/useTemplates";
import type { Screen, Template } from "./shared/types/domain";
import { NotificationProvider } from "./shared/ui/NotificationProvider";
import { Modal } from "./shared/ui/Modal";
import { AppSidebar } from "./app/components/AppSidebar";
import { isSimpleEdition } from "./app/navigation";

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
    <AppSidebar screen={screen} collapsed={sidebarCollapsed} warnings={startupWarnings} onToggleCollapsed={toggleSidebar} onNavigate={(next) => { if (next === "report-analyser") setAnalyserVisited(true); setScreen(next); }} />
    <main className="workspace">
      {screen === "generator" && <ReportGenerationPage template={selectedTemplate} templates={templates} hasMoreTemplates={templatesHasMore} isLoadingMoreTemplates={templatesLoadingMore} onLoadMoreTemplates={loadMoreTemplates} people={people} hasMorePeople={personnelHasMore} isLoadingMorePeople={personnelLoadingMore} onLoadMorePeople={loadMorePersonnel} selected={selectedPeople} onToggle={togglePerson} onAll={toggleAllPeople} onClear={clearSelectedPeople} onChoose={toggleTemplate} />}
      {screen === "templates" && <TemplatesPage templates={templates} totalCount={templatesTotalCount} hasMore={templatesHasMore} isRefreshing={templatesRefreshing} isLoadingMore={templatesLoadingMore} onLoadMore={loadMoreTemplates} selected={templateInfo ?? templates[0] ?? null} onSelect={setTemplateInfo} onRefresh={refreshTemplates} />}
      {(screen === "report-analyser" || analyserVisited) && <div className="persistent-screen" hidden={screen !== "report-analyser"}><ReportAnalyserPage onOpenConstructor={() => setConstructorOpen(true)} onCreated={(createdPath) => { void refreshTemplates().then((items) => { setTemplateInfo(items.find((template) => template.sourcePath === createdPath) ?? null); setScreen("templates"); }); }} /></div>}
      {screen === "people" && <PersonnelPage people={people} totalCount={personnelTotalCount} hasMore={personnelHasMore} isLoading={personnelLoading} isLoadingMore={personnelLoadingMore} errorMessage={personnelError} onCreate={createPersonnel} onUpdate={updatePersonnel} onDelete={deletePersonnel} onRefresh={refreshPersonnel} onLoadMore={loadMorePersonnel} />}
      {!isSimpleEdition && screen === "staffing-bcs" && <StaffingBcsPage />}
      {!isSimpleEdition && screen === "flight-planning" && <FlightPlanningPage />}
      {!isSimpleEdition && screen === "positions" && <PositionsPage />}
      {!isSimpleEdition && screen === "vehicles" && <VehiclesPage people={people} />}
      {!isSimpleEdition && screen === "generators" && <EquipmentPage category="generator" people={people} />}
      {!isSimpleEdition && screen === "uavs" && <EquipmentPage category="uav" people={people} />}
      {!isSimpleEdition && screen === "communications" && <EquipmentPage category="communications" people={people} />}
      {!isSimpleEdition && screen === "weapons" && <EquipmentPage category="weapon_ammo" people={people} />}
      {!isSimpleEdition && screen === "crews" && <CrewsPage people={people} />}
      {!isSimpleEdition && screen === "incidents" && <IncidentsPage />}
      {screen === "generated" && <GeneratedReportsPage />}
      {screen === "settings" && <SettingsPage />}
      {!isSimpleEdition && screen === "documentation" && <ProgramGuidePage />}
      {screen === "variable-constructor" && <VariableConstructorPage />}
      {constructorOpen && <Modal title="Конструктор змінних" subtitle="Складіть змінну та скопіюйте її до документа." onClose={() => setConstructorOpen(false)} className="constructor-modal"><VariableConstructorPage embedded /></Modal>}
    </main>
  </div></NotificationProvider>;
}
