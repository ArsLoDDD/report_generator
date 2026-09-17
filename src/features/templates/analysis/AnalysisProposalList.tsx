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
  onOpenFieldPicker: () => void;
};

function categories(items: TemplateAnalysisProposal[]) {
  const result = new Map<string, TemplateAnalysisProposal[]>();
  for (const proposal of items) {
    const category = proposal.category || "Інші значення";
    result.set(category, [...(result.get(category) ?? []), proposal]);
  }
  return [...result.entries()];
}

export function AnalysisProposalList({ groups, proposalCount, selected, selectedCount, tokenOverrides, onToggle, onOverride, onOpenFieldPicker }: Props) {
  return <section className="analyser-proposals" aria-labelledby="analyser-proposals-title">
    <header><div><h2 id="analyser-proposals-title">Запропоновані заміни</h2><p>Автоматично ввімкнені лише однозначні збіги. Решту підтвердьте вручну.</p></div><div className="analyser-proposals__actions"><button type="button" className="icon-button" title="Поля автозаповнення" aria-label="Поля автозаповнення" onClick={onOpenFieldPicker}><WandSparkles /></button><b aria-live="polite">{selectedCount} обрано</b></div></header>
    <div className="analyser-proposals__scroll">{groups.map((group) => <section className={`analyser-proposal-group analyser-proposal-group--${group.confidence}`} key={group.confidence} aria-label={group.title}>
      <header><b>{group.title}</b><span>{group.items.length}</span></header>
      {categories(group.items).map(([category, items]) => <section className="analyser-proposal-category" key={category} aria-label={category}>
        <h3>{category}<span>{items.length}</span></h3>
        {items.map((proposal) => {
          const key = proposalKey(proposal);
          const activeToken = tokenOverrides[key] ?? proposal.token;
          const checked = selected.includes(key);
          return <article key={key} title={proposal.reason} className={checked ? "analyser-proposal analyser-proposal--selected" : "analyser-proposal"}>
            <input type="checkbox" checked={checked} aria-label={`Замінити «${proposal.value}» на {{${activeToken}}}`} onChange={() => onToggle(proposal)} />
            <div><b>{proposal.label}</b><code>{proposal.value}</code><small className="analyser-proposal__reason">{proposal.reason}</small>{proposal.alternatives?.length > 0 && <div className="analyser-proposal__alternatives" role="group" aria-label={`Варіант змінної для «${proposal.value}»`}>{[{ token: proposal.token, label: "Автоматично" }, ...proposal.alternatives].map((alternative) => <button type="button" key={alternative.token} className={activeToken === alternative.token ? "active" : ""} aria-pressed={activeToken === alternative.token} title={alternative.label} onClick={() => onOverride(key, alternative.token)}>{`{{${alternative.token}}}`}</button>)}</div>}</div>
            <aside><span className={`analyser-confidence analyser-confidence--${proposal.confidence}`}>{proposal.confidence === "high" ? "Надійна" : "Перевірте"}</span><code>{`{{${activeToken}}}`}</code><small>{proposal.occurrences} збіг{proposal.occurrences === 1 ? "" : "ів"}</small></aside>
          </article>;
        })}
      </section>)}
    </section>)}{proposalCount === 0 && <p className="analyser-no-proposals">Збігів із даними програми не знайдено. Виділіть текст у редакторі й додайте потрібну заміну вручну.</p>}</div>
  </section>;
}
