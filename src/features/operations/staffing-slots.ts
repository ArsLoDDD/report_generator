import type { UnitSettings, UnitStructureNode } from "../../shared/types/domain";
import { usableUnitStructure } from "../../shared/unit-structure";
import type { StaffingRecord } from "./types";

export const normalizeStaffPosition = (value: string) => value.toLocaleLowerCase("uk").replace(/[aа](?=\d{4})/gu, "а").replace(/[—–-]/gu, " ").replace(/\s+/gu, " ").trim();
const numberIn = (value: string, noun: string) => value.match(new RegExp(`(?:^|\\s)(\\d+)(?:-?го)?\\s+${noun}|${noun}\\S*\\s*(?:№\\s*)?(\\d+)(?:\\s|$)`, "u"))?.slice(1).find(Boolean);
export type StaffSlot = { id: string; name: string; path: string; position: string; section: string; group: string; occupants: StaffingRecord[] };

function ancestors(node: UnitStructureNode, nodes: UnitStructureNode[]) {
  const result: UnitStructureNode[] = [];
  const visited = new Set([node.id]);
  let parent = nodes.find((item) => item.id === node.parentId);
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id); result.unshift(parent); parent = nodes.find((item) => item.id === parent?.parentId);
  }
  return result;
}

/** One entry per billet, never one entry per job title. Crew membership is not a staff assignment. */
export function buildStaffSlots(records: StaffingRecord[], unit: UnitSettings): StaffSlot[] {
  const nodes = usableUnitStructure(unit);
  const ordered: UnitStructureNode[] = [];
  const visit = (parentId: string | null) => nodes.filter((node) => node.parentId === parentId).sort((a, b) => a.order - b.order).forEach((node) => {
    if (ordered.some((item) => item.id === node.id)) return;
    ordered.push(node); if (node.kind === "group") visit(node.id);
  });
  visit(null);
  const slots: StaffSlot[] = ordered.filter((node) => node.kind === "position").map((node) => {
    const parents = ancestors(node, nodes);
    const context = parents.map((parent) => parent.name);
    const suffix = [...parents].reverse().filter((parent) => !/^(управління|командування)/iu.test(parent.name)).map((parent) => parent.name.replace(/взвод$/u, "взводу").replace(/відділення$/u, "відділення"));
    return { id: node.id, name: node.name, path: context.join(" / "), section: context[0] || "Інші", group: context[context.length - 1] || "Інші", position: [node.name, ...suffix, unit.fullName, unit.unitCode ? `військової частини ${unit.unitCode}` : ""].filter(Boolean).join(" "), occupants: [] };
  });
  for (const person of new Map(records.map((person) => [person.personnelId, person])).values()) {
    const explicit = slots.find((slot) => slot.id === person.staffSlotId);
    if (explicit) { explicit.occupants.push(person); continue; }
    // A deleted billet must not silently become another billet with the same name.
    if (person.staffSlotId) continue;
    const actual = normalizeStaffPosition(person.position);
    const platoon = numberIn(actual, "взвод");
    const department = numberIn(actual, "відділен") ?? (/^головний сержант командир відділення/u.test(actual) ? "1" : undefined);
    const code = actual.match(/а\d{4}/u)?.[0];
    if (code && unit.unitCode && code !== normalizeStaffPosition(unit.unitCode)) continue;
    const candidates = slots.filter((slot) => {
      const path = normalizeStaffPosition(slot.path);
      const expected = normalizeStaffPosition(slot.name);
      if (platoon !== numberIn(path, "взвод") || department !== numberIn(path, "відділен")) return false;
      if (/управління роти/u.test(path) && /взвод|відділен/u.test(actual)) return false;
      return actual === expected || actual.startsWith(`${expected} `) || (expected === "командир взводу" && /^командир \d+ взводу/u.test(actual)) || (expected.endsWith("командир відділення") && actual.startsWith(expected.replace("командир відділення", `командир ${department} відділення`)));
    }).sort((a, b) => b.name.length - a.name.length);
    const best = candidates.filter((slot) => slot.name.length === candidates[0]?.name.length);
    // Ambiguous identical slots remain unmapped until an explicit transfer assigns a slot ID.
    if (best.length === 1) best[0].occupants.push(person);
  }
  return slots;
}

export type SlotTransfer = { personnelId: number; position: string; slotId: string; expectedPosition: string; expectedOccupantIds: number[] };
export type ActingChange = { personnelId: number; slotId: string; position: string };
export function projectedOccupants(slot: StaffSlot, moves: SlotTransfer[], records: StaffingRecord[]) {
  const remaining = slot.occupants.filter((person) => !moves.some((move) => move.personnelId === person.personnelId));
  return [...remaining, ...moves.filter((move) => move.slotId === slot.id).flatMap((move) => records.filter((person) => person.personnelId === move.personnelId))];
}
export function transferConflicts(slots: StaffSlot[], moves: SlotTransfer[], records: StaffingRecord[]) {
  return slots.filter((slot) => moves.some((move) => move.slotId === slot.id)).map((slot) => ({ slot, people: projectedOccupants(slot, moves, records) })).filter((item) => item.people.length > 1);
}
export function actingForSlot(slot: StaffSlot, records: StaffingRecord[], slots: StaffSlot[]) {
  return records.filter((person) => person.actingSlotId ? person.actingSlotId === slot.id : !!person.actingPosition && normalizeStaffPosition(person.actingPosition) === normalizeStaffPosition(slot.position) && slots.filter((item) => normalizeStaffPosition(item.position) === normalizeStaffPosition(slot.position)).length === 1);
}
