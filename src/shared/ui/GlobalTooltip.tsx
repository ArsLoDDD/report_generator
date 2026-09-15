import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

type TooltipTarget = {
  element: HTMLElement;
  label: string;
};

type TooltipPosition = {
  left: number;
  top: number;
};

const tooltipSelector = ".icon-button[aria-label], .icon-only[aria-label], [data-tooltip]";

function findTooltipTarget(target: EventTarget | null): TooltipTarget | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>(tooltipSelector);
  if (!element) return null;
  const label = (element.dataset.tooltip || element.getAttribute("aria-label") || "").trim();
  return label ? { element, label } : null;
}

/**
 * A single, viewport-level tooltip layer for compact icon controls.
 * Rendering through document.body keeps labels clear of scrolling panels and
 * modal containers that intentionally clip their own contents.
 */
export function GlobalTooltip() {
  const [active, setActive] = useState<TooltipTarget | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  useLayoutEffect(() => {
    const show = (event: Event) => {
      const next = findTooltipTarget(event.target);
      if (!next) return;
      setActive((current) => current?.element === next.element && current.label === next.label ? current : next);
    };
    const hide = (event: Event) => {
      const relatedTarget = "relatedTarget" in event ? event.relatedTarget : null;
      setActive((current) => {
        if (!current) return null;
        if (relatedTarget instanceof Node && current.element.contains(relatedTarget)) return current;
        return null;
      });
    };
    const hideImmediately = () => setActive(null);

    document.addEventListener("pointerover", show);
    document.addEventListener("pointerout", hide);
    document.addEventListener("focusin", show);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hideImmediately, true);
    return () => {
      document.removeEventListener("pointerover", show);
      document.removeEventListener("pointerout", hide);
      document.removeEventListener("focusin", show);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hideImmediately, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!active) return;
    const tooltip = document.querySelector<HTMLElement>(".global-tooltip");
    if (!tooltip) return;

    const updatePosition = () => {
      if (!active.element.isConnected) {
        setActive(null);
        return;
      }
      const targetRect = active.element.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const edge = 8;
      const gap = 7;
      const halfWidth = tooltipRect.width / 2;
      const centered = targetRect.left + targetRect.width / 2;
      const left = Math.min(window.innerWidth - edge - halfWidth, Math.max(edge + halfWidth, centered));
      const above = targetRect.top - tooltipRect.height - gap;
      const top = above >= edge ? above : Math.min(window.innerHeight - tooltipRect.height - edge, targetRect.bottom + gap);
      setPosition({ left, top: Math.max(edge, top) });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [active]);

  if (!active || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="global-tooltip"
      role="tooltip"
      style={position ? { left: position.left, top: position.top } : { visibility: "hidden" }}
    >
      {active.label}
    </div>,
    document.body,
  );
}
