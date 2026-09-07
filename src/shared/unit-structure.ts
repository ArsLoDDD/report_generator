import type { UnitSettings, UnitStructureNode } from "./types/domain";

const managementPositions = ["Командир роти", "Заступник командира", "Заступник командира роти з психологічної підтримки персоналу", "Головний сержант", "Старший технік", "Технік", "Сержант із матеріального забезпечення", "Старший бойовий медик", "Водій-електрик", "Водій"];
const departmentPositions = ["Командир відділення", "Оператор", "Механік", "Водій-електрик"];
const node = (id: string, parentId: string | null, kind: UnitStructureNode["kind"], name: string, order: number): UnitStructureNode => ({ id, parentId, kind, name, order });

/** Adds the complete штатний каркас of one platoon without replacing custom nodes. */
function ensurePlatoonStructure(structure: UnitStructureNode[], platoon: number, normalize: (value: string) => string) {
  const platoonName = `${platoon} взвод`;
  let root = structure.find((item) => item.kind === "group" && item.parentId === null && normalize(item.name) === normalize(platoonName));
  if (!root) {
    root = node(`inferred-platoon-${platoon}`, null, "group", platoonName, Math.max(-1, ...structure.filter((item) => item.parentId === null).map((item) => item.order)) + 1);
    structure.push(root);
  }
  const childId = (suffix: string) => `${root!.id}-${suffix}`;
  let command = structure.find((item) => item.kind === "group" && item.parentId === root!.id && normalize(item.name) === normalize("Командування взводу"));
  if (!command) {
    command = node(childId("command"), root.id, "group", "Командування взводу", 0);
    structure.push(command);
  }
  if (!structure.some((item) => item.kind === "position" && item.parentId === command!.id && normalize(item.name) === normalize("Командир взводу"))) {
    structure.push(node(childId("commander"), command.id, "position", "Командир взводу", 0));
  }
  [1, 2, 3].forEach((department) => {
    const departmentName = `${department} відділення`;
    let group = structure.find((item) => item.kind === "group" && item.parentId === root!.id && normalize(item.name) === normalize(departmentName));
    if (!group) {
      group = node(childId(`department-${department}`), root.id, "group", departmentName, department);
      structure.push(group);
    }
    const standardPositions = [...departmentPositions];
    if (department === 1) standardPositions[0] = "Головний сержант — командир відділення";
    standardPositions.forEach((name, index) => {
      if (!structure.some((item) => item.kind === "position" && item.parentId === group!.id && normalize(item.name) === normalize(name))) {
        structure.push(node(childId(`department-${department}-${index}`), group!.id, "position", name, index));
      }
    });
  });
}

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

export type UnitStructureSource = string | { position: string; slotId?: string };

export function structureWithUnmappedPositions(unit: UnitSettings, sources: UnitStructureSource[]): UnitStructureNode[] {
  let structure = [...usableUnitStructure(unit)];
  const normalize = (value: string) => value.trim().toLocaleLowerCase("uk").replace(/\s+/gu, " ");
  const positions = sources.map((source) => typeof source === "string" ? { position: source } : source).filter((source) => source.position.trim());
  // The штат often grows after the base structure was made.  A position such as
  // "водій-електрик 1 відділення 4 взводу" is authoritative evidence that the
  // fourth platoon exists, so build its complete standard skeleton first.
  // This makes the person, vacancies, staffing and БЧС use the same structure.
  if (unit.kind !== "Окремий взвод") {
    const platoons = new Set<number>();
    positions.forEach((source) => {
      const match = source.position.match(/(?:^|\s)(\d+)(?:[-‑–]?(?:го|й|ий|ому|ім|а))?\s+взвод\p{L}*/iu);
      const number = Number(match?.[1]);
      if (Number.isInteger(number) && number > 0) platoons.add(number);
    });
    [...platoons].sort((first, second) => first - second).forEach((platoon) => ensurePlatoonStructure(structure, platoon, normalize));
  }
  const collectionDepartment = "Відділення збору та обробки інформації";
  const collectionPattern = /відділення\s+збору\s+та\s+обробки\s+інформації/iu;
  const collectionPositions = positions.filter((source) => collectionPattern.test(source.position));
  if (collectionPositions.length) {
    let group = structure.find((item) => item.kind === "group" && normalize(item.name) === normalize(collectionDepartment));
    if (!group) {
      group = node("special-collection-processing", null, "group", collectionDepartment, structure.filter((item) => item.parentId === null).length);
      structure.push(group);
    }
    const titleOf = (source: string) => source.slice(0, source.search(collectionPattern)).trim().replace(/[—–,:;-]+$/u, "").trim();
    const required = new Map<string, { title: string; sources: typeof collectionPositions }>();
    collectionPositions.forEach((source) => {
      const title = titleOf(source.position);
      if (!title) return;
      const key = normalize(title);
      const current = required.get(key) ?? { title, sources: [] };
      current.sources.push(source);
      required.set(key, current);
    });
    required.forEach(({ title, sources: matchingSources }) => {
      const existing = structure.filter((item) => item.kind === "position" && item.parentId === group!.id && normalize(item.name) === normalize(title));
      matchingSources.slice(existing.length).forEach((source, index) => {
        const sourceId = source.slotId?.trim();
        const id = sourceId && !structure.some((item) => item.id === sourceId) ? sourceId : `special-collection-position-${structure.length}-${index}`;
        structure.push(node(id, group!.id, "position", title, structure.filter((item) => item.parentId === group!.id).length));
      });
    });
    // Older inferred skeletons could keep the complete source position in "Інші".
    // Once the dedicated department exists, that legacy copy must not produce a
    // second vacancy or a duplicate person in staffing/БЧС.
    structure = structure.filter((item) => item.kind !== "position" || item.parentId === group.id || !collectionPattern.test(item.name));
  }
  // Earlier versions could save a complete imported штатна посада as an
  // automatically-created item under "Інші" before the corresponding platoon
  // was inferred.  Do not keep that stale duplicate once the proper place now
  // exists in the skeleton.
  const otherGroup = structure.find((item) => item.kind === "group" && item.parentId === null && normalize(item.name) === "інші");
  const numberIn = (value: string, noun: string) => value.match(new RegExp(`(?:^|\\s)(\\d+)(?:[-‑–]?(?:го|й|ий|ому|ім|а))?\\s+${noun}\\p{L}*`, "iu"))?.[1];
  const ancestorsOf = (item: UnitStructureNode) => {
    const result: UnitStructureNode[] = [];
    let parent = structure.find((candidate) => candidate.id === item.parentId);
    while (parent) { result.unshift(parent); parent = structure.find((candidate) => candidate.id === parent?.parentId); }
    return result;
  };
  const legacyOtherMatchesSlot = (legacy: UnitStructureNode) => {
    const actual = normalize(legacy.name);
    const platoon = numberIn(actual, "взвод");
    const department = numberIn(actual, "відділен");
    return structure.filter((candidate) => candidate.kind === "position" && candidate.parentId !== otherGroup?.id).some((candidate) => {
      const expected = normalize(candidate.name);
      const path = normalize(ancestorsOf(candidate).map((parent) => parent.name).join(" "));
      if (platoon && platoon !== numberIn(path, "взвод")) return false;
      if (department && department !== numberIn(path, "відділен")) return false;
      return actual.startsWith(`${expected} `) || actual === expected
        || (expected === "командир взводу" && /^командир \d+ взвод/iu.test(actual))
        || (expected.endsWith("командир відділення") && /^головний сержант командир 1 відділен/iu.test(actual));
    });
  };
  if (otherGroup) {
    structure = structure.filter((item) => item.parentId !== otherGroup.id || !item.id.startsWith("other-position-") || !legacyOtherMatchesSlot(item));
  }
  const known = structure.filter((item) => item.kind === "position").map((item) => normalize(item.name));
  const unmapped = [...new Set(positions.map((item) => item.position.trim()).filter(Boolean))].filter((position) => !collectionPattern.test(position) && !known.some((name) => normalize(position).includes(name) || name.includes(normalize(position))));
  if (!unmapped.length) return structure;
  const other = structure.find((item) => item.kind === "group" && item.parentId === null && normalize(item.name) === "інші") ?? node("other", null, "group", "Інші", structure.filter((item) => item.parentId === null).length);
  const next = other.id === "other" && !structure.some((item) => item.id === "other") ? [...structure, other] : [...structure];
  unmapped.forEach((name, index) => next.push(node(`other-position-${index}-${name.length}`, other.id, "position", name, next.filter((item) => item.parentId === other.id).length + index)));
  return next;
}
