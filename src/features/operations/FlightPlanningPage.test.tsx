import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { operationsService } from "./services/operationsService";
import { FlightPlanningPage } from "./FlightPlanningPage";

const { save } = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue("/tmp/РБПАК_10.09.2026_План_польотів.xlsx") }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save }));
vi.mock("./services/operationsService", () => ({ operationsService: { listCrews: vi.fn(), listEquipment: vi.fn(), exportFlightPlan: vi.fn() } }));
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
});
