export function CardGridSkeleton({ count = 6, variant = "default" }: { count?: number; variant?: "default" | "position" }) {
  return <section className={`${variant === "position" ? "positions" : "crews"}-loading-skeleton`} aria-label="Завантаження даних">{Array.from({ length: count }, (_, index) => <article className="panel" key={index}><header>{variant === "position" && <i className="skeleton-line skeleton-line--icon" />}<div><i className="skeleton-line skeleton-line--short" /><i className="skeleton-line skeleton-line--title" /></div></header><i className="skeleton-line skeleton-line--wide" />{Array.from({ length: 4 }, (__, fact) => <i className="skeleton-line" key={fact} />)}<i className="skeleton-line skeleton-line--button" /></article>)}</section>;
}

