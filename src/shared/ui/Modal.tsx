import { X } from "lucide-react";
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  className?: string;
};

const modalRootSelector = "[data-modal-root]";
const ModalDepthContext = createContext(0);

function topModal() {
  const modals = [...document.querySelectorAll<HTMLElement>(modalRootSelector)];
  const deepest = Math.max(...modals.map((modal) => Number(modal.dataset.modalDepth) || 0));
  const topLayer = modals.filter((modal) => (Number(modal.dataset.modalDepth) || 0) === deepest);
  return topLayer[topLayer.length - 1] ?? null;
}

function isTopModal(backdrop: HTMLElement) {
  return topModal() === backdrop;
}

function enterBelongsToControl(target: HTMLElement) {
  return Boolean(target.closest([
    "textarea",
    "select",
    "button",
    "a[href]",
    "[contenteditable]:not([contenteditable='false'])",
    "[role='combobox']",
    "[role='listbox']",
    "[role='button']",
    "[data-modal-enter='ignore']",
  ].join(",")));
}

function isUnavailable(element: HTMLElement) {
  return element.matches(":disabled, [aria-disabled='true'], [hidden]")
    || Boolean(element.closest("[hidden], [aria-hidden='true']"));
}

/**
 * Resolve the one affirmative action which Enter should invoke. Explicit markers
 * win; the remaining selectors cover the shared editor and confirmation footers.
 */
function defaultAction(panel: HTMLElement) {
  const selectors = [
    "[data-modal-enter-action]",
    "[data-modal-submit]",
    ".modal-actions button.primary",
    ".modal-actions button.danger",
    ".modal-actions button[type='submit']",
    ".asset-picker__footer button.primary",
    "button.primary",
  ];
  for (const selector of selectors) {
    const candidates = [...panel.querySelectorAll<HTMLElement>(selector)];
    if (!candidates.length) continue;
    return candidates.find((candidate) => !isUnavailable(candidate)) ?? null;
  }
  const footerActions = [...panel.querySelectorAll<HTMLElement>(".modal-actions button")]
    .filter((candidate) => !isUnavailable(candidate));
  return footerActions.length === 1 ? footerActions[0] : null;
}

export function Modal({ title, subtitle, children, onClose, className = "" }: ModalProps) {
  const titleId = useId();
  const modalDepth = useContext(ModalDepthContext) + 1;
  const panelRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (panel && backdrop && isTopModal(backdrop)) panel.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      const backdrop = backdropRef.current;
      if (!backdrop || !isTopModal(backdrop)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key === "Enter") {
        if (event.defaultPrevented || event.repeat || event.isComposing) return;
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target && enterBelongsToControl(target)) return;
        const action = panel ? defaultAction(panel) : null;
        if (!action) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        action.click();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      queueMicrotask(() => {
        const remainingModal = topModal();
        const remainingPanel = remainingModal?.querySelector<HTMLElement>(":scope > .modal-panel");
        if (remainingPanel) remainingPanel.focus();
        else if (previousFocus?.isConnected) previousFocus.focus();
      });
    };
  }, []);
  const content = <ModalDepthContext.Provider value={modalDepth}>
    <div ref={backdropRef} className="modal-backdrop" data-modal-root data-modal-depth={modalDepth} style={{ zIndex: 10_000 + modalDepth }} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} tabIndex={-1} className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-header"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Закрити" onClick={onClose}><X /></button></header>
        {children}
      </section>
    </div>
  </ModalDepthContext.Provider>;
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
