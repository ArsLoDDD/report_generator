import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { operationsService } from "./services/operationsService";
import { FlightPlanningPage } from "./FlightPlanningPage";

const { save } = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue("/tmp/РБПАК_10.09.2026_План_польотів.xlsx") }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save }));
vi.mock("./services/operationsService", () => ({ operationsService: { listCrews: vi.fn(), listEquipment: vi.fn(), listWorkshopProducts: vi.fn().mockResolvedValue([]), exportFlightPlan: vi.fn(), syncFlightPlanLocations: vi.fn().mockResolvedValue(undefined), saveFlightPlanSnapshot: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("../vehicles/services/vehiclesService", () => ({ vehiclesService: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("../settings/services/settingsService", () => ({ settingsService: { get: vi.fn().mockResolvedValue({ unit: { shortName:"РБПАК",fullName:"",kind:"Рота",authorizedStrength:72 } }) } }));

const crew = (callsign: string) => ({ id:1,name:"БАРС",platoon:"1 взвод",positionName:"САПСАН",reconnaissanceArea:"Охтирка",unitType:"Екіпаж",companyName:"РБПАК",battleOrder:"БРО-02",sector:"Схід",officialStrength:1,workingStrength:1,positionId:1,status:"Працюючий",uavName:"MAVIC 3",uavType:"Коптер",functionalDuties:"",currentLocation:"",notes:"",memberCount:1,members:[{personnelId:1,fullName:"ТЕСТОВИЙ Тест Тестович",rank:"капітан",position:"командир екіпажу",callsign}],actualMembers:[{personnelId:1,fullName:"ТЕСТОВИЙ Тест Тестович",rank:"капітан",position:"командир екіпажу",callsign}]});

beforeEach(()=>{vi.clearAllMocks();localStorage.clear();vi.mocked(operationsService.listEquipment).mockResolvedValue([]);vi.mocked(operationsService.exportFlightPlan).mockResolvedValue();});
afterEach(cleanup);

describe("Планування польотів",()=>{
  it("forms an export request from the working crew and manual route",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    const route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"Охтирка"}});fireEvent.keyDown(route,{key:"Enter"});
    fireEvent.change(route,{target:{value:"Тростянець"}});fireEvent.keyDown(route,{key:"Enter"});
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").entries[1].routePoints).toEqual(["ОХТИРКА","ТРОСТЯНЕЦЬ"]));
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    fireEvent.click(screen.getByRole("button",{name:"Експорт плану"}));
    await waitFor(()=>expect(operationsService.exportFlightPlan).toHaveBeenCalled());
    expect(vi.mocked(operationsService.exportFlightPlan).mock.calls[0][1].entries[0].routePoints).toEqual(["ОХТИРКА","ТРОСТЯНЕЦЬ"]);
  });

  it("shows and enforces a warning when an official crew member has no callsign",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText(/немає позивн/iu,{selector:"span"});
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    fireEvent.click(screen.getByRole("button",{name:"Експорт плану"}));
    expect(save).not.toHaveBeenCalled();
    expect(operationsService.exportFlightPlan).not.toHaveBeenCalled();
  });

  it("does not block export because of an unselected crew without callsigns",async()=>{
    const unselected={...crew(""),id:2,name:"ВІТЕР",status:"Не активний",members:crew("").members.map((member)=>({...member,personnelId:2})),actualMembers:crew("").actualMembers.map((member)=>({...member,personnelId:2}))};
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ"),unselected]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС");
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    const route=screen.getByLabelText("Маршрут — населені пункти");fireEvent.change(route,{target:{value:"Охтирка"}});fireEvent.keyDown(route,{key:"Enter"});
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    fireEvent.click(screen.getByRole("button",{name:"Експорт плану"}));
    await waitFor(()=>expect(operationsService.exportFlightPlan).toHaveBeenCalled());
    expect(vi.mocked(operationsService.exportFlightPlan).mock.calls[0][1].entries).toHaveLength(1);
  });

  it("shows only working crews and uses a 75 percent default scale",async()=>{
    const inactive={...crew("СОВА"),id:2,name:"РЕЗЕРВ",status:"Не активний"};
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ"),inactive]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    expect(screen.getByText("Масштаб таблиці · 75%")).toBeInTheDocument();
    expect(await screen.findByText("БАРС",{selector:"b"})).toBeInTheDocument();
    expect(screen.queryByText("РЕЗЕРВ")).not.toBeInTheDocument();
  });

  it("creates a separately editable rotation stage and limits the commander to the selected people",async()=>{
    const people=[
      {personnelId:1,fullName:"ПЕРШИЙ Петро Петрович",rank:"капітан",position:"командир екіпажу",callsign:"СОКІЛ"},
      {personnelId:2,fullName:"ДРУГИЙ Дмитро Дмитрович",rank:"солдат",position:"оператор",callsign:"ЛИС"},
      {personnelId:3,fullName:"ТРЕТІЙ Тарас Тарасович",rank:"солдат",position:"оператор",callsign:"КРУК"},
      {personnelId:4,fullName:"ЧЕТВЕРТИЙ Іван Іванович",rank:"солдат",position:"технік",callsign:"СИЧ"},
    ];
    vi.mocked(operationsService.listCrews).mockResolvedValue([{...crew("СОКІЛ"),officialStrength:4,workingStrength:2,members:people,actualMembers:people.slice(0,2)}]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    fireEvent.click(screen.getByRole("button",{name:"Провести ротацію"}));
    const dialog=screen.getByRole("dialog",{name:/Ротація екіпажу/u});
    const memberChecks=within(dialog).getAllByRole("checkbox");
    expect(memberChecks.filter((checkbox)=>(checkbox as HTMLInputElement).checked)).toHaveLength(2);
    expect(within(dialog).getByText(/Щоб провести ротацію, змініть склад екіпажу/u)).toBeInTheDocument();
    expect(within(dialog).getByRole("button",{name:"Провести ротацію"})).toBeDisabled();
    fireEvent.click(within(dialog).getByText("ДРУГИЙ Дмитро Дмитрович"));
    fireEvent.click(within(dialog).getByText("ТРЕТІЙ Тарас Тарасович"));
    expect(within(dialog).getByRole("button",{name:"Провести ротацію"})).toBeEnabled();
    const commander=within(dialog).getByLabelText("Фактичний командир після ротації");
    expect(within(commander).queryByText("ДРУГИЙ Дмитро Дмитрович · ЛИС")).not.toBeInTheDocument();
    expect(within(commander).getByText("ТРЕТІЙ Тарас Тарасович · КРУК")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button",{name:"Провести ротацію"}));
    expect(await screen.findByText("БАРС · після ротації 1")).toBeInTheDocument();
    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.rotations[1][0].actualMemberIds).toEqual([1,3]);
      expect(stored.rotations[1][0].actualCommanderId).toBe(1);
    });
    await waitFor(()=>expect(operationsService.syncFlightPlanLocations).toHaveBeenLastCalledWith(expect.any(String),[{crewId:1,stages:[[1,2],[1,3]]}]));
  });
});
