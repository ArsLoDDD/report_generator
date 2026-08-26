import source from "./registry.v2.json";

export type VariableKind = "text" | "person-name" | "rank" | "position" | "date" | "number";
export type VariableDefinition = { id: string; name: string; category: string; description: string; example: string; kind: VariableKind; supportsCases: boolean };
export type ModifierDefinition = { id: string; name: string; description: string; group: "case" | "text" | "style" };
type Field = { id: string; name: string; kind: string; example: string; cases: boolean; description?: string };
export type GenerationParameterField = Field & { inputType: "date" | "time" | "datetime-local" | "text" | "textarea" | "number" | "boolean" };

const fieldToVariable = (field: Field, id: string, category: string): VariableDefinition => ({
  id, name: field.name, category, description: field.description ?? `${field.name} у даних «${category}».`,
  example: field.example, kind: field.kind as VariableKind, supportsCases: field.cases
});
export const templateLanguageVersion = source.version;
export const personFields = source.personFields as Field[];
export const vehicleFields = source.vehicleFields as Field[];
export const crewFields = source.crewFields as Field[];
export const positionFields = source.positionFields as Field[];
export const equipmentFields = source.equipmentFields as Field[];
export const generationParameterFields = source.documentFields as GenerationParameterField[];
export const signerRoles = source.signerRoles;
export const signerFields = source.signerFields as Field[];
const subjectPrefixes = ["військовий_", "автомобіль_", "екіпаж_", "позиція_", "генератор_", "бпла_", "звʼязок_", "зброя_та_бк_"];
const isDynamicDocumentParameter = (token: string) =>
  /^\p{L}[\p{L}\p{N}_]*$/u.test(token)
  && /[а-щьюяєіїґ]/iu.test(token)
  && !subjectPrefixes.some((prefix) => token.startsWith(prefix))
  && !signerRoles.some((role) => token.startsWith(`${role.id}_`))
  && !generationParameterFields.some((field) => {
    const suffix = token.slice(field.id.length + 1);
    return token.startsWith(`${field.id}_`) && /^\d+$/.test(suffix);
  });
const dynamicParameterName = (token: string) => token
  .split("_")
  .filter(Boolean)
  .map((part) => `${part.slice(0, 1).toLocaleUpperCase("uk-UA")}${part.slice(1)}`)
  .join(" ");
export const variableRegistry: VariableDefinition[] = [
  ...personFields.map((field) => fieldToVariable(field, `військовий_1_${field.id}`, "Військовослужбовець")),
  ...vehicleFields.map((field) => fieldToVariable(field, `військовий_1_автомобіль_1_${field.id}`, "Автомобіль військовослужбовця")),
  ...vehicleFields.map((field) => fieldToVariable(field, `автомобіль_1_${field.id}`, "Автомобіль")),
  ...crewFields.map((field) => fieldToVariable(field, `екіпаж_1_${field.id}`, "Екіпаж")),
  ...positionFields.map((field) => fieldToVariable(field, `позиція_1_${field.id}`, "Позиція")),
  ...["генератор", "бпла", "звʼязок", "зброя_та_бк"].flatMap((subject) => equipmentFields.map((field) => fieldToVariable(field, `${subject}_1_${field.id}`, subject === "бпла" ? "БпЛА" : subject === "звʼязок" ? "Зв’язок" : subject === "генератор" ? "Генератор" : "Зброя та БК"))),
  ...source.signerRoles.flatMap((role) => signerFields.map((field) => fieldToVariable(field, `${role.id}_${field.id}`, role.name))),
  ...generationParameterFields.map((field) => fieldToVariable(field, field.id, "Параметри документа"))
];
export function getGenerationParameter(token: string) {
  const direct = generationParameterFields.find((field) => field.id === token);
  if (direct) return direct;
  const numbered = generationParameterFields
    .filter((field) => token.startsWith(`${field.id}_`))
    .sort((left, right) => right.id.length - left.id.length)
    .find((field) => /^[1-9]\d*$/.test(token.slice(field.id.length + 1)));
  if (numbered) return numbered;
  if (!isDynamicDocumentParameter(token)) return undefined;
  return {
    id: token,
    name: dynamicParameterName(token),
    kind: "text",
    example: "",
    cases: false,
    description: "Довільний параметр, створений у редакторі шаблону.",
    inputType: "text"
  } satisfies GenerationParameterField;
}
export const modifierRegistry: ModifierDefinition[] = source.modifiers.map((item) => ({ ...item, group: item.group as ModifierDefinition["group"], description: item.group === "case" ? `Відмінює значення: ${item.name.toLowerCase()} відмінок.` : `Змінює написання: ${item.name.toLowerCase()}.` }));
export const tokenFor = (id: string, modifiers: string[] = []) => `{{${[id, ...modifiers].join(":")}}}`;

export type SelectionSubjectId = "personnel" | "vehicle" | "crew" | "position" | "generator" | "uav" | "communications" | "weaponAmmo";
export type SelectionRequirement = { id: SelectionSubjectId; prefix: string; label: string; count: number; category?: string };
const selectionSubjects: Array<Omit<SelectionRequirement, "count"> & { fields: Field[] }> = [
  { id: "personnel", prefix: "військовий", label: "Військовослужбовці", fields: personFields },
  { id: "vehicle", prefix: "автомобіль", label: "Автомобілі", fields: vehicleFields },
  { id: "crew", prefix: "екіпаж", label: "Екіпажі", fields: crewFields },
  { id: "position", prefix: "позиція", label: "Позиції", fields: positionFields },
  { id: "generator", prefix: "генератор", label: "Генератори", category: "generator", fields: equipmentFields },
  { id: "uav", prefix: "бпла", label: "БпЛА", category: "uav", fields: equipmentFields },
  { id: "communications", prefix: "звʼязок", label: "Засоби зв’язку", category: "communications", fields: equipmentFields },
  { id: "weaponAmmo", prefix: "зброя_та_бк", label: "Зброя та БК", category: "weapon_ammo", fields: equipmentFields },
];

/** Derives ordered, exact selection requirements from the variables used by a template. */
export function getSelectionRequirements(tokens: string[]): SelectionRequirement[] {
  const counts = new Map<SelectionSubjectId, number>();
  const isFieldToken = (value: string) => /^\p{L}[\p{L}\p{N}_]*$/u.test(value);
  for (const raw of tokens) {
    const base = raw.split(":")[0];
    if (getGenerationParameter(base)) continue;
    for (const subject of selectionSubjects) {
      let index = 0;
      if (subject.id === "personnel") {
        const match = /^військовий_([1-9]\d*)_(.+)$/u.exec(base);
        if (match && (isFieldToken(match[2]) || match[2].startsWith("автомобіль_"))) index = Number(match[1]);
      } else {
        const rest = base.startsWith(`${subject.prefix}_`) ? base.slice(subject.prefix.length + 1) : "";
        const numbered = /^([1-9]\d*)_(.+)$/u.exec(rest);
        if (numbered && isFieldToken(numbered[2])) index = Number(numbered[1]);
      }
      if (index) counts.set(subject.id, Math.max(counts.get(subject.id) ?? 0, index));
    }
  }
  return selectionSubjects.flatMap(({ fields: _fields, ...subject }) => {
    const count = counts.get(subject.id) ?? 0;
    return count ? [{ ...subject, count }] : [];
  });
}
export function getVariable(id: string) {
  const direct = variableRegistry.find((item) => item.id === id);
  if (direct) return direct;
  const generationParameter = getGenerationParameter(id);
  if (generationParameter) return fieldToVariable(generationParameter, id, "Параметри документа");
  const match = /^військовий_([1-9]\d*)_(.+)$/.exec(id);
  if (!match) {
    const crew = /^екіпаж_(?:[1-9]\d*)_(.+)$/u.exec(id);
    if (crew) {
      const field = crewFields.find((item) => item.id === crew[1]);
      if (field) return fieldToVariable(field, id, "Екіпаж");
    }
    const position = /^позиція_(?:[1-9]\d*)_(.+)$/u.exec(id);
    if (position) {
      const field = positionFields.find((item) => item.id === position[1]);
      if (field) return fieldToVariable(field, id, "Позиція");
    }
    const equipment = /^(генератор|бпла|звʼязок|зброя_та_бк)_(?:[1-9]\d*)_(.+)$/u.exec(id);
    if (equipment) {
      const field = equipmentFields.find((item) => item.id === equipment[2]);
      if (field) return fieldToVariable(field, id, equipment[1]);
    }
    const vehicle = /^автомобіль_(?:[1-9]\d*)_(.+)$/u.exec(id);
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
