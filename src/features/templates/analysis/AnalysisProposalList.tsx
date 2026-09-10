import { WandSparkles } from "lucide-react";
import type { TemplateAnalysisProposal } from "../../../shared/types/domain";
import { proposalKey } from "./analysisModel";

type ProposalGroup = { confidence: "high" | "medium"; title: string; items: TemplateAnalysisProposal[] };
type Props = {
  groups: ProposalGroup[];
  proposalCount: number;
  selected: string[];
  selectedCount: number;
  tokenOverrides: Record<string, string>;
  onToggle: (proposal: TemplateAnalysisProposal) => void;
  onOverride: (key: string, token: string) => void;
  onOpenConstructor: () => void;
};

export function AnalysisProposalList({ groups, proposalCount, selected, selectedCount, tokenOverrides, onToggle, onOverride, onOpenConstructor }: Props) {
  return <section className="analyser-proposals"><header><div><h2>Запропоновані заміни</h2><p>Автоматично ввімкнені лише однозначні збіги. Решту підтвердьте вручну.</p></div><div className="analyser-proposals__actions"><button className="icon-button" title="Відкрити конструктор змінних" aria-label="Відкрити конструктор змінних" onClick={onOpenConstructor}><WandSparkles /></button><b>{selectedCount} обрано</b></div></header>
    <div className="analyser-proposals__scroll">{groups.map((group) => <section className={`analyser-proposal-group analyser-proposal-group--${group.confidence}`} key={group.confidence}><header><b>{group.title}</b><span>{group.items.length}</span></header>{group.items.map((proposal) => { const key = proposalKey(proposal); const activeToken = tokenOverrides[key] ?? proposal.token; return <div key={key} title={proposal.reason} className={selected.includes(key) ? "analyser-proposal analyser-proposal--selected" : "analyser-proposal"}><input type="checkbox" checked={selected.includes(key)} onChange={() => onToggle(proposal)} /><div><span>{proposal.category}</span><b>{proposal.label}</b><code>{proposal.value}</code><small className="analyser-proposal__reason">{proposal.reason}</small>{proposal.alternatives?.length > 0 && <div className="analyser-proposal__alternatives">{[{ token: proposal.token, label: "Автоматично" }, ...proposal.alternatives].map((alternative) => <button key={alternative.token} className={activeToken === alternative.token ? "active" : ""} title={alternative.label} onClick={() => onOverride(key, alternative.token)}>{`{{${alternative.token}}}`}</button>)}</div>}</div><aside><span className={`analyser-confidence analyser-confidence--${proposal.confidence}`}>{proposal.confidence === "high" ? "Надійна" : "Перевірте"}</span><code>{`{{${activeToken}}}`}</code><small>{proposal.occurrences} збіг{proposal.occurrences === 1 ? "" : "ів"}</small></aside></div>; })}</section>)}{proposalCount === 0 && <p className="analyser-no-proposals">Збігів із даними програми не знайдено. Виділіть текст у редакторі й додайте потрібну заміну вручну.</p>}</div>
  </section>;
}

