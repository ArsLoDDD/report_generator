import source from "./registry.v2.json";

export type VariableKind = "text" | "person-name" | "rank" | "position" | "date" | "number";
export type VariableDefinition = { id: string; name: string; category: string; description: string; example: string; kind: VariableKind; supportsCases: boolean };
export type ModifierDefinition = { id: string; name: string; description: string; group: "case" | "text" };
type Field = { id: string; name: string; kind: string; example: string; cases: boolean; description?: string };

const fieldToVariable = (field: Field, id: string, category: string): VariableDefinition => ({
  id, name: field.name, category, description: field.description ?? `${field.name} у даних «${category}».`,
  example: field.example, kind: field.kind as VariableKind, supportsCases: field.cases
});
export const templateLanguageVersion = source.version;
export const personFields = source.personFields as Field[];
export const signerRoles = source.signerRoles;
export const variableRegistry: VariableDefinition[] = [
  ...personFields.map((field) => fieldToVariable(field, `військовий_1_${field.id}`, "Військовослужбовець")),
  ...source.signerRoles.flatMap((role) => (source.signerFields as Field[]).map((field) => fieldToVariable(field, `${role.id}_${field.id}`, role.name))),
  ...(source.documentFields as Field[]).map((field) => fieldToVariable(field, field.id, "Дати та службові дані"))
];
export const modifierRegistry: ModifierDefinition[] = source.modifiers.map((item) => ({ ...item, group: item.group as "case" | "text", description: item.group === "case" ? `Відмінює значення: ${item.name.toLowerCase()} відмінок.` : `Змінює написання: ${item.name.toLowerCase()}.` }));
export const tokenFor = (id: string, modifiers: string[] = []) => `{{${[id, ...modifiers].join(":")}}}`;
export function getVariable(id: string) {
  const direct = variableRegistry.find((item) => item.id === id);
  if (direct) return direct;
  const match = /^військовий_([1-9]\d*)_(.+)$/.exec(id);
  if (!match) return undefined;
  const field = personFields.find((item) => item.id === match[2]);
  return field ? fieldToVariable(field, id, "Військовослужбовець") : undefined;
}
