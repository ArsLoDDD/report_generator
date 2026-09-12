import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Person } from "../../shared/types/domain";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { CrewsPage } from "./CrewsPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const person=(id:number,name:string):Person=>({id,fullName:name,rank:"солдат",surname:name,givenName:"",patronymic:"",position:"Оператор",taxId:String(id),birthDate:"",educationLevel:"",educationDetails:"",armedForcesServiceStartDate:"",positionAssignedDate:"",positionAssignmentOrder:"",militaryId:"",assignedVehicleName:"",assignedVehicleRegistration:""});
const first=person(1,"ПЕРША ЛЮДИНА");
const last=person(501,"ОСТАННЯ ЛЮДИНА");
const crew={id:9,name:"Сокіл",platoon:"",positionName:"",reconnaissanceArea:"",unitType:"Екіпаж",companyName:"",battleOrder:"",sector:"",officialStrength:1,workingStrength:0,positionId:null,status:"Працюючий",uavName:"",uavType:"",functionalDuties:"",currentLocation:"",notes:"",memberCount:1,members:[{personnelId:501,fullName:last.fullName,rank:last.rank,position:last.position}],actualMembers:[]};

afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();});

describe("Склад екіпажу",()=>{
  it("позначає екіпаж, вибраний у плані польотів, як такий, що перебуває на позиції",async()=>{
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({selected:[9]}));
    invoke.mockImplementation((command:string)=>command==="list_crews"?Promise.resolve([crew]):command==="list_positions"?Promise.resolve([]):command==="list_personnel"?Promise.resolve({items:[first,last],totalCount:2}):command==="list_equipment"||command==="list_incidents"||command==="list_vehicles"?Promise.resolve([]):Promise.resolve());
    render(<NotificationProvider><CrewsPage people={[first,last]}/></NotificationProvider>);
    expect(await screen.findByText("На позиції")).toBeInTheDocument();
  });
  it("завантажує весь особовий склад і попереджає про переміщення з іншого екіпажу",async()=>{
    invoke.mockImplementation((command:string,args?:Record<string,number>)=>{
      if(command==="list_crews") return Promise.resolve([crew]);
      if(command==="list_positions") return Promise.resolve([]);
      if(command==="list_personnel") return Promise.resolve(args?.offset===0?{items:Array.from({length:500},(_,index)=>index===0?first:person(index+1,`ЛЮДИНА ${index+1}`)),totalCount:501}:{items:[last],totalCount:501});
      return Promise.resolve();
    });
    render(<NotificationProvider><CrewsPage people={[first]}/></NotificationProvider>);
    fireEvent.click(await screen.findByRole("button",{name:"Створити екіпаж"}));
    const editor=screen.getByRole("dialog",{name:"Новий екіпаж"});
    fireEvent.change(within(editor).getByRole("textbox",{name:"Назва *"}),{target:{value:"Новий"}});
    fireEvent.click(within(editor).getByRole("button",{name:"Додати людей"}));
    const picker=screen.getByRole("dialog",{name:"Додати до офіційного складу"});
    expect(await within(picker).findByText(last.fullName)).toBeInTheDocument();
    expect(within(picker).getByText(/буде переміщено/)).toBeInTheDocument();
    fireEvent.click(within(picker).getByText(last.fullName));
    fireEvent.click(within(picker).getByRole("button",{name:"Готово"}));
    fireEvent.click(screen.getByRole("button",{name:"Зберегти екіпаж"}));
    await waitFor(()=>expect(invoke).toHaveBeenCalledWith("create_crew",expect.objectContaining({draft:expect.objectContaining({memberIds:[501],actualMemberIds:[501]})})));
    expect(invoke).toHaveBeenCalledWith("list_personnel",{offset:500,limit:500});
  });
  it("видаляє екіпаж лише після підтвердження",async()=>{
    invoke.mockImplementation((command:string)=>command==="list_crews"?Promise.resolve([crew]):command==="list_positions"?Promise.resolve([]):command==="list_personnel"?Promise.resolve({items:[first,last],totalCount:2}):Promise.resolve());
    render(<NotificationProvider><CrewsPage people={[first,last]}/></NotificationProvider>);
    fireEvent.click(await screen.findByText("Сокіл"));
    fireEvent.click(screen.getByRole("button",{name:"Видалити екіпаж"}));
    expect(invoke).not.toHaveBeenCalledWith("delete_crew",expect.anything());
    const confirmation=screen.getByRole("dialog",{name:"Видалити екіпаж?"});
    fireEvent.click(within(confirmation).getByRole("button",{name:"Видалити"}));
    await waitFor(()=>expect(invoke).toHaveBeenCalledWith("delete_crew",{crewId:9}));
  });
  it("показує вкладку ОС, прибирає зведений блок і розділяє майно за категоріями",async()=>{
    invoke.mockImplementation((command:string)=>command==="list_crews"?Promise.resolve([crew]):command==="list_positions"?Promise.resolve([]):command==="list_personnel"?Promise.resolve({items:[first,last],totalCount:2}):command==="list_equipment"?Promise.resolve([]):command==="list_vehicles"?Promise.resolve([]):Promise.resolve());
    render(<NotificationProvider><CrewsPage people={[first,last]}/></NotificationProvider>);
    fireEvent.click(await screen.findByText("Сокіл"));
    const editor=screen.getByRole("dialog",{name:"Сокіл"});
    expect(within(editor).getByRole("button",{name:/^ОС/})).toBeInTheDocument();
    expect(within(editor).queryByText("Склад екіпажу")).not.toBeInTheDocument();
    fireEvent.click(within(editor).getByRole("button",{name:/^Майно/}));
    const categories=within(editor).getByRole("navigation",{name:"Категорії майна екіпажу"});
    ["БпЛА та БпАК","Автомобілі","Генератори","Зв’язок","Зброя та БК"].forEach((label)=>expect(within(categories).getByRole("button",{name:new RegExp(`^${label}`)})).toBeInTheDocument());
  });
});
