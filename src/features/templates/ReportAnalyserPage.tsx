import { open } from "@tauri-apps/plugin-dialog";
import { renderAsync } from "docx-preview";
import { Check, FileText, FolderOpen, LoaderCircle, Replace, Trash2, Undo2, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import type { TemplateAnalysis, TemplateAnalysisProposal, TemplateAnalysisReplacement } from "../../shared/types/domain";
import { templateService } from "./services/templateService";

type ManualReplacement = { id: string; value: string; replacement: string; occurrence: number };

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function proposalKey(proposal: Pick<TemplateAnalysisProposal, "value" | "token">) { return `${proposal.value}\u0000${proposal.token}`; }

export function ReportAnalyserPage({ onCreated, onOpenConstructor }: { onCreated: (templatePath: string) => void; onOpenConstructor: () => void }) {
  const [path, setPath] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TemplateAnalysis | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState<ManualReplacement[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [selectedOccurrence, setSelectedOccurrence] = useState(0);
  const [replacementInput, setReplacementInput] = useState("");
  const [tokenOverrides, setTokenOverrides] = useState<Record<string, string>>({});
  const [templateName, setTemplateName] = useState("");
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewError, setPreviewError] = useState("");
  const { notify } = useNotifications();
  const selectedProposals = useMemo(() => analysis?.proposals.filter((proposal) => selected.includes(proposalKey(proposal))) ?? [], [analysis, selected]);
  const replacements = useMemo<TemplateAnalysisReplacement[]>(() => [
    ...selectedProposals.map((proposal) => ({ value: proposal.value, token: tokenOverrides[proposalKey(proposal)] ?? proposal.token })),
    ...manual.map(({ value, replacement, occurrence }) => ({ value, token: "", replacement, occurrence }))
  ], [manual, selectedProposals, tokenOverrides]);
  useEffect(() => {
    if (!analysis || !path || !previewRef.current) return;
    let cancelled = false;
    const target = previewRef.current;
    setPreviewError("");
    void templateService.renderAnalysisPreview(path, replacements).then((bytes) => {
      if (cancelled) return;
      target.replaceChildren();
      return renderAsync(new Blob([new Uint8Array(bytes)]), target, target, {
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        experimental: true,
        renderHeaders: true,
        renderFooters: true,
        useBase64URL: true,
      });
    }).catch(() => { if (!cancelled) setPreviewError("Не вдалося відтворити сторінку документа."); });
    return () => { cancelled = true; };
  }, [analysis, path, replacements]);

  const analyse = async (reportPath: string) => {
    setIsAnalysing(true);
    try {
      const result = await templateService.analyseReport(reportPath);
      setAnalysis(result); setSelected(result.proposals.map(proposalKey)); setManual([]); setSelectedText(""); setTokenOverrides({});
      notify(result.proposals.length ? `Знайдено пропозицій: ${result.proposals.length}.` : "Відомі дані в рапорті не знайдені.", result.proposals.length ? "success" : "info");
    } catch (error) { notify(errorMessage(error, "Не вдалося проаналізувати рапорт."), "error"); }
    finally { setIsAnalysing(false); }
  };
  const choose = async () => {
    try {
      const value = await open({ title: "Оберіть готовий рапорт", filters: [{ name: "Документ Word", extensions: ["docx"] }] });
      if (!value || Array.isArray(value)) return;
      setPath(value); setAnalysis(null); setSelected([]); setManual([]); setSelectedText(""); setReplacementInput(""); setTemplateName(value.split(/[\\/]/).pop()?.replace(/\.docx$/i, "") + " — шаблон");
      await analyse(value);
    } catch { notify("Не вдалося відкрити вибір файлу.", "error"); }
  };
  const create = async () => {
    if (!path || !analysis) return;
    setIsCreating(true);
    try {
      const createdPath = await templateService.createFromAnalysis(path, templateName, replacements);
      notify("Новий шаблон створено в папці «Шаблони».", "success");
      onCreated(createdPath); setAnalysis(null); setSelected([]); setManual([]);
    } catch (error) { notify(errorMessage(error, "Не вдалося створити шаблон."), "error"); }
    finally { setIsCreating(false); }
  };
  const toggle = (proposal: TemplateAnalysisProposal) => {
    const key = proposalKey(proposal);
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };
  const rememberSelection = () => {
    const field = editorRef.current;
    if (!field) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !field.contains(selection.anchorNode)) return;
    const value = selection.toString();
    const range = selection.getRangeAt(0);
    const prefixRange = document.createRange();
    prefixRange.selectNodeContents(field);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const prefix = prefixRange.toString().toLocaleLowerCase("uk-UA");
    const needle = value.toLocaleLowerCase("uk-UA");
    let occurrence = 0;
    let offset = 0;
    while (needle && (offset = prefix.indexOf(needle, offset)) >= 0) { occurrence += 1; offset += needle.length; }
    setSelectedText(value);
    setSelectedOccurrence(occurrence);
  };
  const applyManualReplacement = () => {
    const value = selectedText;
    const replacement = replacementInput;
    if (!value) { notify("Виділіть текст або пробіли у документі.", "info"); return; }
    setManual((current) => [...current, { id: crypto.randomUUID(), value, replacement, occurrence: selectedOccurrence }]);
    setSelectedText(""); setReplacementInput(""); setSelectedOccurrence(0);
  };
  const deleteSelection = () => {
    if (!selectedText) return;
    setManual((current) => [...current, { id: crypto.randomUUID(), value: selectedText, replacement: "", occurrence: selectedOccurrence }]);
    setSelectedText(""); setReplacementInput(""); setSelectedOccurrence(0);
  };
  return <PageFrame className="report-analyser-page" tools={<section className="panel analyser-source"><div><small>Вихідний рапорт</small><b title={path ?? ""}>{path?.split(/[\\/]/).pop() ?? "Файл ще не обрано"}</b></div><button className="button primary" disabled={isAnalysing} onClick={() => void choose()}>{isAnalysing ? <LoaderCircle className="spin" /> : <FolderOpen />}{isAnalysing ? "Аналізуємо…" : "Обрати DOCX"}</button></section>}>
    {!analysis ? <section className="panel analyser-empty"><FileText /><h2>{isAnalysing ? "Аналізуємо рапорт…" : "Оберіть готовий рапорт"}</h2><p>{isAnalysing ? "Визначаємо можливі змінні та готуємо точний перегляд документа." : "Одразу після вибору файл буде проаналізовано."}</p></section> : <div className="analyser-layout">
      <section className="panel analyser-editor"><header><div><h2>Редактор шаблону</h2><p>Це точний локальний перегляд DOCX. Зміни, увімкнені праворуч, одразу відображаються у документі.</p></div><div className="analyser-editor__actions">{manual.length > 0 && <button className="icon-button" title="Скасувати останню ручну зміну" aria-label="Скасувати останню ручну зміну" onClick={() => setManual((current) => current.slice(0, -1))}><Undo2 /></button>}<b>{replacements.length} замін</b></div></header><div ref={editorRef} className="analyser-editor__text analyser-editor__document" onMouseUp={rememberSelection} onKeyUp={rememberSelection} aria-label="Текст документа для редагування"><div ref={previewRef} className="analyser-docx-preview" />{previewError && <p className="analyser-preview-error">{previewError}</p>}</div>{selectedText && <footer className="analyser-selection"><span>Виділено: <b>{selectedText}</b></span><input value={replacementInput} onChange={(event) => setReplacementInput(event.target.value)} placeholder="{{змінна}} або інший текст" aria-label="Нова заміна" /><button className="button primary" onClick={applyManualReplacement}><Replace />Застосувати</button><button className="icon-button danger" title="Видалити виділений текст" aria-label="Видалити виділений текст" onClick={deleteSelection}><Trash2 /></button></footer>}</section>
      <aside className="panel analyser-sidebar"><section className="analyser-proposals"><header><div><h2>Запропоновані заміни</h2><p>Зніміть позначку — у редакторі повернеться початковий текст.</p></div><div className="analyser-proposals__actions"><button className="icon-button" title="Відкрити конструктор змінних" aria-label="Відкрити конструктор змінних" onClick={onOpenConstructor}><WandSparkles /></button><b>{selectedProposals.length} обрано</b></div></header><div className="analyser-proposals__scroll">{analysis.proposals.map((proposal) => { const key = proposalKey(proposal); const activeToken = tokenOverrides[key] ?? proposal.token; return <div key={key} className={selected.includes(key) ? "analyser-proposal analyser-proposal--selected" : "analyser-proposal"}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(proposal)} /><div><span>{proposal.category}</span><b>{proposal.label}</b><code>{proposal.value}</code>{proposal.alternatives?.length > 0 && <div className="analyser-proposal__alternatives">{[{ token: proposal.token, label: "Автоматично" }, ...proposal.alternatives].map((alternative) => <button key={alternative.token} className={activeToken === alternative.token ? "active" : ""} title={alternative.label} onClick={() => setTokenOverrides((current) => ({ ...current, [key]: alternative.token }))}>{`{{${alternative.token}}}`}</button>)}</div>}</div><aside><code>{`{{${activeToken}}}`}</code><small>{proposal.occurrences} збіг{proposal.occurrences === 1 ? "" : "ів"}</small></aside></div>; })}{analysis.proposals.length === 0 && <p className="analyser-no-proposals">Збігів із даними програми не знайдено. Виділіть текст у редакторі й додайте потрібну заміну вручну.</p>}</div></section><footer className="analyser-create"><label>Назва файлу<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></label><p>Стиль, відступи та пробіли оригінального DOCX зберігаються; змінюється лише підтверджений текст.</p><button className="button primary" disabled={!templateName.trim() || isCreating} onClick={() => void create()}>{isCreating ? <LoaderCircle className="spin" /> : <Check />}Створити шаблон</button></footer></aside>
    </div>}
  </PageFrame>;
}
