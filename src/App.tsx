import { useEffect, useRef, useState } from "react";
import { useStartupWarnings } from "./app/hooks/useStartupWarnings";
import { ProgramGuidePage } from "./features/documentation/ProgramGuidePage";
import { GeneratedReportsPage } from "./features/generated-reports/GeneratedReportsPage";
import { prefetchGeneratedReports } from "./features/generated-reports/hooks/useGeneratedReports";
import { PersonnelPage } from "./features/personnel/PersonnelPage";
import { VehiclesPage } from "./features/vehicles/VehiclesPage";
import { CrewsPage, EquipmentPage, FlightJournalPage, FlightPlanningPage, IncidentsPage, PositionsPage, StaffingBcsPage } from "./features/operations/OperationalPages";
import { usePersonnel } from "./features/personnel/hooks/usePersonnel";
import { ReportGenerationPage } from "./features/report-generation/ReportGenerationPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TemplatesPage } from "./features/templates/TemplatesPage";
import { ReportAnalyserPage } from "./features/templates/ReportAnalyserPage";
import { useTemplates } from "./features/templates/hooks/useTemplates";
import type { Screen, Template } from "./shared/types/domain";
import { NotificationProvider } from "./shared/ui/NotificationProvider";
import { AppSidebar } from "./app/components/AppSidebar";
import { isSimpleEdition } from "./app/navigation";
import { WarningsPage } from "./app/components/WarningsPage";
import { AssetsPage } from "./features/assets/AssetsPage";
import { SummaryReportPage } from "./features/operations/SummaryReportPage";
import { GlobalTooltip } from "./shared/ui/GlobalTooltip";
import { settingsService } from "./features/settings/services/settingsService";
import { currentRelease, releaseNotesStorageKey } from "./app/releaseNotes";
import { ReleaseNotesModal } from "./app/components/ReleaseNotesModal";
import { DeadlineReminderNotifications } from "./app/components/DeadlineReminderNotifications";
import { deadlineReminderService } from "./features/settings/services/deadlineReminderService";

export default function App() {
  const [screen, setScreen] = useState<Screen>("generator");
  const { personnel: people, totalCount: personnelTotalCount, hasMore: personnelHasMore, isLoading: personnelLoading, isLoadingMore: personnelLoadingMore, errorMessage: personnelError, refresh: refreshPersonnel, loadMore: loadMorePersonnel, createPersonnel, updatePersonnel, deletePersonnel } = usePersonnel();
  const { templates, totalCount: templatesTotalCount, hasMore: templatesHasMore, isRefreshing: templatesRefreshing, isLoadingMore: templatesLoadingMore, errorMessage: templatesError, loadMore: loadMoreTemplates, refresh: refreshTemplates } = useTemplates();
  const warningState = useStartupWarnings();
  const refreshWarnings = warningState.refresh;
  const startupWarnings = warningState.warnings.filter((warning) =>
    !["personnel-empty", "database-missing"].includes(warning.code) || people.length === 0,
  );
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateInfo, setTemplateInfo] = useState<Template | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem("shablonizator.sidebarCollapsed") === "true");
  const [analyserVisited, setAnalyserVisited] = useState(false);
  const [appVersion, setAppVersion] = useState(currentRelease.version);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const startupRouteResolved = useRef(false);
  const previousScreen = useRef<Screen>(screen);
  const viewedDeadlineWarnings = useRef<number[]>([]);

  useEffect(() => {
    let active = true;
    void settingsService.getUpdateStatus().then((status) => {
      if (!active) return;
      setAppVersion(status.currentVersion);
      if (status.currentVersion !== currentRelease.version || !currentRelease.notes.length) return;
      if (window.localStorage.getItem(releaseNotesStorageKey) !== currentRelease.fingerprint) setReleaseNotesOpen(true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (warningState.isLoading || startupRouteResolved.current) return;
    startupRouteResolved.current = true;
    if (startupWarnings.length) setScreen("warnings");
  }, [startupWarnings, warningState.isLoading]);

  useEffect(() => {
    if (screen === "warnings") {
      viewedDeadlineWarnings.current = startupWarnings.flatMap((warning) => {
        const match = /^deadline-reminder-(\d+)$/u.exec(warning.code);
        return match ? [Number(match[1])] : [];
      });
    } else if (previousScreen.current === "warnings" && viewedDeadlineWarnings.current.length) {
      const ids = viewedDeadlineWarnings.current;
      viewedDeadlineWarnings.current = [];
      void deadlineReminderService.acknowledgeWarnings(ids).then(() => refreshWarnings()).catch(() => undefined);
    }
    previousScreen.current = screen;
  }, [screen, startupWarnings, refreshWarnings]);

  const togglePerson = (id: number) => setSelectedPeople((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleAllPeople = () => setSelectedPeople((current) => current.length === people.length ? [] : people.map((person) => person.id));
  const clearSelectedPeople = () => setSelectedPeople([]);
  const toggleTemplate = (template: Template) => setSelectedTemplate((current) => current?.sourcePath === template.sourcePath ? null : template);

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

  const closeReleaseNotes = () => {
    window.localStorage.setItem(releaseNotesStorageKey, currentRelease.fingerprint);
    setReleaseNotesOpen(false);
  };

  useEffect(() => {
    const closeOnBackdrop = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains("modal-backdrop")) target.querySelector<HTMLButtonElement>(".modal-actions .button")?.click();
    };
    document.addEventListener("click", closeOnBackdrop);
    return () => document.removeEventListener("click", closeOnBackdrop);
  }, []);

  return <NotificationProvider><GlobalTooltip /><DeadlineReminderNotifications /><div className={`product-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <AppSidebar screen={screen} collapsed={sidebarCollapsed} warnings={startupWarnings} appVersion={appVersion} onToggleCollapsed={toggleSidebar} onNavigate={(next) => { if (next === "report-analyser") setAnalyserVisited(true); setScreen(next); }} />
    <main className="workspace">
      {screen === "warnings" && <WarningsPage warnings={startupWarnings} isLoading={warningState.isLoading} onRefresh={() => void warningState.refresh()} onOpenPersonnel={() => setScreen("people")} onOpenPositions={() => setScreen("positions")} />}
      {screen === "generator" && <ReportGenerationPage template={selectedTemplate} templates={templates} hasMoreTemplates={templatesHasMore} isLoadingMoreTemplates={templatesLoadingMore} onLoadMoreTemplates={loadMoreTemplates} people={people} hasMorePeople={personnelHasMore} isLoadingMorePeople={personnelLoadingMore} onLoadMorePeople={loadMorePersonnel} selected={selectedPeople} onToggle={togglePerson} onAll={toggleAllPeople} onClear={clearSelectedPeople} onReorder={setSelectedPeople} onChoose={toggleTemplate} />}
      {screen === "templates" && <TemplatesPage templates={templates} totalCount={templatesTotalCount} hasMore={templatesHasMore} isRefreshing={templatesRefreshing} isLoadingMore={templatesLoadingMore} errorMessage={templatesError} onLoadMore={loadMoreTemplates} selected={templateInfo ?? templates[0] ?? null} onSelect={setTemplateInfo} onRefresh={refreshTemplates} />}
      {(screen === "report-analyser" || analyserVisited) && <div className="persistent-screen" hidden={screen !== "report-analyser"}><ReportAnalyserPage onCreated={(createdPath) => { void refreshTemplates().then((items) => { setTemplateInfo(items.find((template) => template.sourcePath === createdPath) ?? null); setScreen("templates"); }); }} /></div>}
      {screen === "people" && <PersonnelPage people={people} totalCount={personnelTotalCount} hasMore={personnelHasMore} isLoading={personnelLoading} isLoadingMore={personnelLoadingMore} errorMessage={personnelError} onCreate={createPersonnel} onUpdate={updatePersonnel} onDelete={deletePersonnel} onRefresh={refreshPersonnel} onLoadMore={loadMorePersonnel} />}
      {!isSimpleEdition && screen === "staffing-bcs" && <StaffingBcsPage />}
      {!isSimpleEdition && screen === "flight-planning" && <FlightPlanningPage />}
      {!isSimpleEdition && screen === "flight-journal" && <FlightJournalPage />}
      {!isSimpleEdition && screen === "positions" && <PositionsPage />}
      {!isSimpleEdition && screen === "assets" && <AssetsPage people={people} />}
      {!isSimpleEdition && screen === "vehicles" && <VehiclesPage people={people} />}
      {!isSimpleEdition && screen === "generators" && <EquipmentPage category="generator" people={people} />}
      {!isSimpleEdition && screen === "uavs" && <EquipmentPage category="uav" people={people} />}
      {!isSimpleEdition && screen === "communications" && <EquipmentPage category="communications" people={people} />}
      {!isSimpleEdition && screen === "weapons" && <EquipmentPage category="weapon_ammo" people={people} />}
      {!isSimpleEdition && screen === "crews" && <CrewsPage people={people} />}
      {!isSimpleEdition && screen === "incidents" && <IncidentsPage />}
      {!isSimpleEdition && screen === "summary-report" && <SummaryReportPage />}
      {screen === "generated" && <GeneratedReportsPage />}
      {screen === "settings" && <SettingsPage />}
      {!isSimpleEdition && screen === "documentation" && <ProgramGuidePage />}
    </main>
    {releaseNotesOpen && <ReleaseNotesModal version={currentRelease.version} notes={currentRelease.notes} onClose={closeReleaseNotes} />}
  </div></NotificationProvider>;
}
