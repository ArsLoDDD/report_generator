import type { UnitSettings, UnitStructureNode } from "./types/domain";

const managementPositions = ["Командир роти", "Заступник командира", "Заступник командира роти з психологічної підтримки персоналу", "Головний сержант", "Старший технік", "Технік", "Сержант із матеріального забезпечення", "Старший бойовий медик", "Водій-електрик", "Водій"];
const departmentPositions = ["Командир відділення", "Оператор", "Механік", "Водій-електрик"];
const node = (id: string, parentId: string | null, kind: UnitStructureNode["kind"], name: string, order: number): UnitStructureNode => ({ id, parentId, kind, name, order });

export function defaultUnitStructure(kind: UnitSettings["kind"]): UnitStructureNode[] {
  if (kind === "Інше") return [node("other", null, "group", "Інші", 0)];
  const root = kind === "Рота" ? "Управління роти" : "Управління взводу";
  const structure: UnitStructureNode[] = [node("management", null, "group", root, 0)];
  (kind === "Рота" ? managementPositions : ["Командир взводу", "Головний сержант", "Технік", "Водій", "Водій-електрик"]).forEach((name, index) => structure.push(node(`management-${index}`, "management", "position", name, index)));
  if (kind === "Рота") {
    [1, 2, 3].forEach((platoon) => {
      const platoonId = `platoon-${platoon}`;
      structure.push(node(platoonId, null, "group", `${platoon} взвод`, platoon));
      structure.push(node(`${platoonId}-command`, platoonId, "group", "Командування взводу", 0));
      structure.push(node(`${platoonId}-commander`, `${platoonId}-command`, "position", "Командир взводу", 0));
      [1, 2, 3].forEach((department) => {
        const departmentId = `${platoonId}-department-${department}`;
        structure.push(node(departmentId, platoonId, "group", `${department} відділення`, department));
        const positions = [...departmentPositions];
        if (department === 1) positions[0] = "Головний сержант — командир відділення";
        positions.forEach((name, index) => structure.push(node(`${departmentId}-${index}`, departmentId, "position", name, index)));
      });
    });
  } else {
    [1, 2, 3].forEach((department) => {
      const id = `department-${department}`;
      structure.push(node(id, null, "group", `${department} відділення`, department));
      const positions = [...departmentPositions];
      if (department === 1) positions[0] = "Головний сержант — командир відділення";
      positions.forEach((name, index) => structure.push(node(`${id}-${index}`, id, "position", name, index)));
    });
  }
  return structure;
}

export function usableUnitStructure(unit: UnitSettings): UnitStructureNode[] {
  return unit.structure?.length ? unit.structure : defaultUnitStructure(unit.kind);
}

export function structureWithUnmappedPositions(unit: UnitSettings, positions: string[]): UnitStructureNode[] {
  let structure = [...usableUnitStructure(unit)];
  const normalize = (value: string) => value.trim().toLocaleLowerCase("uk").replace(/\s+/gu, " ");
  const collectionDepartment = "Відділення збору та обробки інформації";
  const collectionPattern = /відділення\s+збору\s+та\s+обробки\s+інформації/iu;
  const collectionPositions = [...new Set(positions.map((item) => item.trim()).filter((position) => collectionPattern.test(position)))];
  if (collectionPositions.length) {
    let group = structure.find((item) => item.kind === "group" && normalize(item.name) === normalize(collectionDepartment));
    if (!group) {
      group = node("special-collection-processing", null, "group", collectionDepartment, structure.filter((item) => item.parentId === null).length);
      structure.push(group);
    }
    for (const source of collectionPositions) {
      const title = source.slice(0, source.search(collectionPattern)).trim().replace(/[—–,:;-]+$/u, "").trim();
      if (!title || structure.some((item) => item.kind === "position" && item.parentId === group?.id && normalize(item.name) === normalize(title))) continue;
      structure.push(node(`special-collection-position-${structure.length}`, group.id, "position", title, structure.filter((item) => item.parentId === group?.id).length));
    }
    // Older inferred skeletons could keep the complete source position in "Інші".
    // Once the dedicated department exists, that legacy copy must not produce a
    // second vacancy or a duplicate person in staffing/БЧС.
    structure = structure.filter((item) => item.kind !== "position" || item.parentId === group.id || !collectionPattern.test(item.name));
  }
  const known = structure.filter((item) => item.kind === "position").map((item) => normalize(item.name));
  const unmapped = [...new Set(positions.map((item) => item.trim()).filter(Boolean))].filter((position) => !collectionPattern.test(position) && !known.some((name) => normalize(position).includes(name) || name.includes(normalize(position))));
  if (!unmapped.length) return structure;
  const other = structure.find((item) => item.kind === "group" && item.parentId === null && normalize(item.name) === "інші") ?? node("other", null, "group", "Інші", structure.filter((item) => item.parentId === null).length);
  const next = other.id === "other" && !structure.some((item) => item.id === "other") ? [...structure, other] : [...structure];
  unmapped.forEach((name, index) => next.push(node(`other-position-${index}-${name.length}`, other.id, "position", name, next.filter((item) => item.parentId === other.id).length + index)));
  return next;
}
