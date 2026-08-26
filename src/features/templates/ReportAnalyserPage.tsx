import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { renderAsync } from "docx-preview";
import { Check, FileText, FolderOpen, LoaderCircle, Replace, SlidersHorizontal, Trash2, Undo2, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getVariable, modifierRegistry, tokenFor } from "../../shared/template-language/registry";
import { Modal } from "../../shared/ui/Modal";
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

type SelectedTemplateToken = { id: string; modifiers: string[] };

/** Accepts both a complete {{token}} and the token body selected inside Word preview. */
export function tokenSelectedInEditor(value: string): SelectedTemplateToken | null {
  const selected = value.trim();
  const body = selected.match(/^\{\{\s*([^{}]+?)\s*\}\}$/u)?.[1] ?? selected;
  if (!/^[\p{L}][\p{L}\p{N}_]*(?::[\p{L}_]+)*$/u.test(body)) return null;
  const [id, ...modifiers] = body.split(":");
  return getVariable(id) ? { id, modifiers } : null;
}

export function normaliseAnalysisProposals(proposals: TemplateAnalysisProposal[]) {
  return proposals.map((proposal) => {
    if (proposal.token !== "екіпаж_1") return proposal;
    return {
      ...proposal,
      token: "назва_екіпажу_1",
      label: "Назва екіпажу в документі",
      alternatives: [
        { token: "екіпаж_1_назва", label: "Назва обраного екіпажу" },
        { token: "військовий_1_екіпаж", label: "Екіпаж обраного військовослужбовця" },
        ...(proposal.alternatives ?? []).filter((item) => item.token !== "екіпаж_1" && item.token !== "назва_екіпажу_1"),
      ].filter((item, index, items) => items.findIndex((candidate) => candidate.token === item.token) === index),
    };
  });
}

export function defaultAnalysisSelection(proposals: TemplateAnalysisProposal[]) {
  return proposals.filter((proposal) => proposal.autoSelect).map(proposalKey);
}

export function ReportAnalyserPage({ onCreated, onOpenConstructor }: { onCreated: (templatePath: string) => void; onOpenConstructor: () => void }) {
  const [path, setPath] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TemplateAnalysis | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState<ManualReplacement[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [selectedOccurrence, setSelectedOccurrence] = useState(0);
  const [replacementInput, setReplacementInput] = useState("");
  const [modifierTarget, setModifierTarget] = useState<SelectedTemplateToken | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [tokenOverrides, setTokenOverrides] = useState<Record<string, string>>({});
  const [templateName, setTemplateName] = useState("");
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewError, setPreviewError] = useState("");
  const { notify } = useNotifications();
  useEffect(() => {
    if (!analysis?.proposals.some((proposal) => proposal.token === "екіпаж_1")) return;
    const proposals = normaliseAnalysisProposals(analysis.proposals);
    setAnalysis({ ...analysis, proposals });
    setSelected(defaultAnalysisSelection(proposals));
  }, [analysis]);
  const selectedProposals = useMemo(() => analysis?.proposals.filter((proposal) => selected.includes(proposalKey(proposal))) ?? [], [analysis, selected]);
  const selectedVariable = useMemo(() => modifierTarget ? getVariable(modifierTarget.id) : undefined, [modifierTarget]);
  const editableToken = useMemo(() => tokenSelectedInEditor(selectedText), [selectedText]);
  const proposalGroups = useMemo(() => analysis ? [
    { confidence: "high" as const, title: "Надійні збіги", items: analysis.proposals.filter((proposal) => proposal.confidence === "high") },
    { confidence: "medium" as const, title: "Потребують перевірки", items: analysis.proposals.filter((proposal) => proposal.confidence === "medium") },
  ].filter((group) => group.items.length > 0) : [], [analysis]);
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
      const proposals = normaliseAnalysisProposals(result.proposals);
      setAnalysis({ ...result, proposals }); setSelected(defaultAnalysisSelection(proposals)); setManual([]); setSelectedText(""); setTokenOverrides({});
      notify(proposals.length ? `Знайдено пропозицій: ${proposals.length}.` : "Відомі дані в рапорті не знайдені.", proposals.length ? "success" : "info");
    } catch (error) { notify(errorMessage(error, "Не вдалося проаналізувати рапорт."), "error"); }
    finally { setIsAnalysing(false); }
  };
  const resetSource = () => {
    setPath(null); setAnalysis(null); setSelected([]); setManual([]); setSelectedText(""); setModifierTarget(null);
    setSelectedOccurrence(0); setReplacementInput(""); setTokenOverrides({}); setTemplateName(""); setPreviewError("");
  };
  const selectSource = async (reportPath: string) => {
    if (!/\.docx$/iu.test(reportPath)) { notify("Оберіть файл DOCX.", "info"); return; }
    setPath(reportPath); setAnalysis(null); setSelected([]); setManual([]); setSelectedText(""); setModifierTarget(null); setReplacementInput(""); setTokenOverrides({});
    setTemplateName(reportPath.split(/[\\/]/).pop()?.replace(/\.docx$/i, "") + " — шаблон");
    await analyse(reportPath);
  };
  const choose = async () => {
    try {
      const value = await open({ title: "Оберіть готовий рапорт", filters: [{ name: "Документ Word", extensions: ["docx"] }] });
      if (!value || Array.isArray(value)) return;
      await selectSource(value);
    } catch { notify("Не вдалося відкрити вибір файлу.", "error"); }
  };
  // The native listener is registered once; it calls the selection workflow for dropped files.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "enter") setIsDraggingFile(true);
      if (event.payload.type === "leave") setIsDraggingFile(false);
      if (event.payload.type === "drop") {
        setIsDraggingFile(false);
        const [file] = event.payload.paths;
        if (file) void selectSource(file);
      }
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    setModifierTarget(null);
  };
  const applyManualReplacement = () => {
    const value = selectedText;
    const replacement = replacementInput;
    if (!value) { notify("Виділіть текст або пробіли у документі.", "info"); return; }
    setManual((current) => [...current, { id: crypto.randomUUID(), value, replacement, occurrence: selectedOccurrence }]);
    setSelectedText(""); setReplacementInput(""); setSelectedOccurrence(0);
    setModifierTarget(null);
  };
  const deleteSelection = () => {
    if (!selectedText) return;
    setManual((current) => [...current, { id: crypto.randomUUID(), value: selectedText, replacement: "", occurrence: selectedOccurrence }]);
    setSelectedText(""); setReplacementInput(""); setSelectedOccurrence(0);
    setModifierTarget(null);
  };
  const openModifiers = () => {
    if (!editableToken) { notify("Виділіть лише змінну між {{…}}, щоб додати модифікатори.", "info"); return; }
    setModifierTarget(editableToken); setSelectedModifiers(editableToken.modifiers);
  };
  const toggleModifier = (id: string) => {
    const group = modifierRegistry.find((modifier) => modifier.id === id)?.group;
    setSelectedModifiers((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (group === "case" || group === "text") return [...current.filter((item) => modifierRegistry.find((modifier) => modifier.id === item)?.group !== group), id];
      return [...current, id];
    });
  };
  const useModifiers = () => {
    if (!modifierTarget) return;
    setReplacementInput(tokenFor(modifierTarget.id, selectedModifiers));
    setModifierTarget(null);
  };
  return <PageFrame className="report-analyser-page" tools={<section className="panel analyser-source"><div><small>Вихідний рапорт</small><b title={path ?? ""}>{path?.split(/[\\/]/).pop() ?? "Файл ще не обрано"}</b></div>{path && <button className="icon-button" title="Скасувати вибір файлу" aria-label="Скасувати вибір файлу" disabled={isAnalysing} onClick={resetSource}><X /></button>}<button className="button primary" disabled={isAnalysing} onClick={() => void choose()}>{isAnalysing ? <LoaderCircle className="spin" /> : <FolderOpen />}{isAnalysing ? "Аналізуємо…" : "Обрати DOCX"}</button></section>}>
    {!analysis ? <section className={`panel analyser-empty ${isDraggingFile ? "analyser-empty--dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDraggingFile(true); }} onDragLeave={() => setIsDraggingFile(false)} onDrop={(event) => { event.preventDefault(); setIsDraggingFile(false); }}><FileText /><h2>{isAnalysing ? "Аналізуємо рапорт…" : isDraggingFile ? "Відпустіть DOCX-файл" : "Оберіть готовий рапорт"}</h2><p>{isAnalysing ? "Визначаємо можливі змінні та готуємо точний перегляд документа." : "Перетягніть DOCX сюди або натисніть «Обрати DOCX». Після вибору файл буде проаналізовано."}</p></section> : <div className="analyser-layout">
      <section className="panel analyser-editor"><header><div><h2>Редактор шаблону</h2><p>Це точний локальний перегляд DOCX. Зміни, увімкнені праворуч, одразу відображаються у документі.</p></div><div className="analyser-editor__actions">{manual.length > 0 && <button className="icon-button" title="Скасувати останню ручну зміну" aria-label="Скасувати останню ручну зміну" onClick={() => setManual((current) => current.slice(0, -1))}><Undo2 /></button>}<b>{replacements.length} замін</b></div></header><div ref={editorRef} className="analyser-editor__text analyser-editor__document" onMouseUp={rememberSelection} onKeyUp={rememberSelection} aria-label="Текст документа для редагування"><div ref={previewRef} className="analyser-docx-preview" />{previewError && <p className="analyser-preview-error">{previewError}</p>}</div>{selectedText && <footer className="analyser-selection"><span>Виділено: <b>{selectedText}</b></span><input value={replacementInput} onChange={(event) => setReplacementInput(event.target.value)} placeholder="{{змінна}} або інший текст" aria-label="Нова заміна" />{editableToken && <button className="button analyser-modifier-button" onClick={openModifiers}><SlidersHorizontal />Модифікатори</button>}<button className="button primary" onClick={applyManualReplacement}><Replace />Застосувати</button><button className="icon-button danger" title="Видалити виділений текст" aria-label="Видалити виділений текст" onClick={deleteSelection}><Trash2 /></button></footer>}</section>
      <aside className="panel analyser-sidebar"><section className="analyser-proposals"><header><div><h2>Запропоновані заміни</h2><p>Автоматично ввімкнені лише однозначні збіги. Решту підтвердьте вручну.</p></div><div className="analyser-proposals__actions"><button className="icon-button" title="Відкрити конструктор змінних" aria-label="Відкрити конструктор змінних" onClick={onOpenConstructor}><WandSparkles /></button><b>{selectedProposals.length} обрано</b></div></header><div className="analyser-proposals__scroll">{proposalGroups.map((group) => <section className={`analyser-proposal-group analyser-proposal-group--${group.confidence}`} key={group.confidence}><header><b>{group.title}</b><span>{group.items.length}</span></header>{group.items.map((proposal) => { const key = proposalKey(proposal); const activeToken = tokenOverrides[key] ?? proposal.token; return <div key={key} title={proposal.reason} className={selected.includes(key) ? "analyser-proposal analyser-proposal--selected" : "analyser-proposal"}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(proposal)} /><div><span>{proposal.category}</span><b>{proposal.label}</b><code>{proposal.value}</code><small className="analyser-proposal__reason">{proposal.reason}</small>{proposal.alternatives?.length > 0 && <div className="analyser-proposal__alternatives">{[{ token: proposal.token, label: "Автоматично" }, ...proposal.alternatives].map((alternative) => <button key={alternative.token} className={activeToken === alternative.token ? "active" : ""} title={alternative.label} onClick={() => setTokenOverrides((current) => ({ ...current, [key]: alternative.token }))}>{`{{${alternative.token}}}`}</button>)}</div>}</div><aside><span className={`analyser-confidence analyser-confidence--${proposal.confidence}`}>{proposal.confidence === "high" ? "Надійна" : "Перевірте"}</span><code>{`{{${activeToken}}}`}</code><small>{proposal.occurrences} збіг{proposal.occurrences === 1 ? "" : "ів"}</small></aside></div>; })}</section>)}{analysis.proposals.length === 0 && <p className="analyser-no-proposals">Збігів із даними програми не знайдено. Виділіть текст у редакторі й додайте потрібну заміну вручну.</p>}</div></section><footer className="analyser-create"><label>Назва файлу<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></label><p>Стиль, відступи та пробіли оригінального DOCX зберігаються; змінюється лише підтверджений текст.</p><button className="button primary" disabled={!templateName.trim() || isCreating} onClick={() => void create()}>{isCreating ? <LoaderCircle className="spin" /> : <Check />}Створити шаблон</button></footer></aside>
    </div>}{modifierTarget && selectedVariable && <Modal title={`Модифікатори: ${selectedVariable.name}`} onClose={() => setModifierTarget(null)} className="analyser-modifier-modal"><p>Відмінок і регістр можна обрати лише по одному. Жирний шрифт і підкреслення можна комбінувати.</p><div className="analyser-modifier-groups">{(["case", "text", "style"] as const).map((group) => <section key={group}><h3>{group === "case" ? "Відмінок" : group === "text" ? "Регістр" : "Форматування"}</h3><div>{modifierRegistry.filter((modifier) => modifier.group === group).map((modifier) => { const unavailable = group === "case" && !selectedVariable.supportsCases; return <label key={modifier.id} className={unavailable ? "disabled" : ""}><input type={group === "case" || group === "text" ? "radio" : "checkbox"} name={group} disabled={unavailable} checked={selectedModifiers.includes(modifier.id)} onChange={() => toggleModifier(modifier.id)} />{modifier.name}</label>; })}</div></section>)}</div><footer className="modal-actions"><code>{tokenFor(modifierTarget.id, selectedModifiers)}</code><button className="button" onClick={() => setModifierTarget(null)}>Скасувати</button><button className="button primary" onClick={useModifiers}>Вставити змінну</button></footer></Modal>}
  </PageFrame>;
}
