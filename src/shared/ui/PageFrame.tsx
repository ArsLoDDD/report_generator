import type { ReactNode, UIEventHandler } from "react";

type Props = { header?: ReactNode; tools?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string; onContentScroll?: UIEventHandler<HTMLDivElement> };

/** Keeps page controls fixed while each page owns its scrolling content area. */
export function PageFrame({ header, tools, footer, children, className = "", onContentScroll }: Props) {
  return <section className={`page-frame ${className}`}>
    {header && <header className="page-frame__header">{header}</header>}
    {tools && <div className="page-frame__tools">{tools}</div>}
    <div className="page-frame__content" onScroll={onContentScroll}>{children}</div>
    {footer && <footer className="page-frame__footer">{footer}</footer>}
  </section>;
}
