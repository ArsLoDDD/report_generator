import { FileText, FolderOpen } from "lucide-react";

export type RecentReport = { name: string; people: number; createdAt: string };

/** Shared compact representation of generated reports for dashboards and template details. */
export function RecentReportsList({ reports }: { reports: RecentReport[] }) {
  return <div className="recent-reports-list">{reports.map((report) => <article className="recent-report-row" key={report.name}><span className="word-icon">W</span><div><b>{report.name}</b><small>{report.people} ос. · {report.createdAt}</small></div><button className="icon-button" aria-label={`Відкрити ${report.name}`}><FolderOpen /></button></article>)}</div>;
}
