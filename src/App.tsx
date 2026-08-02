import { useEffect, useState } from "react";
import { FileCheck2, FileText, Folder, Home, Settings, Users } from "lucide-react";
import { desktop } from "./lib/desktop";
import { samplePeople, templates } from "./shared/constants/mock-data";
import type { Person, Screen, Template } from "./shared/types/domain";
import { ReportGenerationPage } from "./features/report-generation/ReportGenerationPage";
import { TemplatesPage } from "./features/templates/TemplatesPage";
import { PersonnelPage } from "./features/personnel/PersonnelPage";
import { GeneratedReportsPage } from "./features/generated-reports/GeneratedReportsPage";
import { SettingsPage } from "./features/settings/SettingsPage";

const navigation = [
  ["generator", "Генерація рапортів", Home], ["templates", "Шаблони", FileText], ["people", "Особовий склад", Users],
  ["generated", "Згенеровані рапорти", Folder], ["settings", "Налаштування", Settings]
] as const;

export default function App() {
  const [screen, setScreen] = useState<Screen>("generator");
  const [people, setPeople] = useState<Person[]>(samplePeople);
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateInfo, setTemplateInfo] = useState(templates[0]);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [settingsTab, setSettingsTab] = useState<"paths" | "signers">("paths");

  useEffect(() => { desktop.listPeople().then((saved) => saved.length && setPeople(saved)).catch(() => undefined); }, []);
  const togglePerson = (id: number) => setSelectedPeople((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleAllPeople = () => setSelectedPeople((current) => current.length === people.length ? [] : people.map((person) => person.id));

  return <div className="product-shell"><aside className="sidebar"><div className="product-logo"><FileCheck2 /><div><b>Генератор рапортів</b><span>по шаблону</span></div></div><nav>{navigation.map(([id, label, Icon]) => <button key={id} onClick={() => setScreen(id)} className={screen === id ? "nav-active" : ""}><Icon size={23} />{label}</button>)}</nav><div className="version">Версія 1.0.0</div></aside><main className="workspace">{screen === "generator" && <ReportGenerationPage template={selectedTemplate} people={people} selected={selectedPeople} onToggle={togglePerson} onAll={toggleAllPeople} onChoose={setSelectedTemplate} />}{screen === "templates" && <TemplatesPage selected={templateInfo} onSelect={setTemplateInfo} />}{screen === "people" && <PersonnelPage people={people} detailsOpen={detailsOpen} onDetails={() => setDetailsOpen((value) => !value)} />}{screen === "generated" && <GeneratedReportsPage />}{screen === "settings" && <SettingsPage active={settingsTab} onChange={setSettingsTab} />}</main></div>;
}
