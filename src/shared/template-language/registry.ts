import source from "./registry.v2.json";

export type VariableKind = "text" | "person-name" | "rank" | "position" | "date" | "number";
export type VariableDefinition = { id: string; name: string; category: string; description: string; example: string; kind: VariableKind; supportsCases: boolean };
export type ModifierDefinition = { id: string; name: string; description: string; group: "case" | "text" | "style" };
type Field = { id: string; name: string; kind: string; example: string; cases: boolean; description?: string };

const fieldToVariable = (field: Field, id: string, category: string): VariableDefinition => ({
  id, name: field.name, category, description: field.description ?? `${field.name} у даних «${category}».`,
  example: field.example, kind: field.kind as VariableKind, supportsCases: field.cases
});
export const templateLanguageVersion = source.version;
export const personFields = source.personFields as Field[];
export const vehicleFields = source.vehicleFields as Field[];
export const signerRoles = source.signerRoles;
export const variableRegistry: VariableDefinition[] = [
  ...personFields.map((field) => fieldToVariable(field, `військовий_1_${field.id}`, "Військовослужбовець")),
  ...vehicleFields.map((field) => fieldToVariable(field, `військовий_1_автомобіль_1_${field.id}`, "Автомобіль військовослужбовця")),
  ...vehicleFields.map((field) => fieldToVariable(field, `автомобіль_${field.id}`, "Автомобіль")),
  ...source.signerRoles.flatMap((role) => (source.signerFields as Field[]).map((field) => fieldToVariable(field, `${role.id}_${field.id}`, role.name))),
  ...(source.documentFields as Field[]).map((field) => fieldToVariable(field, field.id, "Дати та службові дані"))
];
export const modifierRegistry: ModifierDefinition[] = source.modifiers.map((item) => ({ ...item, group: item.group as ModifierDefinition["group"], description: item.group === "case" ? `Відмінює значення: ${item.name.toLowerCase()} відмінок.` : `Змінює написання: ${item.name.toLowerCase()}.` }));
export const tokenFor = (id: string, modifiers: string[] = []) => `{{${[id, ...modifiers].join(":")}}}`;
export function getVariable(id: string) {
  const direct = variableRegistry.find((item) => item.id === id);
  if (direct) return direct;
  const match = /^військовий_([1-9]\d*)_(.+)$/.exec(id);
  if (!match) {
    const vehicle = /^автомобіль_(.+)$/.exec(id);
    if (!vehicle) return undefined;
    const field = vehicleFields.find((item) => item.id === vehicle[1]);
    if (field) return fieldToVariable(field, id, "Автомобіль");
    if (/^\p{L}[\p{L}\p{N}_]*$/u.test(vehicle[1])) return { id, name: "Кастомне поле автомобіля", category: "Автомобіль", description: "Додаткове поле автомобіля з бази даних.", example: "Приклад значення", kind: "text", supportsCases: false } satisfies VariableDefinition;
    return undefined;
  }
  const vehicle = /^автомобіль_([1-9]\d*)_(.+)$/.exec(match[2]);
  if (vehicle) {
    const vehicleField = vehicleFields.find((item) => item.id === vehicle[2]);
    if (vehicleField) return fieldToVariable(vehicleField, id, "Автомобіль військовослужбовця");
    if (/^\p{L}[\p{L}\p{N}_]*$/u.test(vehicle[2])) return { id, name: "Кастомне поле автомобіля", category: "Автомобіль військовослужбовця", description: "Додаткове поле автомобіля, закріпленого за військовослужбовцем.", example: "Приклад значення", kind: "text", supportsCases: false } satisfies VariableDefinition;
    return undefined;
  }
  const field = personFields.find((item) => item.id === match[2]);
  if (field) return fieldToVariable(field, id, "Військовослужбовець");
  if (/^\p{L}[\p{L}\p{N}_]*$/u.test(match[2])) return { id, name: "Кастомне поле", category: "Військовослужбовець", description: "Додаткове поле з бази даних.", example: "Приклад значення", kind: "text", supportsCases: false } satisfies VariableDefinition;
  return undefined;
}
