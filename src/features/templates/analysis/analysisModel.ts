import { getVariable } from "../../../shared/template-language/registry";
import type { TemplateAnalysisProposal } from "../../../shared/types/domain";

export type ManualReplacement = { id: string; value: string; replacement: string; occurrence: number };
export type SelectedTemplateToken = { id: string; modifiers: string[] };

export function analysisErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function proposalKey(proposal: Pick<TemplateAnalysisProposal, "value" | "token">) { return `${proposal.value}\u0000${proposal.token}`; }

/** Accepts both a complete {{token}} and the token body selected inside Word preview. */
export function tokenSelectedInEditor(value: string): SelectedTemplateToken | null {
  const selected = value.trim();
  const body = selected.match(/^\{\{\s*([^{}]+?)\s*\}\}$/u)?.[1] ?? selected;
  if (!/^[\p{L}][\p{L}\p{N}_]*(?::[\p{L}_]+)*$/u.test(body)) return null;
  const [id, ...modifiers] = body.split(":");
  return getVariable(id) ? { id, modifiers } : null;
}

export function normaliseAnalysisProposals(proposals: TemplateAnalysisProposal[]) {
  return proposals.map((proposal) => {
    if (proposal.token !== "екіпаж_1") return proposal;
    return {
      ...proposal,
      token: "назва_екіпажу_1",
      label: "Назва екіпажу в документі",
      alternatives: [
        { token: "екіпаж_1_назва", label: "Назва обраного екіпажу" },
        { token: "військовий_1_екіпаж", label: "Екіпаж обраного військовослужбовця" },
        ...(proposal.alternatives ?? []).filter((item) => item.token !== "екіпаж_1" && item.token !== "назва_екіпажу_1"),
      ].filter((item, index, items) => items.findIndex((candidate) => candidate.token === item.token) === index),
    };
  });
}

export function defaultAnalysisSelection(proposals: TemplateAnalysisProposal[]) {
  return proposals.filter((proposal) => proposal.autoSelect).map(proposalKey);
}

