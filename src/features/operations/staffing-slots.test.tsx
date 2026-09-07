import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildStaffSlots, projectedOccupants, transferConflicts, type SlotTransfer } from "./staffing-slots";
import { StaffTransferModal } from "./StaffTransferModal";
import { buildStaffingHierarchy } from "./StaffingBcsPage";
import { bcsExportRows, bcsGroups, bcsSummary, specializedStructuralGroup, temporaryStaffingRecord } from "./bcs-model";
import type { StaffingRecord } from "./types";
import type { UnitSettings } from "../../shared/types/domain";
import { structureWithUnmappedPositions } from "../../shared/unit-structure";

afterEach(cleanup);
const unit: UnitSettings = { kind: "Рота", shortName: "Тест", authorizedStrength: 50 };
const person = (id: number, position: string): StaffingRecord => ({ personnelId:id, fullName:`Людина ${id}`,rank:"солдат",position,crewId:null,crewName:null,platoon:"",companyName:"",unitType:"",crewPositionName:"",battleOrder:"",sector:"",officialStrength:0,actualStrength:0,crewStatus:"",uavName:"",uavType:"",functionalDuties:"",currentLocation:"",bcsStatus:"",notes:"",actingPosition:"",recommendationCount:0 });
const move = (p: StaffingRecord, slotId: string): SlotTransfer => ({ personnelId:p.personnelId,position:"Водій-електрик",slotId,expectedPosition:p.position,expectedOccupantIds:[] });

describe("Конкретні місця у штаті", () => {
  it("розрізняє однакові назви між взводами та відділеннями", () => {
    const people=[person(1,"водій-електрик 1 відділення 1 взводу"),person(2,"водій-електрик 1 відділення 2 взводу")];
    const slots=buildStaffSlots(people,unit);
    expect(slots.find((s)=>s.id==="platoon-1-department-1-3")?.occupants.map(p=>p.personnelId)).toEqual([1]);
    expect(slots.find((s)=>s.id==="platoon-2-department-1-3")?.occupants.map(p=>p.personnelId)).toEqual([2]);
    expect(slots.find((s)=>s.id==="management-8")?.occupants).toHaveLength(0);
    expect(transferConflicts(slots,[move(people[0],"platoon-2-department-1-3")],people)).toHaveLength(1);
    expect(transferConflicts(slots,[move(people[0],"platoon-2-department-1-3"),move(people[1],"platoon-1-department-1-3")],people)).toHaveLength(0);
  });
  it("не використовує фактичний екіпаж замість штатної посади", () => {
    const p={...person(1,"водій-електрик 1 відділення 2 взводу"),platoon:"1 взвод",crewId:3};
    expect(buildStaffSlots([p],unit).find(s=>s.occupants.length)?.id).toBe("platoon-2-department-1-3");
  });
  it("розрізняє два ідентичні місця навіть у тому самому блоці за ID", () => {
    const structure: UnitSettings["structure"]=[{id:"g",parentId:null,kind:"group",name:"Інші",order:0},{id:"a",parentId:"g",kind:"position",name:"Водій",order:0},{id:"b",parentId:"g",kind:"position",name:"Водій",order:1}];
    expect(buildStaffSlots([person(1,"Водій")],{...unit,structure}).every(s=>!s.occupants.length)).toBe(true);
    const slots=buildStaffSlots([{...person(1,"Водій"),staffSlotId:"b"}],{...unit,structure});
    expect(slots.map(s=>s.occupants.length)).toEqual([0,1]);
  });
  it("враховує order скелета, а не порядок масиву або зайнятість", () => {
    const structure: UnitSettings["structure"]=[{id:"g",parentId:null,kind:"group",name:"Управління роти",order:0},{id:"a",parentId:"g",kind:"position",name:"Водій",order:5},{id:"b",parentId:"g",kind:"position",name:"Технік",order:0}];
    const items=buildStaffingHierarchy([person(1,"водій")],[],"Рота",structure)[0].groups[0].items;
    expect(items.map(item=>item.slot.id)).toEqual(["b","a"]);
    expect(items[0].kind).toBe("vacancy");
  });
  it("не перетворює видалене місце на іншу однойменну посаду", () => {
    expect(buildStaffSlots([{...person(1,"водій"),staffSlotId:"deleted"}],unit).every(s=>!s.occupants.length)).toBe(true);
  });
  it("не показує попередження до початку переміщення та фільтрує саме вакансії", () => {
    const people=[person(1,"командир роти")]; const slots=buildStaffSlots(people,unit);
    render(<StaffTransferModal records={people} slots={slots} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByText(/Завершіть переміщення/)).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Застосувати переміщення"})).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Лише вільні"));
    const expected=slots.filter(s=>projectedOccupants(s,[],people).length===0).length;
    expect(document.querySelectorAll(".position-choice")).toHaveLength(expected);
    expect(screen.queryByRole("button",{name:/^Командир роти/})).not.toBeInTheDocument();
  });
  it("запитує зняття ТВО та зберігає його разом із переміщенням", async () => {
    const people=[person(1,"командир роти"),{...person(2,"технік роти"),actingSlotId:"management-8",actingPosition:"Водій-електрик"}];
    const save=vi.fn().mockResolvedValue(undefined);
    render(<StaffTransferModal records={people} slots={buildStaffSlots(people,unit)} onClose={vi.fn()} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Військовослужбовець для переміщення"),{target:{value:"1"}});
    fireEvent.click(screen.getByRole("button",{name:/Водій-електрик Управління роти/}));
    expect(screen.getByRole("alert")).toHaveTextContent("Людина 2");
    fireEvent.click(screen.getByRole("button",{name:"Зняти ТВО та призначити"}));
    fireEvent.click(screen.getByRole("button",{name:"Застосувати переміщення"}));
    expect(save).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({slotId:"management-8",personnelId:1})]),[{personnelId:2,slotId:"",position:""}]);
  });
});

describe("БЧС та тимчасово прибулі", () => {
  it("має 16 полів експорту та окрему ручну кількість", () => {
    const records=[{...person(1,"водій"),crewId:1,crewName:"Тест",actualStrength:2,currentLocation:"На позиції"},{...person(2,"оператор"),crewId:1,crewName:"Тест",actualStrength:2,currentLocation:"ВІДП"}];
    const rows=bcsExportRows(records);
    expect(rows[0].crewActual).toBe("1"); expect(rows[0].crewOfficial).toBe("2");
    expect(bcsGroups(records)).toHaveLength(1);
  });
  it("рахує фактичну роботу за місцем і за фактичним екіпажем, не змінюючи офіційну кількість", () => {
    const first={...person(1,"оператор"),crewId:1,crewName:"Перший",actualStrength:4,currentLocation:"ЛІК"};
    const transferred={...person(2,"оператор"),crewId:2,crewName:"Другий",actualStrength:3,currentLocation:"ЗБЗ"};
    const logistics={...person(3,"водій"),crewId:2,crewName:"Другий",actualStrength:3,currentLocation:"Логістика на позиції"};
    const rows=bcsExportRows([first,transferred,logistics]);
    expect(rows.find((row)=>row.crewName==="Перший")).toMatchObject({crewActual:"0",crewOfficial:"4"});
    expect(rows.find((row)=>row.crewName==="Другий")).toMatchObject({crewActual:"2",crewOfficial:"3"});
  });
  it("тимчасово прибулі не змінюють штат і рахуються окремо від місця перебування", () => {
    const arrival=temporaryStaffingRecord({id:1,fullName:"Прибула людина",rank:"",duties:"",arrivedAt:"2026-09-06",currentLocation:"УПР",notes:"",category:"Тимчасово прибулі",groupName:""});
    expect(arrival.personnelId).toBe(-1);
    expect(bcsSummary([person(1,"водій"),arrival],10)).toContainEqual(["Тимчасово прибулі",1]);
    expect(bcsSummary([person(1,"водій"),arrival],10)).toContainEqual(["По списку",1]);
    expect(bcsExportRows([arrival])[0]).toMatchObject({isTemporary:true,section:"Тимчасово прибулі",location:"УПР",personnelPosition:""});
  });
  it("зберігає порядок розділів і пріоритет командира взводу над екіпажем", () => {
    const crew={...person(1,"оператор 1 відділення 1 взводу"),crewId:1,crewName:"Альфа",crewStatus:"Працюючий",actualStrength:2};
    const commander={...person(2,"командир взводу 1 взводу"),crewId:1,crewName:"Альфа",crewStatus:"Працюючий",actualStrength:2};
    const attached=temporaryStaffingRecord({id:2,fullName:"Прикомандирований",rank:"",duties:"",arrivedAt:"2026-09-06",currentLocation:"УПР",notes:"",category:"Прикомандировані",groupName:""});
    const groups=bcsGroups([attached,commander,crew]);
    expect(groups.map((group)=>group.section)).toEqual(["Екіпаж","Управління взводів","Прикомандировані"]);
    expect(groups.map((group)=>group.colorKey)).toEqual(["crew-working","platoon-management","attached"]);
    expect(bcsExportRows([crew])[0].crewOfficial).toBe("2");
  });
  it("не рахує відсутніх як наявних", () => {
    expect(bcsSummary([{...person(1,"водій"),currentLocation:"ВІДП"},person(2,"технік")],10)).toContainEqual(["В наявності",1]);
  });
  it("збирає людей поза екіпажами й управлінням у безіменний зелений розділ", () => {
    const groups=bcsGroups([person(1,"оператор 2 відділення 1 взводу"),person(2,"водій-електрик 1 відділення 3 взводу")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({section:"",colorKey:"unassigned"});
  });
  it("залишає назву лише окремому спеціалізованому відділенню", () => {
    const ordinary={...person(1,"оператор 2 відділення 1 взводу"),bcsGroupName:undefined};
    const specialized={...person(2,"оператор"),bcsGroupName:"Відділення збору та обробки інформації"};
    expect(bcsGroups([ordinary,specialized]).map((group)=>group.section)).toEqual(["Відділення збору та обробки інформації",""]);
    expect(specializedStructuralGroup("1 взвод","2 відділення")).toBeUndefined();
    expect(specializedStructuralGroup("Окремі відділення","Відділення збору та обробки інформації")).toBe("Відділення збору та обробки інформації");
  });
  it("створює відділення збору та обробки з повної штатної посади", () => {
    const position="дешифрувальник розвідувальних матеріалів з безпілотних літальних апаратів відділення збору та обробки інформації роти безпілотних авіаційних комплексів";
    const legacyUnit={...unit,structure:[...(unit.structure ?? []),{id:"legacy-other",parentId:null,kind:"group" as const,name:"Інші",order:99},{id:"legacy-position",parentId:"legacy-other",kind:"position" as const,name:position,order:0}]};
    const structure=structureWithUnmappedPositions(legacyUnit,[position]);
    const group=structure.find((item)=>item.kind==="group"&&item.name==="Відділення збору та обробки інформації");
    expect(group).toBeDefined();
    expect(structure.find((item)=>item.parentId===group?.id)?.name).toBe("дешифрувальник розвідувальних матеріалів з безпілотних літальних апаратів");
    expect(structure.some((item)=>item.id==="legacy-position")).toBe(false);
    const slot=buildStaffSlots([person(1,position)],{...unit,structure}).find((item)=>item.occupants.length);
    expect(slot).toMatchObject({section:"Відділення збору та обробки інформації",name:"дешифрувальник розвідувальних матеріалів з безпілотних літальних апаратів"});
  });
  it("сортує екіпажі за статусом та не зараховує рядові відділення до управління роти", () => {
    const inactive={...person(1,"оператор"),crewId:1,crewName:"А",crewStatus:"Не активний"};
    const forming={...person(2,"оператор"),crewId:2,crewName:"Б",crewStatus:"Формується"};
    const working={...person(3,"оператор"),crewId:3,crewName:"В",crewStatus:"Працюючий"};
    expect(bcsGroups([inactive,forming,working]).map((group)=>group.people[0].crewStatus)).toEqual(["Працюючий","Формується","Не активний"]);
    expect(bcsGroups([{...person(4,"водій"),bcsStructureKind:"ordinary"}])[0].section).toBe("");
    expect(bcsGroups([{...person(5,"водій"),bcsStructureKind:"company"}])[0].section).toBe("Управління роти");
  });
  it("зберігає порядок посад зі скелета всередині розділу БЧС", () => {
    const later={...person(1,"Оператор"),bcsStructureKind:"ordinary",bcsOrder:20};
    const earlier={...person(2,"Командир відділення"),bcsStructureKind:"ordinary",bcsOrder:10};
    expect(bcsGroups([later,earlier])[0].people.map((item)=>item.position)).toEqual(["Командир відділення","Оператор"]);
  });
});
