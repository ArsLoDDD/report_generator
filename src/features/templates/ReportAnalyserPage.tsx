import { open } from "@tauri-apps/plugin-dialog";
import { Check, FileSearch, FileText, FolderOpen, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import type { TemplateAnalysis, TemplateAnalysisProposal } from "../../shared/types/domain";
import { templateService } from "./services/templateService";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function ReportAnalyserPage({ onCreated }: { onCreated: (templatePath: string) => void }) {
  const [path, setPath] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TemplateAnalysis | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { notify } = useNotifications();
  const selectedProposals = useMemo(() => analysis?.proposals.filter((proposal) => selected.includes(`${proposal.value}\u0000${proposal.token}`)) ?? [], [analysis, selected]);

  const choose = async () => {
    try {
      const value = await open({ title: "Оберіть готовий рапорт", filters: [{ name: "Документ Word", extensions: ["docx"] }] });
      if (!value || Array.isArray(value)) return;
      setPath(value); setAnalysis(null); setSelected([]); setTemplateName(value.split(/[\\/]/).pop()?.replace(/\.docx$/i, "") + " — шаблон");
    } catch { notify("Не вдалося відкрити вибір файлу.", "error"); }
  };
  const analyse = async () => {
    if (!path) return;
    setIsAnalysing(true);
    try {
      const result = await templateService.analyseReport(path);
      setAnalysis(result);
      setSelected(result.proposals.map((proposal) => `${proposal.value}\u0000${proposal.token}`));
      notify(result.proposals.length ? `Знайдено пропозицій: ${result.proposals.length}.` : "Відомі дані в рапорті не знайдені.", result.proposals.length ? "success" : "info");
    } catch (error) { notify(errorMessage(error, "Не вдалося проаналізувати рапорт."), "error"); }
    finally { setIsAnalysing(false); }
  };
  const create = async () => {
    if (!path || !analysis) return;
    setIsCreating(true);
    try {
      const createdPath = await templateService.createFromAnalysis(path, templateName, selectedProposals);
      notify("Новий шаблон створено в папці «Шаблони».", "success");
      onCreated(createdPath); setAnalysis(null); setSelected([]);
    } catch (error) { notify(errorMessage(error, "Не вдалося створити шаблон."), "error"); }
    finally { setIsCreating(false); }
  };
  const toggle = (value: string, token: string) => {
    const key = `${value}\u0000${token}`;
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };
  return <PageFrame className="report-analyser-page" header={<PageTitle title="Аналізатор рапортів" subtitle="Перетворіть готовий DOCX-рапорт на шаблон із підтвердженими змінними" />} tools={<>
    <section className="panel analyser-source"><div><small>Вихідний рапорт</small><b>{path?.split(/[\\/]/).pop() ?? "Файл ще не обрано"}</b></div><button className="button" onClick={() => void choose()}><FolderOpen />Обрати DOCX</button><button className="button primary" disabled={!path || isAnalysing} onClick={() => void analyse()}>{isAnalysing ? <LoaderCircle className="spin" /> : <FileSearch />}Аналізувати</button></section>
  </>}>
    {!analysis ? <section className="panel analyser-empty"><FileText /><h2>Оберіть готовий рапорт</h2><p>Після аналізу тут з’являться знайдені ПІБ, звання, посади, дані підписантів та автомобілів.</p></section> : <div className="analyser-layout">
      <section className="panel analyser-proposals"><header><div><h2>Запропоновані заміни</h2><p>Позначте лише ті значення, які справді мають стати змінними.</p></div><b>{selectedProposals.length} обрано</b></header><div className="analyser-proposals__scroll">{analysis.proposals.map((proposal) => { const key = `${proposal.value}\u0000${proposal.token}`; return <label key={key} className={selected.includes(key) ? "analyser-proposal analyser-proposal--selected" : "analyser-proposal"}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(proposal.value, proposal.token)} /><div><span>{proposal.category}</span><b>{proposal.label}</b><code>{proposal.value}</code></div><aside><code>{`{{${proposal.token}}}`}</code><small>{proposal.occurrences} збіг{proposal.occurrences === 1 ? "" : "ів"}</small></aside></label>; })}{analysis.proposals.length === 0 && <p className="analyser-no-proposals">Збігів із даними програми не знайдено. Заповніть особовий склад або налаштування підписантів і повторіть аналіз.</p>}</div></section>
      <aside className="panel analyser-result"><h2>Новий шаблон</h2><label>Назва файлу<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></label><p>У новий файл буде внесено {selectedProposals.length} підтверджених замін.</p><button className="button primary" disabled={!templateName.trim() || isCreating} onClick={() => void create()}>{isCreating ? <LoaderCircle className="spin" /> : <Check />}Створити шаблон</button><hr /><h3>Фрагмент документа</h3><pre>{analysis.textPreview || "Текст не знайдено."}</pre></aside>
    </div>}
  </PageFrame>;
}
