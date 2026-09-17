import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { renderAsync } from "docx-preview";
import { Check, FileText, FolderOpen, LoaderCircle, Replace, SlidersHorizontal, Trash2, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getVariable, modifierRegistry, tokenFor } from "../../shared/template-language/registry";
import { PageFrame } from "../../shared/ui/PageFrame";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import type { TemplateAnalysis, TemplateAnalysisProposal, TemplateAnalysisReplacement } from "../../shared/types/domain";
import { templateService } from "./services/templateService";
import { AnalysisProposalList } from "./analysis/AnalysisProposalList";
import { ModifierModal } from "./analysis/ModifierModal";
import { analysisErrorMessage, defaultAnalysisSelection, normaliseAnalysisProposals, normaliseManualReplacement, normaliseSelectedTokenText, proposalKey, tokenSelectedInEditor, type ManualReplacement, type SelectedTemplateToken } from "./analysis/analysisModel";

export { defaultAnalysisSelection, normaliseAnalysisProposals, normaliseManualReplacement, normaliseSelectedTokenText, tokenSelectedInEditor } from "./analysis/analysisModel";

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
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const sourcePanelRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const analysisRevisionRef = useRef(0);
  const previewRevisionRef = useRef(0);
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
    const revision = ++previewRevisionRef.current;
    setPreviewError("");
    setPreviewState("loading");
    const timeout = window.setTimeout(() => {
      void templateService.renderAnalysisPreview(path, replacements).then(async (bytes) => {
        const staging = document.createElement("div");
        await renderAsync(new Blob([new Uint8Array(bytes)]), staging, staging, {
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          experimental: true,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true,
        });
        if (cancelled || revision !== previewRevisionRef.current) return;
        target.replaceChildren(...staging.childNodes);
        setPreviewState("ready");
      }).catch((error) => {
        if (cancelled || revision !== previewRevisionRef.current) return;
        setPreviewError(analysisErrorMessage(error, "Не вдалося відтворити сторінку документа."));
        setPreviewState("error");
      });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [analysis, path, replacements]);

  const analyse = async (reportPath: string, revision: number) => {
    setIsAnalysing(true);
    try {
      const result = await templateService.analyseReport(reportPath);
      if (revision !== analysisRevisionRef.current) return;
      const proposals = normaliseAnalysisProposals(result.proposals);
      setAnalysis({ ...result, proposals }); setSelected(defaultAnalysisSelection(proposals)); setManual([]); setSelectedText(""); setTokenOverrides({});
      notify(proposals.length ? `Знайдено пропозицій: ${proposals.length}.` : "Відомі дані в рапорті не знайдені.", proposals.length ? "success" : "info");
    } catch (error) { if (revision === analysisRevisionRef.current) notify(analysisErrorMessage(error, "Не вдалося проаналізувати рапорт."), "error"); }
    finally { if (revision === analysisRevisionRef.current) setIsAnalysing(false); }
  };
  const resetSource = () => {
    analysisRevisionRef.current += 1; previewRevisionRef.current += 1;
    setPath(null); setAnalysis(null); setSelected([]); setManual([]); setSelectedText(""); setModifierTarget(null);
    setSelectedOccurrence(0); setReplacementInput(""); setTokenOverrides({}); setTemplateName(""); setPreviewError(""); setPreviewState("idle"); setIsAnalysing(false);
  };
  const selectSource = async (reportPath: string) => {
    if (!/\.docx$/iu.test(reportPath)) { notify("Оберіть файл DOCX.", "info"); return; }
    const revision = ++analysisRevisionRef.current;
    previewRevisionRef.current += 1;
    setPath(reportPath); setAnalysis(null); setSelected([]); setManual([]); setSelectedText(""); setModifierTarget(null); setReplacementInput(""); setTokenOverrides({});
    setPreviewState("idle"); setPreviewError("");
    setTemplateName(reportPath.split(/[\\/]/).pop()?.replace(/\.docx$/i, "") + " — шаблон");
    await analyse(reportPath, revision);
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
      const isVisible = document.visibilityState === "visible" && Boolean(sourcePanelRef.current) && !sourcePanelRef.current?.closest("[hidden]");
      if (!isVisible) { setIsDraggingFile(false); return; }
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
    if (!path || !analysis || previewState !== "ready") return;
    const previewRevision = previewRevisionRef.current;
    let preflightPassed = false;
    setIsCreating(true);
    try {
      // The same backend transformation is a preflight: it verifies the source
      // fingerprint and proves these exact replacements are still renderable.
      await templateService.renderAnalysisPreview(path, replacements);
      preflightPassed = true;
      if (previewRevision !== previewRevisionRef.current) {
        notify("Зміни ще оновлюються у перегляді. Дочекайтеся актуальної версії.", "info");
        return;
      }
      const createdPath = await templateService.createFromAnalysis(path, templateName, replacements);
      notify("Новий шаблон створено в папці «Шаблони».", "success");
      onCreated(createdPath); setAnalysis(null); setSelected([]); setManual([]);
    } catch (error) {
      const message = analysisErrorMessage(error, "Не вдалося створити шаблон.");
      if (!preflightPassed) { setPreviewState("error"); setPreviewError(message); }
      notify(message, "error");
    }
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
    const suffixRange = document.createRange();
    suffixRange.selectNodeContents(field);
    suffixRange.setStart(range.endContainer, range.endOffset);
    const normalised = normaliseSelectedTokenText(value, prefixRange.toString(), suffixRange.toString());
    const prefix = normalised.prefix.toLocaleLowerCase("uk-UA");
    const needle = normalised.value.toLocaleLowerCase("uk-UA");
    let occurrence = 0;
    let offset = 0;
    while (needle && (offset = prefix.indexOf(needle, offset)) >= 0) { occurrence += 1; offset += needle.length; }
    setSelectedText(normalised.value);
    setSelectedOccurrence(occurrence);
    setModifierTarget(null);
  };
  const applyManualReplacement = () => {
    const value = selectedText;
    if (!value) { notify("Виділіть текст або пробіли у документі.", "info"); return; }
    const replacement = normaliseManualReplacement(replacementInput);
    if (replacement.error || replacement.value === undefined) {
      notify(replacement.error ?? "Некоректна заміна.", "error");
      return;
    }
    setManual((current) => [...current, { id: crypto.randomUUID(), value, replacement: replacement.value!, occurrence: selectedOccurrence }]);
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
  return <PageFrame className="report-analyser-page" tools={<section ref={sourcePanelRef} className="panel analyser-source"><div><small>Вихідний рапорт</small><b title={path ?? ""}>{path?.split(/[\\/]/).pop() ?? "Файл ще не обрано"}</b></div>{path && <button className="icon-button" title="Скасувати вибір файлу" aria-label="Скасувати вибір файлу" disabled={isAnalysing} onClick={resetSource}><X /></button>}<button className="button primary" disabled={isAnalysing} onClick={() => void choose()}>{isAnalysing ? <LoaderCircle className="spin" /> : <FolderOpen />}{isAnalysing ? "Аналізуємо…" : "Обрати DOCX"}</button></section>}>
    {!analysis ? <section className={`panel analyser-empty ${isDraggingFile ? "analyser-empty--dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDraggingFile(true); }} onDragLeave={() => setIsDraggingFile(false)} onDrop={(event) => { event.preventDefault(); setIsDraggingFile(false); }}><FileText /><h2>{isAnalysing ? "Аналізуємо рапорт…" : isDraggingFile ? "Відпустіть DOCX-файл" : "Оберіть готовий рапорт"}</h2><p>{isAnalysing ? "Визначаємо можливі змінні та готуємо точний перегляд документа." : "Перетягніть DOCX сюди або натисніть «Обрати DOCX». Після вибору файл буде проаналізовано."}</p></section> : <div className="analyser-layout">
      <section className="panel analyser-editor"><header><div><h2>Редактор шаблону</h2><p>Це точний локальний перегляд DOCX. Зміни, увімкнені праворуч, одразу відображаються у документі.</p></div><div className="analyser-editor__actions">{manual.length > 0 && <button className="icon-button" title="Скасувати останню ручну зміну" aria-label="Скасувати останню ручну зміну" onClick={() => setManual((current) => current.slice(0, -1))}><Undo2 /></button>}<span className={`analyser-preview-status analyser-preview-status--${previewState}`} role="status">{previewState === "loading" ? "Оновлюємо…" : previewState === "ready" ? "Актуальний" : previewState === "error" ? "Помилка" : "Очікує"}</span><b>{replacements.length} замін</b></div></header><div ref={editorRef} className="analyser-editor__text analyser-editor__document" tabIndex={0} onMouseUp={rememberSelection} onKeyUp={rememberSelection} aria-label="Текст документа для редагування"><div ref={previewRef} className="analyser-docx-preview" />{previewError && <p className="analyser-preview-error" role="alert">{previewError}</p>}</div>{selectedText && <footer className="analyser-selection"><span>Виділено: <b>{selectedText}</b></span><input value={replacementInput} onChange={(event) => setReplacementInput(event.target.value)} placeholder="{{змінна}} або інший текст" aria-label="Нова заміна" />{editableToken && <button className="button analyser-modifier-button" onClick={openModifiers}><SlidersHorizontal />Модифікатори</button>}<button className="button primary" onClick={applyManualReplacement}><Replace />Застосувати</button><button className="icon-button danger" title="Видалити виділений текст" aria-label="Видалити виділений текст" onClick={deleteSelection}><Trash2 /></button></footer>}</section>
      <aside className="panel analyser-sidebar"><AnalysisProposalList groups={proposalGroups} proposalCount={analysis.proposals.length} selected={selected} selectedCount={selectedProposals.length} tokenOverrides={tokenOverrides} onToggle={toggle} onOverride={(key, token) => setTokenOverrides((current) => ({ ...current, [key]: token }))} onOpenConstructor={onOpenConstructor} /><footer className="analyser-create"><label>Назва файлу<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></label><p>{previewState === "loading" ? "Зачекайте: перевіряємо останні зміни у документі." : "Стиль, відступи та пробіли оригінального DOCX зберігаються; змінюється лише підтверджений текст."}</p><button className="button primary" disabled={!templateName.trim() || isCreating || previewState !== "ready"} onClick={() => void create()}>{isCreating || previewState === "loading" ? <LoaderCircle className="spin" /> : <Check />}{isCreating ? "Перевіряємо…" : "Створити шаблон"}</button></footer></aside>
    </div>}{modifierTarget && selectedVariable && <ModifierModal target={modifierTarget} variable={selectedVariable} selected={selectedModifiers} onToggle={toggleModifier} onClose={() => setModifierTarget(null)} onApply={useModifiers} />}
  </PageFrame>;
}
