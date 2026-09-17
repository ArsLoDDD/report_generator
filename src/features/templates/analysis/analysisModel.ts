import { getVariable, tokenFor } from "../../../shared/template-language/registry";
import { parseTemplateTokens, validateToken } from "../../../shared/template-language/parser";
import type { TemplateAnalysisProposal } from "../../../shared/types/domain";

export type ManualReplacement = { id: string; value: string; replacement: string; occurrence: number };
export type SelectedTemplateToken = { id: string; modifiers: string[] };
export type NormalisedSelection = { value: string; prefix: string };
export type NormalisedManualReplacement = { value?: string; error?: string };

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
  const parsed = parseTemplateTokens(tokenFor(id, modifiers))[0];
  return getVariable(id) && parsed && validateToken(parsed).length === 0 ? { id, modifiers } : null;
}

/** Expands a body-only selection inside `{{…}}` to the complete literal token. */
export function normaliseSelectedTokenText(value: string, prefix: string, suffix: string): NormalisedSelection {
  if (tokenSelectedInEditor(value) && prefix.endsWith("{{") && suffix.startsWith("}}")) {
    return { value: `{{${value}}}`, prefix: prefix.slice(0, -2) };
  }
  return { value, prefix };
}

/** Normalises token input once and rejects malformed/unknown template language. */
export function normaliseManualReplacement(input: string): NormalisedManualReplacement {
  const value = input.trim();
  const completeToken = /^\{\{\s*([^{}]+?)\s*\}\}$/u.exec(value);
  const looksLikeToken = value.includes("{{") || value.includes("}}") || /^[\p{L}][\p{L}\p{N}_]*(?::[\p{L}_]+)*$/u.test(value) && (value.includes("_") || value.includes(":"));
  if (!completeToken && !looksLikeToken) return { value: input };
  if (!completeToken && (value.includes("{{") || value.includes("}}"))) {
    return { error: "Змінна має бути записана один раз у форматі {{назва_змінної}}." };
  }
  const body = completeToken?.[1].trim() ?? value;
  const [id, ...modifiers] = body.split(":");
  const parsed = parseTemplateTokens(tokenFor(id, modifiers))[0];
  const issues = parsed ? validateToken(parsed) : [{ message: "Некоректна змінна." }];
  if (issues.length > 0) return { error: issues[0].message };
  return { value: tokenFor(id, modifiers) };
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
