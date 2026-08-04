import { FileOutput } from "lucide-react";

export type RecentReport = { name: string; createdAt: string; docxPath?: string };

/** Shared compact representation of generated reports for dashboards and template details. */
export function RecentReportsList({ reports, onOpen }: { reports: RecentReport[]; onOpen?: (reportPath: string) => void }) {
  return <div className="recent-reports-list">{reports.length ? reports.map((report) => <article className="recent-report-row" key={`${report.name}-${report.createdAt}`}><span className="word-icon">W</span><div><b>{report.name}</b><small>{report.createdAt}</small></div><button className="icon-button" aria-label={`Відкрити ${report.name}`} disabled={!report.docxPath} onClick={() => report.docxPath && onOpen?.(report.docxPath)}><FileOutput /></button></article>) : <p className="muted">За цим шаблоном ще не створено рапортів.</p>}</div>;
}
