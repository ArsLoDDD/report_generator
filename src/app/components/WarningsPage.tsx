import { AlertTriangle, RefreshCw, Users } from "lucide-react";
import type { StartupWarning } from "../../shared/types/domain";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";

export function WarningsPage({ warnings, isLoading, onRefresh, onOpenPersonnel }: { warnings: StartupWarning[]; isLoading: boolean; onRefresh: () => void; onOpenPersonnel: () => void }) {
  return <PageFrame className="warnings-page" header={<PageTitle title="Попередження" subtitle="Дані, які треба доповнити для коректної роботи пов’язаних розділів" actions={<button className="button" onClick={onRefresh} disabled={isLoading}><RefreshCw />{isLoading ? "Перевірка…" : "Перевірити знову"}</button>} />}>
    {warnings.length ? <div className="warning-list">{warnings.map((warning) => <article className="panel warning-card" key={warning.code}><AlertTriangle /><div><h2>{warning.title}</h2><p>{warning.message}</p>{warning.code === "crew-callsign-missing" && <button className="button primary" onClick={onOpenPersonnel}><Users />Відкрити особовий склад</button>}</div></article>)}</div> : <section className="panel warnings-empty"><b>Попереджень немає</b><span>Основні зв’язки та обов’язкові дані заповнені.</span></section>}
  </PageFrame>;
}
