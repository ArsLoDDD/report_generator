import { FileText, FolderOpen } from "lucide-react";
type GeneratedReportPaths = { docxPath: string; folderPath: string };

export function GeneratedReportActions({ report, onOpenReport, onOpenFolder }: { report: GeneratedReportPaths; onOpenReport: (path: string) => void; onOpenFolder: (path: string) => void }) {
  return <div className="generation-result"><div><button className="button primary" onClick={() => onOpenReport(report.docxPath)}><FileText />Відкрити DOCX</button><button className="button" onClick={() => onOpenFolder(report.folderPath)}><FolderOpen />Відкрити папку</button></div></div>;
}
