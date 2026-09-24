import type { Vehicle } from "../vehicles/types";
import { isAvailableForFlightPlan } from "./bcs-model";
import type { Crew, Equipment, FlightPlanEntry, FlightPlanPersonnelTransition, FlightPlanRotation, FlightPlanWeather, WorkshopProduct } from "./types";

export const FLIGHT_PLAN_HEADERS = [
  "№ п/п", "Підрозділ", "Тип БпАК (№ борта)", "Найменування екіпажу (позиція)",
  "Смуга відповідальності (кому підпорядковано)", "Командир екіпажу БпАК, позивний",
  "ПІБ складу екіпажу БпАК", "Погодні умови польоту БпЛА",
  "Маршрут та висота польоту на ділянках маршруту", "Район виконання завдання (н.п.)",
  "Завдання польоту", "Озброєння та техніка, яка задіяна до забезпечення польотів БпАК",
  "Планований час початку завдання", "Планований час закінчення завдання",
] as const;

export const FLIGHT_TASKS = ["Розвідка противника та місцевості", "Ураження противника"];
export const isFlightPlanMemberAvailable = (member: Crew["members"][number]) => isAvailableForFlightPlan(member.currentLocation ?? "");
export const initialWeather = (): FlightPlanWeather => ({ temperature:"20",windFrom:"2",windTo:"4",gustFrom:"5",gustTo:"7",cloudiness:"10",cloudHeight:"2000",precipitation:"0" });
export const splitPoints = (value: string) => value.split(/[,;\n]+/u).map((part) => part.trim()).filter(Boolean);
export const initialFlightEntry = (crew: Crew, uavs:Equipment[]=[]): FlightPlanEntry => {
  const availableMembers = crew.actualMembers.filter(isFlightPlanMemberAvailable);
  return { crewId:crew.id,actualMemberIds:availableMembers.map((member)=>member.personnelId),actualCommanderId:availableMembers.find((member)=>member.position.toLocaleLowerCase("uk").includes("командир"))?.personnelId??availableMembers[0]?.personnelId??null,actualVehicleId:null,withoutVehicle:false,weather:initialWeather(),routePoints:[],altitudeFrom:"800",altitudeTo:"1100",areaPoints:splitPoints(crew.reconnaissanceArea),task:FLIGHT_TASKS[0],startTime:"05:00",endTime:"21:00",uavSelections:uavs.filter((item)=>item.crewId===crew.id).map((item)=>({equipmentId:item.id,dayQuantity:item.dayQuantity,nightQuantity:item.nightQuantity})),payloadSelection:null,arrivesToday:false,departsToday:false,departureTime:"" };
};

export type FlightPlanScheduleValidation = {
  isValid: boolean;
  departureError?: string;
  rotationError?: string;
  errors: string[];
};

const scheduleMinute = (value?: string) => {
  const [hours, minutes] = (value ?? "").split(":").map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60
    ? hours * 60 + minutes
    : null;
};

const scheduleTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

const uniquePersonnelIds = (ids: readonly number[] | undefined) => [...new Set((ids ?? []).filter(Number.isInteger))];
const transitionTime = (value: string | undefined) => scheduleMinute(value);

export type FlightPlanPersonnelTransitionValidation = {
  isValid: boolean;
  errors: string[];
  errorsByTransition: Record<string, string[]>;
};

export type FlightPlanPersonnelTransitionBounds = {
  stageStartTime?: string;
  departureTime?: string;
};

/** Returns request-level personnel transitions for one crew in their stored order. */
export function flightPlanPersonnelTransitionsForCrew(
  transitions: readonly FlightPlanPersonnelTransition[] | null | undefined,
  crewId: number,
): FlightPlanPersonnelTransition[] {
  return (transitions ?? []).filter((transition) => transition?.crewId === crewId);
}

/** Applies one complete transition. Missing arrays from older snapshots are treated as empty. */
export function applyFlightPlanPersonnelTransition(
  memberIds: readonly number[],
  transition: FlightPlanPersonnelTransition,
): number[] {
  const outgoing = new Set(uniquePersonnelIds(transition.outgoingMemberIds));
  const remaining = uniquePersonnelIds(memberIds).filter((id) => !outgoing.has(id));
  return uniquePersonnelIds([...remaining, ...uniquePersonnelIds(transition.incomingMemberIds)]);
}

/** Reverses one complete transition. Original order is preserved for unaffected people. */
export function reverseFlightPlanPersonnelTransition(
  memberIds: readonly number[],
  transition: FlightPlanPersonnelTransition,
): number[] {
  const incoming = new Set(uniquePersonnelIds(transition.incomingMemberIds));
  const remaining = uniquePersonnelIds(memberIds).filter((id) => !incoming.has(id));
  return uniquePersonnelIds([...remaining, ...uniquePersonnelIds(transition.outgoingMemberIds)]);
}

type PersonnelChange = { transitionIndex: number; minute: number; direction: "outgoing" | "incoming"; memberIds: number[] };

const personnelChanges = (
  transitions: readonly FlightPlanPersonnelTransition[] | null | undefined,
  crewId: number,
): PersonnelChange[] => flightPlanPersonnelTransitionsForCrew(transitions, crewId).flatMap((transition, transitionIndex) => {
  const changes: PersonnelChange[] = [];
  const outgoingIds = uniquePersonnelIds(transition.outgoingMemberIds);
  const incomingIds = uniquePersonnelIds(transition.incomingMemberIds);
  const outgoingMinute = transitionTime(transition.outgoingTime);
  const incomingMinute = transitionTime(transition.incomingTime);
  if (outgoingIds.length && outgoingMinute !== null) changes.push({ transitionIndex, minute: outgoingMinute, direction: "outgoing", memberIds: outgoingIds });
  if (incomingIds.length && incomingMinute !== null) changes.push({ transitionIndex, minute: incomingMinute, direction: "incoming", memberIds: incomingIds });
  return changes;
}).sort((left, right) => left.minute - right.minute || (left.direction === right.direction ? left.transitionIndex - right.transitionIndex : left.direction === "outgoing" ? -1 : 1));

/**
 * Calculates who is physically on the position through a given HH:mm moment.
 * With no time, all valid timed changes are applied. Invalid or missing times are
 * ignored so legacy snapshots without personnelTransitions remain readable.
 */
export function flightPlanPersonnelAtTime(
  initialMemberIds: readonly number[],
  transitions: readonly FlightPlanPersonnelTransition[] | null | undefined,
  crewId: number,
  throughTime?: string,
): number[] {
  const throughMinute = throughTime === undefined ? null : transitionTime(throughTime);
  let result = uniquePersonnelIds(initialMemberIds);
  for (const change of personnelChanges(transitions, crewId)) {
    if (throughTime !== undefined && (throughMinute === null || change.minute > throughMinute)) continue;
    if (change.direction === "outgoing") {
      const outgoing = new Set(change.memberIds);
      result = result.filter((id) => !outgoing.has(id));
    } else {
      result = uniquePersonnelIds([...result, ...change.memberIds]);
    }
  }
  return result;
}

/** Applies every valid timed transition for a crew and returns the final composition. */
export function applyFlightPlanPersonnelTransitions(
  initialMemberIds: readonly number[],
  transitions: readonly FlightPlanPersonnelTransition[] | null | undefined,
  crewId: number,
): number[] {
  return flightPlanPersonnelAtTime(initialMemberIds, transitions, crewId);
}

/** Rewinds all valid timed changes for a crew, useful when deriving the initial composition. */
export function reverseFlightPlanPersonnelTransitions(
  finalMemberIds: readonly number[],
  transitions: readonly FlightPlanPersonnelTransition[] | null | undefined,
  crewId: number,
): number[] {
  let result = uniquePersonnelIds(finalMemberIds);
  const changes = personnelChanges(transitions, crewId);
  for (let index = changes.length - 1; index >= 0; index -= 1) {
    const change = changes[index];
    if (change.direction === "incoming") {
      const incoming = new Set(change.memberIds);
      result = result.filter((id) => !incoming.has(id));
    } else {
      result = uniquePersonnelIds([...result, ...change.memberIds]);
    }
  }
  return result;
}

/**
 * Reconstructs the composition before request-level transitions. The plan entry
 * may therefore keep the final composition which is shown in its single row.
 */
export function reconstructInitialMemberIds(
  finalMemberIds: readonly number[],
  transitions: readonly FlightPlanPersonnelTransition[] | null | undefined,
  crewId: number,
): number[] {
  return reverseFlightPlanPersonnelTransitions(finalMemberIds, transitions, crewId);
}

/** Validates membership changes against the initial position roster and actual crew. */
export function validateFlightPlanPersonnelTransitions(
  initialMemberIds: readonly number[],
  transitions: readonly FlightPlanPersonnelTransition[] | null | undefined,
  crewId: number,
  actualMemberIds: readonly number[],
  bounds: FlightPlanPersonnelTransitionBounds = {},
): FlightPlanPersonnelTransitionValidation {
  const crewTransitions = flightPlanPersonnelTransitionsForCrew(transitions, crewId);
  const errorsByTransition: Record<string, string[]> = {};
  const actual = new Set(uniquePersonnelIds(actualMemberIds));
  const current = new Set(uniquePersonnelIds(initialMemberIds));
  const stageStartMinute = transitionTime(bounds.stageStartTime);
  const departureMinute = transitionTime(bounds.departureTime);
  let previousTransitionMinute = stageStartMinute;
  const addError = (index: number, message: string) => {
    const key = crewTransitions[index]?.id?.trim() || `transition-${index + 1}`;
    errorsByTransition[key] = [...(errorsByTransition[key] ?? []), message];
  };

  crewTransitions.forEach((transition, index) => {
    const outgoing = uniquePersonnelIds(transition.outgoingMemberIds);
    const incoming = uniquePersonnelIds(transition.incomingMemberIds);
    if (!outgoing.length && !incoming.length) addError(index, "Оберіть хоча б одну людину для виведення або заведення.");
    if ((transition.outgoingMemberIds?.length ?? 0) !== outgoing.length) addError(index, "Список ОС для виведення містить повтори або некоректні значення.");
    if ((transition.incomingMemberIds?.length ?? 0) !== incoming.length) addError(index, "Список ОС для заведення містить повтори або некоректні значення.");
    if (outgoing.length && transitionTime(transition.outgoingTime) === null) addError(index, "Вкажіть коректний час виведення ОС.");
    if (incoming.length && transitionTime(transition.incomingTime) === null) addError(index, "Вкажіть коректний час заведення ОС.");
    const outgoingMinute = outgoing.length ? transitionTime(transition.outgoingTime) : null;
    const incomingMinute = incoming.length ? transitionTime(transition.incomingTime) : null;
    const actionMinutes = [outgoingMinute, incomingMinute].filter((minute): minute is number => minute !== null);
    const firstMinute = actionMinutes.length ? Math.min(...actionMinutes) : null;
    const lastMinute = actionMinutes.length ? Math.max(...actionMinutes) : null;
    if (outgoingMinute !== null && incomingMinute !== null && outgoingMinute > incomingMinute) addError(index, "Час заведення ОС не може бути раніше часу виведення.");
    if (firstMinute !== null && previousTransitionMinute !== null && firstMinute < previousTransitionMinute) addError(index, "Нову зміну ОС можна додати лише після попередньої зміни та початку поточного етапу.");
    if (lastMinute !== null && departureMinute !== null && lastMinute > departureMinute) addError(index, "Зміна ОС має відбутися не пізніше часу виїзду екіпажу.");
    if (lastMinute !== null) previousTransitionMinute = lastMinute;
    const both = outgoing.filter((id) => incoming.includes(id));
    if (both.length) addError(index, "Одна людина не може одночасно бути у списках заведення та виведення.");
    if (incoming.some((id) => !actual.has(id))) addError(index, "Завести можна лише військовослужбовців із фактичного складу екіпажу.");
  });

  for (const change of personnelChanges(crewTransitions, crewId)) {
    if (change.direction === "outgoing") {
      const missing = change.memberIds.filter((id) => !current.has(id));
      if (missing.length) addError(change.transitionIndex, "Вивести можна лише ОС, який перебуває на позиції на цей час.");
      change.memberIds.forEach((id) => current.delete(id));
    } else {
      const alreadyPresent = change.memberIds.filter((id) => current.has(id));
      if (alreadyPresent.length) addError(change.transitionIndex, "Завести можна лише ОС, якого немає на позиції на цей час.");
      change.memberIds.forEach((id) => current.add(id));
    }
  }
  if (crewTransitions.length > 0 && current.size === 0) {
    addError(crewTransitions.length - 1, "У рядку плану має залишитися хоча б один військовослужбовець. Для виїзду всього екіпажу позначте виїзд із позиції.");
  }

  const errors = [...new Set(Object.values(errorsByTransition).flat())];
  return { isValid: errors.length === 0, errors, errorsByTransition };
}

/**
 * Validates only same-day presence transitions and rotation joints.
 * Working hours do not define presence, except that startTime is the confirmed
 * arrival time when arrivesToday is set by the previous-plan comparison.
 */
export function validateFlightPlanSchedule(primary: FlightPlanEntry, rotations: FlightPlanRotation[] = []): FlightPlanScheduleValidation {
  let rotationError: string | undefined;
  let previous = primary;

  for (let index = 0; index < rotations.length; index += 1) {
    const rotation = rotations[index];
    const previousEnd = scheduleMinute(previous.endTime);
    const previousStart = scheduleMinute(previous.startTime);
    const rotationStart = scheduleMinute(rotation.startTime);
    const number = index + 1;

    if (previousEnd === null || rotationStart === null) {
      rotationError = `Ротація ${number}: вкажіть час закінчення попереднього етапу та час початку ротації.`;
      break;
    }
    if (previousEnd === 23 * 60 + 59) {
      rotationError = `Ротація ${number}: перехід 23:59→00:00 неможливий у межах одного плану. Перенесіть ротацію до плану наступного дня.`;
      break;
    }

    const expectedStart = previousEnd + 1;
    if (rotationStart !== expectedStart) {
      rotationError = `Ротація ${number}: початок має бути о ${scheduleTime(expectedStart)}, одразу після завершення попереднього етапу о ${previous.endTime}.`;
      break;
    }
    if (previousStart !== null && rotationStart <= previousStart) {
      rotationError = `Ротація ${number}: час початку має бути пізніше за початок попереднього етапу.`;
      break;
    }
    previous = rotation;
  }

  let departureError: string | undefined;
  if (primary.departsToday) {
    const departure = scheduleMinute(primary.departureTime);
    if (!primary.departureTime) {
      departureError = "Вкажіть фактичний час виїзду з позиції.";
    } else if (departure === null) {
      departureError = "Вкажіть коректний фактичний час виїзду з позиції.";
    } else {
      const lastRotation = rotations[rotations.length - 1];
      const lastRotationStart = scheduleMinute(lastRotation?.startTime);
      const finalStage = lastRotation ?? primary;
      const finalStageEnd = scheduleMinute(finalStage.endTime);
      const arrival = primary.arrivesToday ? scheduleMinute(primary.startTime) : null;
      if (primary.arrivesToday && arrival === null) {
        departureError = "Вкажіть коректний час заїзду екіпажу.";
      } else if (primary.arrivesToday && arrival !== null && departure <= arrival) {
        departureError = `Час виїзду має бути пізніше за час заїзду о ${primary.startTime}.`;
      } else if (lastRotation && lastRotationStart !== null && departure <= lastRotationStart) {
        departureError = `Час виїзду має бути пізніше за останню ротацію о ${lastRotation.startTime}.`;
      } else if (finalStageEnd === null) {
        departureError = "Вкажіть коректний час завершення останнього етапу роботи.";
      } else if (departure < finalStageEnd) {
        departureError = `Час виїзду не може бути раніше завершення останнього етапу роботи о ${finalStage.endTime}.`;
      }
    }
  }

  const errors = [departureError, rotationError].filter((value): value is string => Boolean(value));
  return { isValid: errors.length === 0, departureError, rotationError, errors };
}

const caps = (value: string) => value.trim().toLocaleUpperCase("uk");
const shortRank = (rank: string) => ({"солдат":"сол.","старший солдат":"ст. сол.","молодший сержант":"мол. серж.","сержант":"серж.","старший сержант":"ст. серж.","головний сержант":"гол. серж.","штаб-сержант":"штаб-серж.","майстер-сержант":"майстер-серж.","молодший лейтенант":"мол. лейт.","лейтенант":"лейт.","старший лейтенант":"ст. лейт.","капітан":"кап.","підполковник":"підполк.","полковник":"полк."}[rank.trim().toLocaleLowerCase("uk")] ?? rank.trim());
const flightPlanRankGroups = [
  ["генерал армії україни"], ["генерал", "адмірал"], ["генерал-полковник"],
  ["генерал-лейтенант", "віце-адмірал"], ["генерал-майор", "контр-адмірал"],
  ["бригадний генерал", "коммодор"], ["полковник", "капітан 1 рангу"],
  ["підполковник", "капітан 2 рангу"], ["майор", "капітан 3 рангу"],
  ["капітан", "капітан-лейтенант"], ["старший лейтенант"], ["лейтенант"], ["молодший лейтенант"],
  ["старший прапорщик"], ["прапорщик"], ["головний майстер-сержант", "головний майстер-старшина"],
  ["старший майстер-сержант", "старший майстер-старшина"], ["майстер-сержант", "майстер-старшина"],
  ["штаб-сержант", "штаб-старшина"], ["головний сержант", "головний корабельний старшина"],
  ["старшина"], ["старший сержант", "головний старшина"], ["сержант", "старшина 1 статті"],
  ["молодший сержант", "старшина 2 статті"], ["старший солдат", "старший матрос"], ["солдат", "матрос"],
] as const;
const flightPlanRankWeight = new Map<string, number>(flightPlanRankGroups.flatMap((group, weight) => group.map((rank) => [rank, weight] as const)));
export const compareFlightPlanMembersByRank = (left: Crew["members"][number], right: Crew["members"][number]) => {
  const leftWeight = flightPlanRankWeight.get(left.rank.trim().toLocaleLowerCase("uk")) ?? flightPlanRankGroups.length;
  const rightWeight = flightPlanRankWeight.get(right.rank.trim().toLocaleLowerCase("uk")) ?? flightPlanRankGroups.length;
  return leftWeight - rightWeight || left.fullName.localeCompare(right.fullName, "uk") || left.personnelId - right.personnelId;
};
const abbreviatedName=(fullName:string)=>{const [surname="",given="",patronymic=""]=fullName.trim().split(/\s+/u);return `${surname} ${given[0]??""}.${patronymic[0]??""}.`.trim();};
const personText = (member: Crew["members"][number]) => [shortRank(member.rank),abbreviatedName(member.fullName),member.callsign?.trim()?`(${member.callsign.trim()})`:""].filter(Boolean).join(" ");
const pointList = (points: string[], separator = " — ") => points.map(caps).filter(Boolean).join(separator);

export type FlightPlanPreviewRow = { rowId: string; crewId: number; cells: string[] };

export function flightPlanPreviewRows(unitName: string, planEntries: FlightPlanEntry[], crews: Crew[], uavs: Equipment[], vehicles: Vehicle[], ammunition: Equipment[] = [], workshopProducts: WorkshopProduct[] = []): FlightPlanPreviewRow[] {
  return planEntries.flatMap((entry, index) => {
    const crewId=entry.crewId;
    const crew = crews.find((item) => item.id === crewId);
    if (!crew || !entry) return [];
    const actualIds=entry.actualMemberIds?.length?new Set(entry.actualMemberIds):new Set(crew.actualMembers.map((member)=>member.personnelId));
    const actual = [...crew.members,...crew.actualMembers].filter((member,index,members)=>actualIds.has(member.personnelId)&&members.findIndex((candidate)=>candidate.personnelId===member.personnelId)===index).sort(compareFlightPlanMembersByRank);
    const commander = actual.find((member) => member.personnelId===entry.actualCommanderId) ?? actual.find((member) => member.position.toLocaleLowerCase("uk").includes("командир")) ?? actual[0];
    const crewUavs = uavs.filter((item) => item.crewId === crewId);
    const selectedUavs=entry.uavSelections.flatMap((selection)=>{const item=crewUavs.find((uav)=>uav.id===selection.equipmentId);return item?[{item,...selection}]:[];});
    const availableVehicles = vehicles.filter((item) => item.crewId === crewId);
    const crewVehicles = entry.withoutVehicle ? [] : availableVehicles.length>1 ? availableVehicles.filter((item)=>item.id===entry.actualVehicleId) : availableVehicles;
    const primaryUav=crewUavs.find((item)=>item.id===crew.primaryUavId);const uavName=primaryUav?[caps(primaryUav.name),caps(primaryUav.inventoryNumber)].filter(Boolean).join(" "):caps(crew.uavName);
    const dayUavs=selectedUavs.reduce((sum,item)=>sum+item.dayQuantity,0);const nightUavs=selectedUavs.reduce((sum,item)=>sum+item.nightQuantity,0);const totalUavs=dayUavs+nightUavs;
    const supportUavs=totalUavs?[`БпЛА ${dayUavs&&nightUavs?"денні/ніч":dayUavs?"денні":"ніч"} - ${totalUavs} шт`]:[];
    const payload = entry.payloadSelection?.sourceType === "equipment" ? ammunition.find((item)=>item.id===entry.payloadSelection?.sourceId)?.name : entry.payloadSelection?.sourceType === "workshop" ? workshopProducts.find((item)=>item.id===entry.payloadSelection?.sourceId)?.name : "";
    const support = [...supportUavs, ...crewVehicles.map((item) => [caps(item.name),caps(item.registrationNumber)].filter(Boolean).join("\n")), payload ? `БК: ${caps(payload)}` : ""].filter(Boolean).join("\n");
    const weather = entry.weather;
    return [{ rowId:`${crewId}-${index}`, crewId, cells:[
      String(index+1), unitName, uavName, [caps(crew.name),crew.positionName ? `(${caps(crew.positionName)})` : ""].filter(Boolean).join("\n"), crew.battleOrder,
      commander ? personText(commander) : "", actual.map(personText).join("\n"),
      `Згідно прогнозу UAV Forecast ${weather.temperature} С, вітер від ${weather.windFrom} до ${weather.windTo} м/с, пориви від ${weather.gustFrom} до ${weather.gustTo} м/с. Хмарність ${weather.cloudiness} % ${weather.cloudHeight} м. Вірогідність опадів ${weather.precipitation} %`,
      `${pointList(entry.routePoints,", ")}\n${entry.altitudeFrom}-${entry.altitudeTo}м`, pointList(entry.areaPoints,", "),
      `Бойове чергування, ${entry.task.toLocaleLowerCase("uk")}`, support, entry.startTime, entry.endTime,
    ] }];
  });
}

export function missingCrewCallsigns(crews: Crew[]) {
  const people = new Map<number,{name:string;crews:Set<string>}>();
  for (const crew of crews) for (const member of [...crew.members,...crew.actualMembers]) {
    if (member.callsign?.trim()) continue;
    const item=people.get(member.personnelId)??{name:member.fullName,crews:new Set<string>()};
    item.crews.add(crew.name); people.set(member.personnelId,item);
  }
  return [...people.values()];
}
