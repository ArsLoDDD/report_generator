import { useEffect, useMemo, useState } from "react";
import { BookOpen, Copy } from "lucide-react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { crewFields, equipmentFields, modifierRegistry, signerFields, signerRoles, tokenFor, variableRegistry, vehicleFields, type VariableDefinition } from "../../shared/template-language/registry";
import { morphologyService, type UkrainianCase } from "../../shared/services/morphologyService";
import { personnelService } from "../../shared/services/personnelService";
import type { CustomFieldDefinition } from "../../shared/types/domain";
import { settingsService } from "../settings/services/settingsService";
import type { SignerRole } from "../../shared/types/domain";

const textModifiers = new Set(["великими", "маленькими", "з_великої"]);
const styleModifiers = new Set(["жирним", "підкреслити"]);
const fallbackSignerObjects = [
  ["основний_підписант", "Основний підписант"], ["командир", "Командир"], ["начальник_штабу", "Начальник штабу"],
  ["заступник_ппп", "Заступник командира з ППП"], ["заступник_озброєння", "Заступник командира з озброєння"],
  ["заступник_тилу", "Заступник командира з тилу"], ["начальник_пмм", "Начальник ПММ"]
] as const;

function Preview({ variable, modifiers }: { variable: VariableDefinition; modifiers: string[] }) {
  const [result, setResult] = useState(variable.example);
  useEffect(() => {
    let active = true;
    void (async () => {
      let value = variable.example;
      const grammaticalCase = modifiers.find((item) => !textModifiers.has(item) && !styleModifiers.has(item)) as UkrainianCase | undefined;
      if (grammaticalCase && variable.kind === "person-name") {
        const [surname, givenName, patronymic] = value.split(/\s+/);
        value = (await morphologyService.declineName({ surname, givenName, patronymic, gender: "чоловіча" }, grammaticalCase)).value;
      } else if (grammaticalCase && variable.kind === "rank") value = morphologyService.declineRank(value, grammaticalCase);
      else if (grammaticalCase && variable.kind === "position") value = morphologyService.declinePosition(value, grammaticalCase);
      for (const modifier of modifiers.filter((item) => textModifiers.has(item))) value = morphologyService.transformText(value, modifier as "великими" | "маленькими" | "з_великої");
      if (active) setResult(value);
    })();
    return () => { active = false; };
  }, [variable, modifiers]);
  const className = `${modifiers.includes("жирним") ? "preview-bold " : ""}${modifiers.includes("підкреслити") ? "preview-underline" : ""}`;
  return <><b className={className}>{result}</b><p className="constructor-sentence">Речення-приклад: «Прошу врахувати: <span className={className}>{result}</span>.»</p></>;
}

const toPersonnelValue = (item: CustomFieldDefinition): VariableDefinition => ({
  id: `військовий_1_${templateFieldId(item.displayName)}`, name: item.displayName, category: "Військовослужбовець", description: item.description, example: item.initialValue, kind: "text", supportsCases: false
});
const toVehicleValue = (item: CustomFieldDefinition): VariableDefinition => ({
  id: `автомобіль_${templateFieldId(item.displayName)}`, name: item.displayName, category: "Автомобіль", description: item.description, example: item.initialValue, kind: "text", supportsCases: false
});
const toPersonnelVehicleValue = (item: CustomFieldDefinition): VariableDefinition => ({
  id: `військовий_1_автомобіль_1_${templateFieldId(item.displayName)}`, name: item.displayName, category: "Автомобіль військовослужбовця", description: item.description, example: item.initialValue, kind: "text", supportsCases: false
});
const templateFieldId = (name: string) => name.toLocaleLowerCase("uk")
  .replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");

export function VariableConstructorPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"constructor" | "all">("constructor");
  const [objectId, setObjectId] = useState("person");
  const [fieldId, setFieldId] = useState("");
  const [personNumber, setPersonNumber] = useState("1");
  const [parameterNumber, setParameterNumber] = useState("");
  const [modifiers, setModifiers] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [vehicleCustomFields, setVehicleCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [availableSignerRoles, setAvailableSignerRoles] = useState<SignerRole[]>([]);
  const { notify } = useNotifications();

  useEffect(() => {
    void personnelService.listCustomFields().then(setCustomFields).catch(() => undefined);
    void personnelService.listVehicleCustomFields?.().then(setVehicleCustomFields).catch(() => undefined);
    void settingsService.get().then((settings) => setAvailableSignerRoles(settings.signerRoles ?? [])).catch(() => undefined);
  }, []);

  const isPerson = objectId === "person";
  const signerObjects = availableSignerRoles.length ? availableSignerRoles.map((role) => [role.id, role.name] as const) : fallbackSignerObjects;
  const objects = [{ id: "person", label: "Військовослужбовець" }, { id: "vehicle", label: "Автомобіль" }, { id: "crew", label: "Екіпаж" }, { id: "generator", label: "Генератор" }, { id: "uav", label: "БпЛА" }, { id: "communications", label: "Зв’язок" }, { id: "weapon_ammo", label: "Зброя та БК" }, ...signerObjects.map(([id, label]) => ({ id, label })), { id: "document", label: "Параметри документа" }];
  const categoryItems = useMemo(() => {
    const matches = (item: VariableDefinition) => `${item.name} ${item.description} ${item.id}`.toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"));
    const personnelValueFields = customFields.map(toPersonnelValue);
    const vehicleValueFields = vehicleCustomFields.map(toVehicleValue);
    const roleIds = new Set(signerRoles.map((role) => role.id));
    const dynamicSignerValues = signerObjects.flatMap(([roleId, roleName]) => signerFields.map((item) => ({ id: `${roleId}_${item.id}`, name: item.name, category: roleName, description: item.description ?? item.name, example: item.example, kind: item.kind as VariableDefinition["kind"], supportsCases: item.cases })));
    const withoutStaticSigners = variableRegistry.filter((item) => ![...roleIds].some((roleId) => item.id.startsWith(`${roleId}_`)));
    if (viewMode === "all") return [...withoutStaticSigners, ...dynamicSignerValues, ...personnelValueFields, ...vehicleValueFields].filter(matches);
    if (isPerson) return [...variableRegistry.filter((item) => item.id.startsWith("військовий_1_")), ...personnelValueFields, ...vehicleCustomFields.map(toPersonnelVehicleValue)].filter(matches);
    if (objectId === "vehicle") return [...vehicleFields.map((item) => ({ id: `автомобіль_${item.id}`, name: item.name, category: "Автомобіль", description: item.description ?? item.name, example: item.example, kind: item.kind as VariableDefinition["kind"], supportsCases: item.cases })), ...vehicleValueFields].filter(matches);
    if (objectId === "crew") return crewFields.map((item) => ({ id: `екіпаж_${item.id}`, name: item.name, category: "Екіпаж", description: item.description ?? item.name, example: item.example, kind: item.kind as VariableDefinition["kind"], supportsCases: item.cases })).filter(matches);
    const equipmentPrefix = objectId === "generator" ? "генератор" : objectId === "uav" ? "бпла" : objectId === "communications" ? "звʼязок" : objectId === "weapon_ammo" ? "зброя_та_бк" : "";
    if (equipmentPrefix) return equipmentFields.map((item) => ({ id: `${equipmentPrefix}_${item.id}`, name: item.name, category: objects.find((object) => object.id === objectId)?.label ?? "Майно", description: item.description ?? item.name, example: item.example, kind: item.kind as VariableDefinition["kind"], supportsCases: item.cases })).filter(matches);
    if (objectId === "document") return variableRegistry.filter((item) => item.category === "Параметри документа" && matches(item));
    return dynamicSignerValues.filter((item) => item.id.startsWith(`${objectId}_`) && matches(item));
  }, [viewMode, isPerson, objectId, query, customFields, vehicleCustomFields, signerObjects]);

  const field = categoryItems.find((item) => item.id === fieldId);
  const variableId = !field ? "" : viewMode === "all" ? field.id : isPerson ? field.id.replace(/^військовий_1_/, `військовий_${Math.max(1, Number(personNumber) || 1)}_`) : objectId === "document" && Number(parameterNumber) > 0 ? `${field.id}_${Math.floor(Number(parameterNumber))}` : field.id;
  const token = field ? tokenFor(variableId, modifiers) : "";
  const selectObject = (id: string) => { setObjectId(id); setFieldId(""); setParameterNumber(""); setStep(1); setModifiers([]); };
  const selectField = (id: string) => { setFieldId(id); setStep(2); };
  const toggleModifier = (id: string) => setModifiers((current) => {
    const group = modifierRegistry.find((item) => item.id === id)?.group;
    if (current.includes(id)) return current.filter((item) => item !== id);
    if (group === "case" || group === "text") return [...current.filter((item) => modifierRegistry.find((candidate) => candidate.id === item)?.group !== group), id];
    return [...current, id];
  });

  const content = <section className="documentation-layout">
      <main className={`panel documentation documentation--${viewMode}`}>
        <header className="documentation__intro"><BookOpen /><div><h1>Конструктор змінних</h1><h2>Покрокове складання</h2><p>Оберіть частину змінної, а потім поверніться до будь-якого кроку, щоб змінити її.</p></div></header>
        <div className="constructor-view-switch"><button className={viewMode === "constructor" ? "active" : ""} onClick={() => { setViewMode("constructor"); setStep(0); }}>Конструктор змінних</button><button className={viewMode === "all" ? "active" : ""} onClick={() => { setViewMode("all"); setStep(1); }}>Всі змінні</button></div>
        {viewMode === "constructor" && <div className="constructor-steps">{["Об’єкт", "Поле", "Модифікатори"].map((label, index) => <button className={step === index ? "active" : ""} key={label} onClick={() => setStep(index)}>{index + 1}. {label}</button>)}</div>}
        {step === 0 && viewMode === "constructor" && <div className="constructor-object-grid">{objects.map((item) => <button key={item.id} onClick={() => selectObject(item.id)}><b>{item.label}</b><span>Поля та доступні форми</span></button>)}</div>}
        {(step === 1 || viewMode === "all") && <section className="constructor-fields"><SearchInput placeholder="Пошук поля або змінної…" value={query} onChange={setQuery} /><div className="variable-grid">{categoryItems.map((item) => <button className={field?.id === item.id ? "variable-token variable-token--selected" : "variable-token"} key={item.id} onClick={() => selectField(item.id)}><code>{`{{${item.id}}}`}</code><b>{item.name}</b><span>{item.description}</span></button>)}</div>{isPerson && viewMode === "constructor" && <label className="field">Номер військовослужбовця<input type="number" min="1" value={personNumber} onChange={(event) => setPersonNumber(event.target.value)} /></label>}{objectId === "document" && viewMode === "constructor" && <label className="field">Номер параметра <small>Необов’язково. Залиште порожнім для однієї змінної або введіть 1, 2, 3… для кількох значень.</small><input type="number" min="1" value={parameterNumber} onChange={(event) => setParameterNumber(event.target.value)} placeholder="Наприклад: 1" /></label>}</section>}
        {step === 2 && viewMode === "constructor" && (field ? <section className="constructor-modifiers"><h3>Модифікатори можна комбінувати</h3><div className="modifier-groups">{[["Відмінок", "case"], ["Регістр", "text"], ["Форматування DOCX", "style"]].map(([title, group]) => <section key={group}><h4>{title}</h4><div className="modifier-grid">{modifierRegistry.filter((item) => item.group === group).map((item) => { const unavailable = (group === "case" && !field.supportsCases) || (group === "text" && field.kind === "number"); return <label className={unavailable ? "modifier-unavailable" : ""} key={item.id}><input type={group === "case" || group === "text" ? "radio" : "checkbox"} name={group === "case" ? "grammatical-case" : group === "text" ? "text-case" : undefined} checked={modifiers.includes(item.id)} disabled={unavailable} onChange={() => toggleModifier(item.id)} />{item.name}</label>; })}</div>{group === "case" && !field.supportsCases && <small>Відмінювання для цього поля недоступне.</small>}{group === "text" && field.kind === "number" && <small>Зміна регістру для числового поля недоступна.</small>}</section>)}</div><p>Регістр, жирний шрифт і підкреслення застосовуються до параметрів документа. Відмінок доступний лише для полів, які можна відмінювати.</p></section> : <section className="constructor-empty"><h3>Спочатку оберіть поле</h3><p>Після вибору поля тут будуть доступні сумісні модифікатори.</p></section>)}
      </main>
      <aside className="panel variable-preview"><header className="variable-preview__header">Поточна змінна</header>{field ? <><h2>{field.name}</h2><p>{field.description}</p><div className="word-example"><span>Токен для Word</span><code>{token}</code></div><div className="variable-result"><span>Перекладене значення</span><Preview variable={field} modifiers={modifiers} /></div><button className="button primary" onClick={() => void navigator.clipboard.writeText(token).then(() => notify("Змінну скопійовано.", "success"))}><Copy />Скопіювати змінну</button></> : <div className="variable-preview__empty"><BookOpen /><h2>Змінну ще не обрано</h2><p>Оберіть об’єкт, а потім потрібне поле — тут з’явиться токен і приклад значення.</p></div>}</aside>
    </section>;
  return embedded ? <div className="constructor-modal__content">{content}</div> : <PageFrame className="documentation-page">{content}</PageFrame>;
}
