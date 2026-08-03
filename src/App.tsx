import { useState } from "react";
import { BookOpen, FileCheck2, FileText, Folder, Home, Settings, Users } from "lucide-react";
import type { Screen, Template } from "./shared/types/domain";
import { usePersonnel } from "./features/personnel/hooks/usePersonnel";
import { ReportGenerationPage } from "./features/report-generation/ReportGenerationPage";
import { TemplatesPage } from "./features/templates/TemplatesPage";
import { PersonnelPage } from "./features/personnel/PersonnelPage";
import { GeneratedReportsPage } from "./features/generated-reports/GeneratedReportsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { DocumentationPage } from "./features/documentation/DocumentationPage";
import { useTemplates } from "./features/templates/hooks/useTemplates";
import { NotificationProvider } from "./shared/ui/NotificationProvider";

const navigation = [
  ["generator", "Генерація рапортів", Home], ["templates", "Шаблони", FileText], ["people", "Особовий склад", Users],
  ["generated", "Згенеровані рапорти", Folder], ["settings", "Налаштування", Settings], ["documentation", "Довідник", BookOpen]
] as const;

export default function App() {
  const [screen, setScreen] = useState<Screen>("generator");
  const { personnel: people } = usePersonnel();
  const { templates } = useTemplates();
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateInfo, setTemplateInfo] = useState<Template | null>(null);

  const togglePerson = (id: number) => setSelectedPeople((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleAllPeople = () => setSelectedPeople((current) => current.length === people.length ? [] : people.map((person) => person.id));
  const clearSelectedPeople = () => setSelectedPeople([]);
  const toggleTemplate = (template: Template) => setSelectedTemplate((current) => current?.name === template.name ? null : template);

  return <NotificationProvider><div className="product-shell"><aside className="sidebar"><div className="product-logo"><FileCheck2 /><div><b>Генератор рапортів</b><span>по шаблону</span></div></div><nav>{navigation.map(([id, label, Icon]) => <button key={id} onClick={() => setScreen(id)} className={screen === id ? "nav-active" : ""}><Icon size={23} />{label}</button>)}</nav><div className="version">Версія 1.0.0</div></aside><main className="workspace">{screen === "generator" && <ReportGenerationPage template={selectedTemplate} templates={templates} people={people} selected={selectedPeople} onToggle={togglePerson} onAll={toggleAllPeople} onClear={clearSelectedPeople} onChoose={toggleTemplate} />}{screen === "templates" && <TemplatesPage templates={templates} selected={templateInfo ?? templates[0] ?? null} onSelect={setTemplateInfo} />}{screen === "people" && <PersonnelPage people={people} />}{screen === "generated" && <GeneratedReportsPage />}{screen === "settings" && <SettingsPage />}{screen === "documentation" && <DocumentationPage />}</main></div></NotificationProvider>;
}
