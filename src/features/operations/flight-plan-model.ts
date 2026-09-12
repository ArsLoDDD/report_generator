import type { Vehicle } from "../vehicles/types";
import type { Crew, Equipment, FlightPlanEntry, FlightPlanWeather } from "./types";

export const FLIGHT_PLAN_HEADERS = [
  "№ п/п", "Підрозділ", "Тип БпАК (№ борта)", "Найменування екіпажу (позиція)",
  "Смуга відповідальності (кому підпорядковано)", "Командир екіпажу БпАК, позивний",
  "ПІБ складу екіпажу БпАК", "Погодні умови польоту БпЛА",
  "Маршрут та висота польоту на ділянках маршруту", "Район виконання завдання (н.п.)",
  "Завдання польоту", "Озброєння та техніка, яка задіяна до забезпечення польотів БпАК",
  "Планований час початку завдання", "Планований час закінчення завдання",
] as const;

export const FLIGHT_TASKS = ["Розвідка противника та місцевості", "Ураження противника"];
export const initialWeather = (): FlightPlanWeather => ({ temperature:"20",windFrom:"2",windTo:"4",gustFrom:"5",gustTo:"7",cloudiness:"10",cloudHeight:"2000",precipitation:"0" });
export const splitPoints = (value: string) => value.split(/[,;\n]+/u).map((part) => part.trim()).filter(Boolean);
export const initialFlightEntry = (crew: Crew, uavs:Equipment[]=[]): FlightPlanEntry => ({ crewId:crew.id,actualCommanderId:crew.actualMembers.find((member)=>member.position.toLocaleLowerCase("uk").includes("командир"))?.personnelId??crew.actualMembers[0]?.personnelId??null,actualVehicleId:null,weather:initialWeather(),routePoints:[],altitudeFrom:"800",altitudeTo:"1100",areaPoints:splitPoints(crew.reconnaissanceArea),task:FLIGHT_TASKS[0],startTime:"05:00",endTime:"21:00",uavSelections:uavs.filter((item)=>item.crewId===crew.id).map((item)=>({equipmentId:item.id,dayQuantity:item.dayQuantity,nightQuantity:item.nightQuantity})) });

const caps = (value: string) => value.trim().toLocaleUpperCase("uk");
const shortRank = (rank: string) => ({"солдат":"сол.","старший солдат":"ст. сол.","молодший сержант":"мол. серж.","сержант":"серж.","старший сержант":"ст. серж.","головний сержант":"гол. серж.","штаб-сержант":"штаб-серж.","майстер-сержант":"майстер-серж.","молодший лейтенант":"мол. лейт.","лейтенант":"лейт.","старший лейтенант":"ст. лейт.","капітан":"кап.","підполковник":"підполк.","полковник":"полк."}[rank.trim().toLocaleLowerCase("uk")] ?? rank.trim());
const abbreviatedName=(fullName:string)=>{const [surname="",given="",patronymic=""]=fullName.trim().split(/\s+/u);return `${surname} ${given[0]??""}.${patronymic[0]??""}.`.trim();};
const personText = (member: Crew["members"][number]) => [shortRank(member.rank),abbreviatedName(member.fullName),member.callsign?.trim()?`(${member.callsign.trim()})`:""].filter(Boolean).join(" ");
const pointList = (points: string[], separator = " — ") => points.map(caps).filter(Boolean).join(separator);

export type FlightPlanPreviewRow = { crewId: number; cells: string[] };

export function flightPlanPreviewRows(unitName: string, selected: number[], entries: Record<number, FlightPlanEntry>, crews: Crew[], uavs: Equipment[], vehicles: Vehicle[]): FlightPlanPreviewRow[] {
  return selected.flatMap((crewId, index) => {
    const crew = crews.find((item) => item.id === crewId);
    const entry = entries[crewId];
    if (!crew || !entry) return [];
    const actual = crew.actualMembers;
    const commander = actual.find((member) => member.personnelId===entry.actualCommanderId) ?? actual.find((member) => member.position.toLocaleLowerCase("uk").includes("командир")) ?? actual[0];
    const crewUavs = uavs.filter((item) => item.crewId === crewId);
    const selectedUavs=entry.uavSelections.flatMap((selection)=>{const item=crewUavs.find((uav)=>uav.id===selection.equipmentId);return item?[{item,...selection}]:[];});
    const availableVehicles = vehicles.filter((item) => item.crewId === crewId);
    const crewVehicles = availableVehicles.length>1 ? availableVehicles.filter((item)=>item.id===entry.actualVehicleId) : availableVehicles;
    const primaryUav=crewUavs.find((item)=>item.id===crew.primaryUavId);const uavName=primaryUav?[caps(primaryUav.name),caps(primaryUav.inventoryNumber)].filter(Boolean).join(" "):caps(crew.uavName);
    const dayUavs=selectedUavs.reduce((sum,item)=>sum+item.dayQuantity,0);const nightUavs=selectedUavs.reduce((sum,item)=>sum+item.nightQuantity,0);const totalUavs=dayUavs+nightUavs;
    const supportUavs=totalUavs?[`БпЛА ${dayUavs&&nightUavs?"денні/ніч":dayUavs?"денні":"ніч"} - ${totalUavs} шт`]:[];
    const support = [...supportUavs, ...crewVehicles.map((item) => [caps(item.name),caps(item.registrationNumber)].filter(Boolean).join("\n"))].filter(Boolean).join("\n");
    const weather = entry.weather;
    return [{ crewId, cells:[
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
