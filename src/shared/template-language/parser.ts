import { getVariable, modifierRegistry } from "./registry";
export type ParsedToken = { raw: string; variableId: string; modifiers: string[] };
export type TemplateLanguageIssue = { message: string; token?: string };
const distance = (a: string, b: string) => { const row = [...Array(b.length + 1).keys()]; for (let i = 0; i < a.length; i += 1) { let previous = row[0]; row[0] = i + 1; for (let j = 0; j < b.length; j += 1) { const old = row[j + 1]; row[j + 1] = Math.min(previous + Number(a[i] !== b[j]), row[j + 1] + 1, row[j] + 1); previous = old; } } return row[b.length]; };
export function parseTemplateTokens(text: string): ParsedToken[] { return [...text.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((match) => { const [variableId, ...modifiers] = match[1].trim().split(":"); return { raw: match[0], variableId, modifiers }; }); }
export function validateToken(token: ParsedToken): TemplateLanguageIssue[] {
  const variable = getVariable(token.variableId); if (!variable) return [{ token: token.raw, message: `Невідома змінна «${token.raw}». Скористайтеся Реєстром змінних.` }];
  const issues: TemplateLanguageIssue[] = [];
  const seen = new Set<string>(); let textModifier = false;
  let caseModifier = false;
  for (const id of token.modifiers) { const modifier = modifierRegistry.find((item) => item.id === id); if (!modifier) { const hint = modifierRegistry.map((item) => item.id).sort((a, b) => distance(id, a) - distance(id, b))[0]; issues.push({ token: token.raw, message: `Невідомий модифікатор «${id}».${hint && distance(id, hint) <= 2 ? ` Можливо, ви мали на увазі «${hint}».` : ""}` }); continue; } if (seen.has(id)) issues.push({ token: token.raw, message: `Модифікатор «${id}» вказано двічі.` }); seen.add(id); if (modifier.group === "case") { if (!variable.supportsCases) issues.push({ token: token.raw, message: `Модифікатор «${id}» не застосовується до «${variable.name}».` }); if (caseModifier) issues.push({ token: token.raw, message: "Не можна одночасно використовувати два відмінки." }); caseModifier = true; } if (modifier.group === "text") { if (variable.kind === "number") issues.push({ token: token.raw, message: `Зміна регістру не застосовується до «${variable.name}».` }); if (textModifier) issues.push({ token: token.raw, message: "Не можна одночасно використовувати модифікатори зміни регістру." }); textModifier = true; } }
  return issues;
}
