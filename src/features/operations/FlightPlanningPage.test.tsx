import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { vehiclesService } from "../vehicles/services/vehiclesService";
import { operationsService } from "./services/operationsService";
import { FlightPlanningPage, flightPlanDateForTomorrow, flightPlanDateRange, flightPlanTransitionHasHappened } from "./FlightPlanningPage";

const { save } = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue("/tmp/РБПАК_10.09.2026_План_польотів.xlsx") }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save }));
vi.mock("./services/operationsService", () => ({ operationsService: { listCrews: vi.fn(), listPositions: vi.fn().mockResolvedValue([]), listEquipment: vi.fn(), listWorkshopProducts: vi.fn().mockResolvedValue([]), exportFlightPlan: vi.fn(), syncFlightPlanLocations: vi.fn().mockResolvedValue(undefined), saveFlightPlanSnapshot: vi.fn().mockResolvedValue(undefined), getFlightPlanSnapshot: vi.fn().mockResolvedValue(null) } }));
vi.mock("../vehicles/services/vehiclesService", () => ({ vehiclesService: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("../settings/services/settingsService", () => ({ settingsService: { get: vi.fn().mockResolvedValue({ unit: { shortName:"РБПАК",fullName:"",kind:"Рота",authorizedStrength:72 } }) } }));

const crew = (callsign: string) => ({ id:1,name:"БАРС",platoon:"1 взвод",positionName:"САПСАН",reconnaissanceArea:"Охтирка",unitType:"Екіпаж",companyName:"РБПАК",battleOrder:"БРО-02",sector:"Схід",officialStrength:1,workingStrength:1,positionId:1,status:"Працюючий",uavName:"MAVIC 3",uavType:"Коптер",functionalDuties:"",currentLocation:"",notes:"",memberCount:1,members:[{personnelId:1,fullName:"ТЕСТОВИЙ Тест Тестович",rank:"капітан",position:"командир екіпажу",callsign}],actualMembers:[{personnelId:1,fullName:"ТЕСТОВИЙ Тест Тестович",rank:"капітан",position:"командир екіпажу",callsign}]});

beforeEach(()=>{vi.clearAllMocks();localStorage.clear();vi.mocked(vehiclesService.list).mockResolvedValue([]);vi.mocked(operationsService.listPositions).mockResolvedValue([]);vi.mocked(operationsService.listEquipment).mockResolvedValue([]);vi.mocked(operationsService.getFlightPlanSnapshot).mockResolvedValue(null);vi.mocked(operationsService.saveFlightPlanSnapshot).mockResolvedValue(undefined);vi.mocked(operationsService.exportFlightPlan).mockResolvedValue();});
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
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalled());
    const snapshotCalls=vi.mocked(operationsService.saveFlightPlanSnapshot).mock.calls;
    const snapshotRequest=snapshotCalls[snapshotCalls.length-1]?.[1];
    expect(snapshotRequest?.entries[0]).toEqual(expect.objectContaining({crewName:"БАРС",crewUavType:"Коптер",memberSnapshots:[{personnelId:1,fullName:"ТЕСТОВИЙ Тест Тестович",rank:"капітан"}]}));
  });

  it("persists the vehicle-less position flag and removes the assigned vehicle from the plan",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(vehiclesService.list).mockResolvedValue([{id:9,name:"Toyota Hilux",registrationNumber:"АА 0001 АА",status:"Справний",personnelId:null,driverName:null,crewId:1,crewName:"БАРС"}]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText(/TOYOTA HILUX/u);
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));

    fireEvent.click(screen.getByRole("checkbox",{name:/Без автомобіля на позиції/u}));

    await waitFor(()=>expect(screen.queryByText(/TOYOTA HILUX/u)).not.toBeInTheDocument());
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").entries[1]).toEqual(expect.objectContaining({withoutVehicle:true,actualVehicleId:null})));
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({entries:[expect.objectContaining({withoutVehicle:true,actualVehicleId:null})]})));
  });

  it("applies the vehicle-less flag to every rotation stage of the crew",async()=>{
    const commander=crew("СОКІЛ").actualMembers[0];
    const replacement={...commander,personnelId:2,fullName:"ЗМІННИЙ Зеновій Зіновійович",position:"оператор",callsign:"ВІТЕР"};
    const officialDriver={...commander,personnelId:3,fullName:"ВОДІЙ Вадим Васильович",position:"водій",callsign:"ШЛЯХ"};
    const crewWithOfficialDriver={...crew("СОКІЛ"),members:[commander,replacement,officialDriver],actualMembers:[commander,replacement]};
    const primary={...initialStoredEntryForTest(),crewId:1,actualMemberIds:[1],actualVehicleId:9,routePoints:["БАЗА"],areaPoints:["РАЙОН"],altitudeFrom:"100",altitudeTo:"200"};
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:tomorrowForTest(),selected:[1],entries:{1:primary},
      rotations:{1:[{...primary,rotationId:"rotation-1",actualMemberIds:[2],actualCommanderId:2,actualVehicleId:10,startTime:"12:01",endTime:"18:00"}]},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crewWithOfficialDriver]);
    vi.mocked(vehiclesService.list).mockResolvedValue([
      {id:9,name:"Toyota Hilux",registrationNumber:"АА 0001 АА",status:"Справний",personnelId:null,driverName:null,crewId:1,crewName:"БАРС"},
      {id:10,name:"Ford Ranger",registrationNumber:"АА 0002 АА",status:"Справний",personnelId:null,driverName:null,crewId:1,crewName:"БАРС"},
    ]);

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    fireEvent.click(screen.getByRole("checkbox",{name:/Без автомобіля на позиції/u}));

    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.entries[1]).toEqual(expect.objectContaining({withoutVehicle:true,actualVehicleId:null}));
      expect(stored.rotations[1][0]).toEqual(expect.objectContaining({withoutVehicle:true,actualVehicleId:null}));
    });
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    fireEvent.click(screen.getByRole("button",{name:"Експорт плану"}));
    await waitFor(()=>expect(operationsService.exportFlightPlan).toHaveBeenCalled());
    const exportCalls=vi.mocked(operationsService.exportFlightPlan).mock.calls;
    const request=exportCalls[exportCalls.length-1]?.[1];
    expect(request?.entries).toHaveLength(2);
    expect(request?.entries.every((stage)=>stage.withoutVehicle===true&&stage.actualVehicleId===null)).toBe(true);
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

  it("does not allow a crew to use a position while it is under setup",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.listPositions).mockResolvedValue([{id:1,name:"САПСАН",positionType:"Облаштовується",stripName:"Схід",locality:"Охтирка",battleOrder:"БРО-02",sector:"",condition:"",conditionLevel:0,fieldType:"",size:"",mgrs:"",suitableUavText:"",isActive:false,crewId:null,crewName:"БАРС",notes:"",uavIds:[],uavNames:[]}]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);

    await screen.findByText("Позиція облаштовується");
    const checkbox=screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(screen.getByText("Позиція недоступна")).toBeInTheDocument();
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
  });

  it("excludes unavailable crew members from tomorrow's plan without changing today's BCS",async()=>{
    const available={...crew("СОКІЛ").actualMembers[0],personnelId:2,fullName:"ДОСТУПНИЙ Дмитро Дмитрович",currentLocation:"ОХ"};
    const training={...crew("СОКІЛ").actualMembers[0],personnelId:1,fullName:"НАВЧАЛЬНИЙ Назар Назарович",currentLocation:"НАВЧ"};
    vi.mocked(operationsService.listCrews).mockResolvedValue([{...crew("СОКІЛ"),members:[training,available],actualMembers:[training,available]}]);

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);

    await screen.findByText("БАРС",{selector:"b"});
    expect(screen.getByText("1 недоступні")).toBeInTheDocument();
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").entries[1].actualMemberIds).toEqual([2]));
    expect(operationsService.syncFlightPlanLocations).not.toHaveBeenCalled();
  });

  it("preserves a conflicting saved composition until the user explicitly refreshes it",async()=>{
    const blocked={...crew("СОКІЛ").actualMembers[0],personnelId:1,fullName:"НАВЧАЛЬНИЙ Назар Назарович",currentLocation:"НАВЧ"};
    const available={...crew("СОКІЛ").actualMembers[0],personnelId:2,fullName:"ДОСТУПНИЙ Дмитро Дмитрович",currentLocation:"ОХ"};
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({date:tomorrowForTest(),selected:[1],entries:{1:{...initialStoredEntryForTest(),crewId:1,actualMemberIds:[1,2],actualCommanderId:1}},rotations:{}}));
    vi.mocked(operationsService.listCrews).mockResolvedValue([{...crew("СОКІЛ"),members:[blocked,available],actualMembers:[blocked,available]}]);

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);

    await screen.findByText("БАРС",{selector:"b"});
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").entries[1].actualMemberIds).toEqual([1,2]));
    expect(operationsService.syncFlightPlanLocations).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Дані не змінено автоматично");
    fireEvent.click(screen.getByRole("button",{name:"Оновити склад етапу"}));
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").entries[1].actualMemberIds).toEqual([2]));
    expect(operationsService.syncFlightPlanLocations).not.toHaveBeenCalled();
  });

  it("restores tomorrow's plan and its rotation stages from the database snapshot",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockResolvedValue(JSON.stringify({unitName:"АРХІВ",entries:[
      {crewId:1,actualMemberIds:[1],actualCommanderId:1,actualVehicleId:null,weather:{},routePoints:["БАЗА"],areaPoints:["РАЙОН"],altitudeFrom:"100",altitudeTo:"200",task:"Розвідка",startTime:"18:01",endTime:"19:00",uavSelections:[],payloadSelection:null},
      {crewId:1,rotationId:"saved-rotation",actualMemberIds:[1],actualCommanderId:1,actualVehicleId:null,weather:{},routePoints:["НОВА ТОЧКА"],areaPoints:["РАЙОН"],altitudeFrom:"100",altitudeTo:"200",task:"Розвідка",startTime:"19:01",endTime:"18:00",uavSelections:[],payloadSelection:null},
    ]}));
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    await waitFor(()=>{const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");expect(stored.entries[1].routePoints).toEqual(["БАЗА"]);expect(stored.rotations[1][0]).toEqual(expect.objectContaining({rotationId:"saved-rotation",routePoints:["НОВА ТОЧКА"]}));});
  });

  it("loads the selected database snapshot without leaking another date's draft and preserves a deleted archived crew",async()=>{
    const tomorrowIso=isoDateForTest(1);
    const historicalIso=isoDateForTest(-2);
    const tomorrowSnapshot=JSON.stringify({unitName:"ЗАВТРА",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["МАРШРУТ ЗАВТРА"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    const historicalSnapshot=JSON.stringify({unitName:"АРХІВ",entries:[
      {...initialStoredEntryForTest(),crewId:99,routePoints:["АРХІВНИЙ МАРШРУТ"],areaPoints:["АРХІВНИЙ РАЙОН"],crewName:"ВИДАЛЕНИЙ ЕКІПАЖ",crewUavType:"Коптер",positionId:null,positionName:"",positionMgrs:"",positionLocality:"",workStrip:"",battleOrder:"",uavSnapshots:[],memberSnapshots:[{personnelId:991,fullName:"АРХІВНИЙ Артем Андрійович",rank:"солдат"}],actualMemberIds:[991],actualCommanderId:991},
      {...initialStoredEntryForTest(),crewId:1,routePoints:["ПОТОЧНИЙ ЕКІПАЖ"],areaPoints:["АРХІВНИЙ РАЙОН"],crewName:"БАРС",memberSnapshots:[]},
    ]});
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===tomorrowIso?tomorrowSnapshot:planDate===historicalIso?historicalSnapshot:null);

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);

    expect(await screen.findByText(/МАРШРУТ ЗАВТРА/u)).toBeInTheDocument();
    const dateInput=screen.getByLabelText("Дата плану");
    fireEvent.change(dateInput,{target:{value:historicalIso}});
    expect(await screen.findByText("ВИДАЛЕНИЙ ЕКІПАЖ",{selector:"b"})).toBeInTheDocument();
    expect(screen.getByText(/АРХІВНИЙ МАРШРУТ/u)).toBeInTheDocument();
    expect(vi.mocked(operationsService.saveFlightPlanSnapshot).mock.calls.filter(([planDate])=>planDate===historicalIso)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button",{name:"Розгорнути ВИДАЛЕНИЙ ЕКІПАЖ"}));
    const route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"Виправлена точка"}});fireEvent.keyDown(route,{key:"Enter"});
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledWith(historicalIso,expect.objectContaining({entries:expect.arrayContaining([
      expect.objectContaining({crewId:99,routePoints:["АРХІВНИЙ МАРШРУТ","ВИПРАВЛЕНА ТОЧКА"],positionId:null,positionName:"",positionMgrs:"",positionLocality:"",workStrip:"",battleOrder:"",uavSnapshots:[]}),
      expect.objectContaining({crewId:1,memberSnapshots:[]}),
    ])})));

    fireEvent.click(screen.getByRole("button",{name:"Завтра"}));
    expect(await screen.findByText(/МАРШРУТ ЗАВТРА/u)).toBeInTheDocument();
    expect(screen.queryByText(/АРХІВНИЙ МАРШРУТ/u)).not.toBeInTheDocument();
  });

  it("flushes the last valid change before switching to another date",async()=>{
    const tomorrowIso=isoDateForTest(1);
    const todayIso=isoDateForTest(0);
    const snapshot=JSON.stringify({unitName:"РБПАК",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["БАЗА"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    let finishSave:()=>void=()=>undefined;
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===tomorrowIso?snapshot:null);
    vi.mocked(operationsService.saveFlightPlanSnapshot).mockImplementation(()=>new Promise<void>((resolve)=>{finishSave=resolve;}));
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText(/БАЗА/u);
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    const route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"Остання зміна"}});fireEvent.keyDown(route,{key:"Enter"});
    fireEvent.click(screen.getByRole("button",{name:"Сьогодні"}));
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledWith(tomorrowIso,expect.objectContaining({entries:[expect.objectContaining({routePoints:["БАЗА","ОСТАННЯ ЗМІНА"]})]})));
    expect(screen.getByLabelText("Дата плану")).toHaveValue(tomorrowIso);
    finishSave();
    await waitFor(()=>expect(screen.getByLabelText("Дата плану")).toHaveValue(todayIso));
  });

  it("recovers a sub-debounce historical edit after unmount even when the database has an older snapshot",async()=>{
    const tomorrowIso=isoDateForTest(1);
    const historicalIso=isoDateForTest(-2);
    const tomorrowSnapshot=JSON.stringify({unitName:"ЗАВТРА",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["ЗАВТРА"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    let historicalSnapshot=JSON.stringify({unitName:"АРХІВ",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["СТАРИЙ ЗНІМОК"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===tomorrowIso?tomorrowSnapshot:planDate===historicalIso?historicalSnapshot:null);
    vi.mocked(operationsService.saveFlightPlanSnapshot).mockImplementation(async(planDate,request)=>{if(planDate===historicalIso)historicalSnapshot=JSON.stringify(request);});
    const first=render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("ЗАВТРА",{selector:"td"});
    fireEvent.change(screen.getByLabelText("Дата плану"),{target:{value:historicalIso}});
    await screen.findByText(/СТАРИЙ ЗНІМОК/u);
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    const route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"Не втратити"}});fireEvent.keyDown(route,{key:"Enter"});
    first.unmount();
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledWith(historicalIso,expect.objectContaining({entries:[expect.objectContaining({routePoints:["СТАРИЙ ЗНІМОК","НЕ ВТРАТИТИ"]})]})));

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("ЗАВТРА",{selector:"td"});
    fireEvent.change(screen.getByLabelText("Дата плану"),{target:{value:historicalIso}});
    expect(await screen.findByText(/НЕ ВТРАТИТИ/u)).toBeInTheDocument();
  });

  it("keeps a sub-debounce pending draft recoverable when the unmount flush fails",async()=>{
    const historicalIso=isoDateForTest(-2);
    const snapshot=JSON.stringify({unitName:"АРХІВ",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["СТАРИЙ ЗНІМОК"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===historicalIso?snapshot:null);
    vi.mocked(operationsService.saveFlightPlanSnapshot).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const first=render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.change(screen.getByLabelText("Дата плану"),{target:{value:historicalIso}});
    await screen.findByText(/СТАРИЙ ЗНІМОК/u);
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    const route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"Локальна правка"}});fireEvent.keyDown(route,{key:"Enter"});
    first.unmount();
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(1));
    const pending=JSON.parse(localStorage.getItem("flight-plan-draft-v2-pending-v1")??"{}");
    expect(pending[historicalIso]).toEqual(expect.objectContaining({entries:expect.objectContaining({1:expect.objectContaining({routePoints:["СТАРИЙ ЗНІМОК","ЛОКАЛЬНА ПРАВКА"]})})}));

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    expect(await screen.findByText(/ЛОКАЛЬНА ПРАВКА/u)).toBeInTheDocument();
    expect(screen.getByLabelText("Дата плану")).toHaveValue(historicalIso);
  });

  it("serializes saves and drains the newest edit after an older request finishes",async()=>{
    const tomorrowIso=isoDateForTest(1);
    const snapshot=JSON.stringify({unitName:"РБПАК",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["БАЗА"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    let finishFirst:()=>void=()=>undefined;
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===tomorrowIso?snapshot:null);
    vi.mocked(operationsService.saveFlightPlanSnapshot)
      .mockImplementationOnce(()=>new Promise<void>((resolve)=>{finishFirst=resolve;}))
      .mockResolvedValue(undefined);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText(/БАЗА/u);
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    const route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"Перша"}});fireEvent.keyDown(route,{key:"Enter"});
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(1));
    fireEvent.change(route,{target:{value:"Друга"}});fireEvent.keyDown(route,{key:"Enter"});
    await new Promise((resolve)=>window.setTimeout(resolve,420));
    expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(1);
    finishFirst();
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(2));
    expect(vi.mocked(operationsService.saveFlightPlanSnapshot).mock.calls[1]).toEqual([tomorrowIso,expect.objectContaining({entries:[expect.objectContaining({routePoints:["БАЗА","ПЕРША","ДРУГА"]})]})]);
  });

  it("keeps saves serialized across unmount and remount so an older request cannot commit last",async()=>{
    const tomorrowIso=isoDateForTest(1);
    const snapshot=JSON.stringify({unitName:"РБПАК",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["БАЗА"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    const committedRoutes:string[][]=[];
    let finishFirst:()=>void=()=>undefined;
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===tomorrowIso?snapshot:null);
    vi.mocked(operationsService.saveFlightPlanSnapshot)
      .mockImplementationOnce((_planDate,request)=>new Promise<void>((resolve)=>{finishFirst=()=>{committedRoutes.push(request.entries[0].routePoints);resolve();};}))
      .mockImplementation(async(_planDate,request)=>{committedRoutes.push(request.entries[0].routePoints);});
    const first=render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText(/БАЗА/u);
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    let route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"Стара зміна"}});fireEvent.keyDown(route,{key:"Enter"});
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    expect(await screen.findByText(/СТАРА ЗМІНА/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"Нова зміна"}});fireEvent.keyDown(route,{key:"Enter"});
    await new Promise((resolve)=>window.setTimeout(resolve,420));
    expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(1);
    finishFirst();
    await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Збережено"));
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(3));
    expect(committedRoutes[committedRoutes.length-1]).toEqual(["БАЗА","СТАРА ЗМІНА","НОВА ЗМІНА"]);
  });

  it("does not let an unmounted drain enqueue its newer stale revision behind the remounted page",async()=>{
    const tomorrowIso=isoDateForTest(1);
    const snapshot=JSON.stringify({unitName:"РБПАК",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["БАЗА"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    const committedRoutes:string[][]=[];
    let finishFirst:()=>void=()=>undefined;
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===tomorrowIso?snapshot:null);
    vi.mocked(operationsService.saveFlightPlanSnapshot)
      .mockImplementationOnce((_planDate,request)=>new Promise<void>((resolve)=>{finishFirst=()=>{committedRoutes.push(request.entries[0].routePoints);resolve();};}))
      .mockImplementation(async(_planDate,request)=>{committedRoutes.push(request.entries[0].routePoints);});

    const first=render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText(/БАЗА/u);
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    let route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"REV 1"}});fireEvent.keyDown(route,{key:"Enter"});
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(1));
    fireEvent.change(route,{target:{value:"REV 2"}});fireEvent.keyDown(route,{key:"Enter"});
    await waitFor(()=>{
      const pending=JSON.parse(localStorage.getItem("flight-plan-draft-v2-pending-v1")??"{}");
      expect(pending[tomorrowIso]).toEqual(expect.objectContaining({pendingSave:expect.objectContaining({revision:2}),entries:expect.objectContaining({1:expect.objectContaining({routePoints:["БАЗА","REV 1","REV 2"]})})}));
    });
    first.unmount();

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    expect(await screen.findByText(/REV 2/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"REV 3"}});fireEvent.keyDown(route,{key:"Enter"});
    await new Promise((resolve)=>window.setTimeout(resolve,420));
    expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(1);

    finishFirst();
    await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Збережено"));
    await new Promise((resolve)=>window.setTimeout(resolve,50));
    expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(3);
    expect(committedRoutes).toEqual([["БАЗА","REV 1"],["БАЗА","REV 1","REV 2"],["БАЗА","REV 1","REV 2","REV 3"]]);
  });

  it("recovers a main-key pending draft when its sidecar copy is missing",async()=>{
    const historicalDisplay=displayDateForTest(-2);
    const historicalIso=isoDateForTest(-2);
    const draft={schemaVersion:3,unitName:"ЛОКАЛЬНО",date:historicalDisplay,zoom:75,selected:[1],entries:{1:{...initialStoredEntryForTest(),crewId:1,routePoints:["ЛОКАЛЬНА ЗМІНА"],areaPoints:["РАЙОН"]}},rotations:{},pendingSave:{date:historicalIso,revision:4,updatedAt:456}};
    const databaseSnapshot=JSON.stringify({unitName:"АРХІВ",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["СТАРА БАЗА"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify(draft));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===historicalIso?databaseSnapshot:null);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    expect(await screen.findByText(/ЛОКАЛЬНА ЗМІНА/u)).toBeInTheDocument();
    expect(screen.getByLabelText("Дата плану")).toHaveValue(historicalIso);
    const sidecar=JSON.parse(localStorage.getItem("flight-plan-draft-v2-pending-v1")??"{}");
    expect(sidecar[historicalIso]).toEqual(expect.objectContaining({pendingSave:expect.objectContaining({revision:4}),entries:expect.objectContaining({1:expect.objectContaining({routePoints:["ЛОКАЛЬНА ЗМІНА"]})})}));
  });

  it("restores the newest pending revision when the main key is newer than its sidecar copy",async()=>{
    const historicalDisplay=displayDateForTest(-2);
    const historicalIso=isoDateForTest(-2);
    const pendingDraft=(route:string,revision:number,updatedAt:number)=>({schemaVersion:3,unitName:"ЛОКАЛЬНО",date:historicalDisplay,zoom:75,selected:[1],entries:{1:{...initialStoredEntryForTest(),crewId:1,routePoints:[route],areaPoints:["РАЙОН"]}},rotations:{},pendingSave:{date:historicalIso,revision,updatedAt}});
    const olderSidecar=pendingDraft("СТАРІША РЕЗЕРВНА КОПІЯ",4,400);
    const newerMain=pendingDraft("ОСТАННЯ ЗМІНА",5,500);
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify(newerMain));
    localStorage.setItem("flight-plan-draft-v2-pending-v1",JSON.stringify({[historicalIso]:olderSidecar}));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);

    expect(await screen.findByText(/ОСТАННЯ ЗМІНА/u)).toBeInTheDocument();
    expect(screen.queryByText(/СТАРІША РЕЗЕРВНА КОПІЯ/u)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Дата плану")).toHaveValue(historicalIso);
  });

  it("ignores out-of-range and malformed pending drafts without deleting their sidecar copies",async()=>{
    const {min}=flightPlanDateRange();
    const [year,month,day]=min.split("-").map(Number);
    const staleValue=new Date(year,month-1,day-1);
    const staleIso=`${staleValue.getFullYear()}-${String(staleValue.getMonth()+1).padStart(2,"0")}-${String(staleValue.getDate()).padStart(2,"0")}`;
    const staleDisplay=`${String(staleValue.getDate()).padStart(2,"0")}.${String(staleValue.getMonth()+1).padStart(2,"0")}.${staleValue.getFullYear()}`;
    const tomorrowIso=isoDateForTest(1);
    const staleDraft={schemaVersion:3,unitName:"СТАРИЙ",date:staleDisplay,selected:[1],entries:{1:{...initialStoredEntryForTest(),crewId:1,routePoints:["ПРОСТРОЧЕНА ЧЕРНЕТКА"],areaPoints:["РАЙОН"]}},rotations:{},pendingSave:{date:staleIso,revision:9,updatedAt:900}};
    const malformedDraft={...staleDraft,date:"99.99.2026",pendingSave:{date:"2026-99-99",revision:10,updatedAt:1000}};
    const mismatchedDraft={...staleDraft,pendingSave:{date:tomorrowIso,revision:11,updatedAt:1100}};
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify(staleDraft));
    localStorage.setItem("flight-plan-draft-v2-pending-v1",JSON.stringify({[staleIso]:staleDraft,malformed:malformedDraft,mismatched:mismatchedDraft}));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);

    await screen.findByText("БАРС",{selector:"b"});
    expect(screen.getByLabelText("Дата плану")).toHaveValue(tomorrowIso);
    expect(screen.queryByText(/ПРОСТРОЧЕНА ЧЕРНЕТКА/u)).not.toBeInTheDocument();
    const retained=JSON.parse(localStorage.getItem("flight-plan-draft-v2-pending-v1")??"{}");
    expect(retained[staleIso]).toBeDefined();
    expect(retained.malformed).toBeDefined();
    expect(retained.mismatched).toBeDefined();
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
  });

  it("keeps a pending local draft intact when loading fails",async()=>{
    const historicalDisplay=displayDateForTest(-2);
    const historicalIso=isoDateForTest(-2);
    const draft={schemaVersion:3,unitName:"ЛОКАЛЬНО",date:historicalDisplay,zoom:75,selected:[1],entries:{1:{...initialStoredEntryForTest(),crewId:1,routePoints:["НЕ ВТРАТИТИ"],areaPoints:["РАЙОН"]}},rotations:{},pendingSave:{date:historicalIso,revision:7,updatedAt:123}};
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify(draft));
    localStorage.setItem("flight-plan-draft-v2-pending-v1",JSON.stringify({[historicalIso]:draft}));
    const activeBefore=localStorage.getItem("flight-plan-draft-v2");
    const pendingBefore=localStorage.getItem("flight-plan-draft-v2-pending-v1");
    vi.mocked(operationsService.listCrews).mockRejectedValue(new Error("offline"));
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent(`План за ${historicalDisplay} не завантажено`);
    expect(localStorage.getItem("flight-plan-draft-v2")).toBe(activeBefore);
    expect(localStorage.getItem("flight-plan-draft-v2-pending-v1")).toBe(pendingBefore);
  });

  it("treats a malformed nonempty database snapshot as a load failure instead of an empty plan",async()=>{
    const tomorrowIso=isoDateForTest(1);
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===tomorrowIso?"{malformed":null);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent(/не завантажено/u);
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
    expect(screen.queryByText("БАРС",{selector:"b"})).not.toBeInTheDocument();
  });

  it("allows retrying a failed autosave without requiring another edit",async()=>{
    const tomorrowIso=isoDateForTest(1);
    const snapshot=JSON.stringify({unitName:"РБПАК",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["БАЗА"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===tomorrowIso?snapshot:null);
    vi.mocked(operationsService.saveFlightPlanSnapshot).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText(/БАЗА/u);
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    const route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"Зберегти після повтору"}});fireEvent.keyDown(route,{key:"Enter"});
    const retry=await screen.findByRole("button",{name:"Повторити збереження"});
    expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(2));
    await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Збережено"));
  });

  it("does not create a populated snapshot merely by viewing an empty date",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    await new Promise((resolve)=>window.setTimeout(resolve,420));
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    const route=screen.getByLabelText("Маршрут — населені пункти");
    fireEvent.change(route,{target:{value:"Перша зміна"}});fireEvent.keyDown(route,{key:"Enter"});
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledTimes(1));
  });

  it("blocks date switching while the active dirty plan is invalid",async()=>{
    const tomorrowIso=isoDateForTest(1);
    const snapshot=JSON.stringify({unitName:"РБПАК",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["БАЗА"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===tomorrowIso?snapshot:null);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText(/БАЗА/u);
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    fireEvent.click(screen.getByText("Виїжджає з позиції у день плану"));
    fireEvent.click(screen.getByRole("button",{name:"Сьогодні"}));
    expect(screen.getByLabelText("Дата плану")).toHaveValue(tomorrowIso);
    expect(await screen.findByText(/Спочатку виправте помилки/u)).toBeInTheDocument();
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
  });

  it("refreshes calendar bounds after midnight without reloading or replacing the active dirty plan",async()=>{
    vi.useFakeTimers({shouldAdvanceTime:true});
    try{
      vi.setSystemTime(new Date(2026,8,17,23,59,30));
      const planIso="2026-09-18";
      const snapshot=JSON.stringify({unitName:"РБПАК",entries:[{...initialStoredEntryForTest(),crewId:1,routePoints:["БАЗА"],areaPoints:["РАЙОН"],crewName:"БАРС"}]});
      vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
      vi.mocked(operationsService.getFlightPlanSnapshot).mockImplementation(async(planDate)=>planDate===planIso?snapshot:null);
      render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
      await screen.findByText(/БАЗА/u);
      const dateInput=screen.getByLabelText("Дата плану");
      expect(dateInput).toHaveValue(planIso);
      expect(dateInput).toHaveAttribute("min","2026-06-17");
      expect(dateInput).toHaveAttribute("max","2026-09-24");
      fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
      fireEvent.click(screen.getByText("Виїжджає з позиції у день плану"));
      expect(screen.getByLabelText("Час виїзду екіпажу БАРС")).toBeInvalid();
      const loadCalls=vi.mocked(operationsService.getFlightPlanSnapshot).mock.calls.length;

      await act(async()=>{
        vi.setSystemTime(new Date(2026,8,18,0,0,5));
        window.dispatchEvent(new Event("focus"));
      });

      await waitFor(()=>expect(dateInput).toHaveAttribute("min","2026-06-18"));
      expect(dateInput).toHaveAttribute("max","2026-09-25");
      expect(dateInput).toHaveValue(planIso);
      expect(screen.getByLabelText("Час виїзду екіпажу БАРС")).toBeInvalid();
      expect(operationsService.getFlightPlanSnapshot).toHaveBeenCalledTimes(loadCalls);
      expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
    }finally{
      cleanup();
      vi.useRealTimers();
    }
  });

  it("does not carry a stale legacy draft into tomorrow's operational plan",async()=>{
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      unitName:"СТАРИЙ ПІДРОЗДІЛ",date:"01.01.2020",selected:[1],
      entries:{1:{crewId:1,actualMemberIds:[1],routePoints:["СТАРИЙ МАРШРУТ"],startTime:"06:00",endTime:"18:00"}},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);

    await screen.findByText("БАРС",{selector:"b"});
    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.date).toBe(tomorrowForTest());
      expect(stored.entries[1]).toEqual(expect.objectContaining({crewId:1,routePoints:[]}));
    });
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

    const firstRotationToggle=screen.getByRole("button",{name:"Розгорнути ротацію 1 екіпажу БАРС"});
    const firstRotationCard=firstRotationToggle.closest("article");
    expect(firstRotationCard).not.toBeNull();
    fireEvent.click(firstRotationToggle);
    fireEvent.change(within(firstRotationCard as HTMLElement).getByLabelText("Закінчення роботи"),{target:{value:"22:00"}});
    fireEvent.click(screen.getByRole("button",{name:"Провести ротацію"}));
    const secondDialog=screen.getByRole("dialog",{name:/Ротація екіпажу/u});
    expect(within(secondDialog).getAllByText("Зараз на позиції",{selector:"em"})).toHaveLength(2);
    fireEvent.click(within(secondDialog).getByText("ТРЕТІЙ Тарас Тарасович"));
    fireEvent.click(within(secondDialog).getByText("ЧЕТВЕРТИЙ Іван Іванович"));
    fireEvent.click(within(secondDialog).getByRole("button",{name:"Провести ротацію"}));
    expect(await screen.findByText("БАРС · після ротації 2")).toBeInTheDocument();
    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.rotations[1]).toHaveLength(2);
      expect(stored.rotations[1][0].actualMemberIds).toEqual([1,3]);
      expect(stored.rotations[1][1].actualMemberIds).toEqual([1,4]);
    });

    fireEvent.click(screen.getByRole("button",{name:"Редагувати склад ротації 1 екіпажу БАРС"}));
    const editDialog=screen.getByRole("dialog",{name:/Ротація екіпажу/u});
    fireEvent.click(within(editDialog).getByText("ТРЕТІЙ Тарас Тарасович"));
    fireEvent.click(within(editDialog).getByText("ЧЕТВЕРТИЙ Іван Іванович"));
    expect(within(editDialog).getByText("Склад не може збігатися з наступним етапом ротації.")).toBeInTheDocument();
    expect(within(editDialog).getByRole("button",{name:"Зберегти склад"})).toBeDisabled();
    fireEvent.click(within(editDialog).getByText("ТРЕТІЙ Тарас Тарасович"));
    fireEvent.click(within(editDialog).getByRole("button",{name:"Зберегти склад"}));
    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.rotations[1]).toHaveLength(2);
      expect(stored.rotations[1][0].actualMemberIds).toEqual([1,4,3]);
      expect(stored.rotations[1][1].actualMemberIds).toEqual([1,4]);
    });

    const secondRotationToggle=screen.getByRole("button",{name:"Розгорнути ротацію 2 екіпажу БАРС"});
    const secondRotationCard=secondRotationToggle.closest("article");
    expect(secondRotationCard).not.toBeNull();
    fireEvent.click(secondRotationToggle);
    fireEvent.change(within(secondRotationCard as HTMLElement).getByLabelText("Початок роботи"),{target:{value:"21:01"}});
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").rotations[1][1].startTime).toBe("21:01"));
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    fireEvent.click(screen.getByRole("button",{name:"Експорт плану"}));
    expect(await screen.findByText(/Ротація 2: початок має бути о 22:01/u)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("replaces individual personnel in one plan row and stores separate exit and entry times",async()=>{
    const people=[
      {personnelId:1,fullName:"ПЕРШИЙ Петро Петрович",rank:"сержант",position:"командир екіпажу",callsign:"СОКІЛ",currentLocation:"На позиції"},
      {personnelId:2,fullName:"ДРУГИЙ Дмитро Дмитрович",rank:"молодший сержант",position:"оператор",callsign:"ЛИС",currentLocation:"ОХ"},
      {personnelId:3,fullName:"ТРЕТІЙ Тарас Тарасович",rank:"солдат",position:"технік",callsign:"КРУК",currentLocation:"ОХ"},
      {personnelId:4,fullName:"ЧЕТВЕРТИЙ Четвер Четвертович",rank:"солдат",position:"оператор",callsign:"ВОВК",currentLocation:"На позиції"},
      {personnelId:5,fullName:"ПʼЯТИЙ Павло Петрович",rank:"солдат",position:"оператор",callsign:"БОРСУК",currentLocation:"ПБЗ"},
      {personnelId:6,fullName:"ШОСТИЙ Семен Сергійович",rank:"солдат",position:"оператор",callsign:"РИСЬ",currentLocation:"ГШР"},
      {personnelId:7,fullName:"СЬОМИЙ Степан Степанович",rank:"солдат",position:"водій",callsign:"ЯСТРУБ",currentLocation:"Логістика на позиції"},
    ];
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:tomorrowForTest(),selected:[1],entries:{1:{...initialStoredEntryForTest(),crewId:1,actualMemberIds:[1],actualCommanderId:1,routePoints:["БАЗА"],areaPoints:["РАЙОН"],altitudeFrom:"100",altitudeTo:"200"}},rotations:{},personnelTransitions:[],
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([{...crew("СОКІЛ"),officialStrength:4,workingStrength:4,members:people,actualMembers:people}]);

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    fireEvent.click(screen.getByRole("button",{name:"Завести/Вивести ОС"}));
    const dialog=screen.getByRole("dialog",{name:/Завести\/Вивести ОС/u});
    expect(within(dialog).queryByText("ЧЕТВЕРТИЙ Четвер Четвертович")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("ПʼЯТИЙ Павло Петрович")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("ШОСТИЙ Семен Сергійович")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("СЬОМИЙ Степан Степанович")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("ПЕРШИЙ Петро Петрович"));
    fireEvent.change(within(dialog).getByLabelText("Час виведення ОС"),{target:{value:"19:00"}});
    fireEvent.click(within(dialog).getByText("ДРУГИЙ Дмитро Дмитрович"));
    fireEvent.click(within(dialog).getByText("ТРЕТІЙ Тарас Тарасович"));
    fireEvent.change(within(dialog).getByLabelText("Час заведення ОС"),{target:{value:"20:00"}});
    fireEvent.click(within(dialog).getByRole("button",{name:"Зберегти зміну ОС"}));

    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.entries[1].actualMemberIds).toEqual([2,3]);
      expect(stored.rotations).toEqual({});
      expect(stored.personnelTransitions).toEqual([expect.objectContaining({crewId:1,outgoingMemberIds:[1],outgoingTime:"19:00",incomingMemberIds:[2,3],incomingTime:"20:00"})]);
    });
    await waitFor(()=>{
      const calls=vi.mocked(operationsService.saveFlightPlanSnapshot).mock.calls;
      const request=calls[calls.length-1]?.[1];
      expect(request?.entries).toHaveLength(1);
      expect(request?.entries[0].actualMemberIds).toEqual([2,3]);
      expect(request?.personnelTransitions).toEqual([expect.objectContaining({outgoingTime:"19:00",incomingTime:"20:00"})]);
    });

    fireEvent.click(screen.getByRole("button",{name:"Видалити зміну ОС 1 екіпажу БАРС"}));
    fireEvent.click(within(screen.getByRole("dialog",{name:"Видалити останню зміну ОС?"})).getByRole("button",{name:"Видалити зміну"}));
    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.entries[1].actualMemberIds).toEqual([1]);
      expect(stored.personnelTransitions).toEqual([]);
    });
  });

  it("keeps a departure before a confirmed arrival only in the local draft",async()=>{
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:tomorrowForTest(),selected:[1],
      entries:{1:{...initialStoredEntryForTest(),crewId:1,arrivesToday:true,departsToday:true,departureTime:"06:30",startTime:"07:00",endTime:"12:00"}},
      rotations:{},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    expect(screen.getByText("Час виїзду має бути пізніше за час заїзду о 07:00.")).toBeInTheDocument();
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").entries[1]).toEqual(expect.objectContaining({arrivesToday:true,departsToday:true,departureTime:"06:30"})));
    expect(operationsService.syncFlightPlanLocations).not.toHaveBeenCalled();
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    fireEvent.click(screen.getByRole("button",{name:"Експорт плану"}));
    expect(await screen.findByText(/Екіпаж «БАРС»: Час виїзду має бути пізніше за час заїзду/u)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("blocks a departure after the latest rotation starts but before its work ends",async()=>{
    const primary={...initialStoredEntryForTest(),crewId:1,departsToday:true,departureTime:"22:30",startTime:"05:00",endTime:"21:00"};
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:tomorrowForTest(),selected:[1],entries:{1:primary},
      rotations:{1:[{...primary,rotationId:"late",actualMemberIds:[2],startTime:"21:01",endTime:"23:00",departsToday:false,departureTime:""}]},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    expect(screen.getByText("Час виїзду не може бути раніше завершення останнього етапу роботи о 23:00.")).toBeInTheDocument();
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").entries[1].departureTime).toBe("22:30"));
    expect(operationsService.syncFlightPlanLocations).not.toHaveBeenCalled();
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    fireEvent.click(screen.getByRole("button",{name:"Експорт плану"}));
    expect(await screen.findByText(/Екіпаж «БАРС»: Час виїзду не може бути раніше завершення останнього етапу роботи/u)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("blocks a rotation that does not start one minute after the previous stage",async()=>{
    const primary={...initialStoredEntryForTest(),crewId:1,startTime:"05:00",endTime:"19:00"};
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:tomorrowForTest(),selected:[1],entries:{1:primary},
      rotations:{1:[{...primary,rotationId:"gap",actualMemberIds:[2],startTime:"19:05",endTime:"22:00"}]},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").rotations[1][0].startTime).toBe("19:05"));
    expect(operationsService.syncFlightPlanLocations).not.toHaveBeenCalled();
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    fireEvent.click(screen.getByRole("button",{name:"Експорт плану"}));
    expect(await screen.findByText(/Екіпаж «БАРС»: Ротація 1: початок має бути о 19:01/u)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("stores an explicit departure time and blocks export while that time is empty",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    fireEvent.click(screen.getByText("Виїжджає з позиції у день плану"));
    expect(screen.getByLabelText("Час виїзду екіпажу БАРС")).toBeInvalid();
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    fireEvent.click(screen.getByRole("button",{name:"Експорт плану"}));
    expect(await screen.findByText(/Вкажіть плановий час виїзду екіпажу/u)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Час виїзду екіпажу БАРС"),{target:{value:"21:00"}});
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").entries[1]).toEqual(expect.objectContaining({departsToday:true,departureTime:"21:00"})));
    await waitFor(()=>{
      const calls=vi.mocked(operationsService.saveFlightPlanSnapshot).mock.calls;
      expect(calls[calls.length-1]?.[1].entries[0]).toEqual(expect.objectContaining({departsToday:true,departureTime:"21:00"}));
    });
    expect(operationsService.syncFlightPlanLocations).not.toHaveBeenCalled();
  });

  it("marks tomorrow's selection as a new arrival when today's same crew departs",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({unitName:"РБПАК",entries:[{...initialStoredEntryForTest(),crewId:1,positionId:1,endTime:"19:00",departsToday:true,departureTime:"20:00"}]}));
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.entries[1]).toEqual(expect.objectContaining({arrivesToday:true}));
    });
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
    expect(operationsService.syncFlightPlanLocations).not.toHaveBeenCalled();
  });

  it("does not carry a daily departure marker or the departed crew into the next plan",async()=>{
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:todayForTest(),selected:[1],
      entries:{1:{...initialStoredEntryForTest(),crewId:1,departsToday:true,departureTime:"16:30"}},
      rotations:{},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.selected).toEqual([]);
      expect(stored.entries[1]).toEqual(expect.objectContaining({departsToday:false,departureTime:""}));
    });
    await new Promise((resolve)=>window.setTimeout(resolve,420));
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
  });

  it("keeps a crew confirmed by yesterday's snapshot selected until an explicit departure",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot)
      .mockResolvedValueOnce(JSON.stringify({unitName:"РБПАК",entries:[]}))
      .mockResolvedValueOnce(JSON.stringify({unitName:"РБПАК",entries:[{...initialStoredEntryForTest(),crewId:1,positionId:1,departsToday:false}]}));
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    const crewSelection=screen.getAllByRole("checkbox")[0];
    expect(crewSelection).toBeChecked();
    fireEvent.click(crewSelection);
    expect(await screen.findByText(/Екіпаж «БАРС» підтверджено перебуває на позиції за попереднім планом/u)).toBeInTheDocument();
    expect(screen.getByText(/позначте «Виїжджає з позиції у день плану» та вкажіть час/u)).toBeInTheDocument();
    expect(crewSelection).toBeChecked();
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").selected).toEqual([1]));
    expect(operationsService.syncFlightPlanLocations).not.toHaveBeenCalled();
    expect(operationsService.saveFlightPlanSnapshot).not.toHaveBeenCalled();
  });

  it("keeps a newly arrived crew selected after its inferred arrival time",async()=>{
    const [day,month,year]=tomorrowForTest().split(".").map(Number);
    const now=vi.spyOn(Date,"now").mockReturnValue(new Date(year,month-1,day,12,0).getTime());
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:tomorrowForTest(),selected:[1],entries:{1:{...initialStoredEntryForTest(),crewId:1,arrivesToday:true,startTime:"07:00",endTime:"12:00"}},rotations:{},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    const arrivalNote=screen.getByRole("note");
    expect(within(arrivalNote).getByText("Заїзд у день плану визначено з попереднього плану: о 07:00.")).toBeInTheDocument();
    expect(within(arrivalNote).getByText("Для нового екіпажу початок роботи є плановим часом заїзду.")).toBeInTheDocument();
    const crewSelection=screen.getAllByRole("checkbox")[0];
    fireEvent.click(crewSelection);
    expect(await screen.findByText(/Екіпаж «БАРС» підтверджено заїхав на позицію о 07:00/u)).toBeInTheDocument();
    expect(crewSelection).toBeChecked();
    now.mockRestore();
  });

  it("allows cancelling a newly planned arrival before its inferred arrival time",async()=>{
    const [day,month,year]=tomorrowForTest().split(".").map(Number);
    const now=vi.spyOn(Date,"now").mockReturnValue(new Date(year,month-1,day,6,59).getTime());
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:tomorrowForTest(),selected:[1],entries:{1:{...initialStoredEntryForTest(),crewId:1,arrivesToday:true,startTime:"07:00",endTime:"12:00"}},rotations:{},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").selected).toEqual([]));
    expect(screen.queryByText(/Щоб вивести його, позначте/u)).not.toBeInTheDocument();
    now.mockRestore();
  });

  it("does not roll an invalid departure or rotation into the next day",async()=>{
    const primary={...initialStoredEntryForTest(),crewId:1,routePoints:["ПОПЕРЕДНЯ"],departsToday:true,departureTime:"11:00",startTime:"07:00",endTime:"12:00"};
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:todayForTest(),selected:[1],entries:{1:primary},
      rotations:{1:[{...primary,rotationId:"invalid-gap",actualMemberIds:[2],routePoints:["НЕВАЛІДНА РОТАЦІЯ"],startTime:"12:30",endTime:"16:00",departsToday:false,departureTime:""}]},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.selected).toEqual([1]);
      expect(stored.entries[1]).toEqual(expect.objectContaining({routePoints:["ПОПЕРЕДНЯ"],departsToday:false,departureTime:""}));
      expect(stored.rotations).toEqual({});
    });
  });
});

function initialStoredEntryForTest(){
  return {actualMemberIds:[1],actualCommanderId:1,actualVehicleId:null,weather:{temperature:"",windFrom:"",windTo:"",gustFrom:"",gustTo:"",cloudiness:"",cloudHeight:"",precipitation:""},routePoints:[],altitudeFrom:"",altitudeTo:"",areaPoints:[],task:"Розвідка",startTime:"07:00",endTime:"12:00",uavSelections:[],payloadSelection:null};
}

function todayForTest(){
  const value=new Date();
  return `${String(value.getDate()).padStart(2,"0")}.${String(value.getMonth()+1).padStart(2,"0")}.${value.getFullYear()}`;
}

function tomorrowForTest(){
  const value=new Date();
  return flightPlanDateForTomorrow(value);
}

describe("визначення фактичного заїзду",()=>{
  it("sets the execution date to tomorrow across month and year boundaries",()=>{
    expect(flightPlanDateForTomorrow(new Date(2026,0,31,23,59))).toBe("01.02.2026");
    expect(flightPlanDateForTomorrow(new Date(2026,11,31,23,59))).toBe("01.01.2027");
  });
  it("limits selectable snapshots to three calendar months back and seven days ahead",()=>{
    expect(flightPlanDateRange(new Date(2026,4,31,23,59))).toEqual({min:"2026-02-28",max:"2026-06-07"});
  });
  it("changes from planned to confirmed exactly at the start time",()=>{
    expect(flightPlanTransitionHasHappened("15.09.2026","07:00",new Date(2026,8,15,6,59))).toBe(false);
    expect(flightPlanTransitionHasHappened("15.09.2026","07:00",new Date(2026,8,15,7,0))).toBe(true);
  });
});

function isoDateForTest(dayOffset:number){
  const value=new Date();
  value.setDate(value.getDate()+dayOffset);
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
}

function displayDateForTest(dayOffset:number){
  const value=new Date();
  value.setDate(value.getDate()+dayOffset);
  return `${String(value.getDate()).padStart(2,"0")}.${String(value.getMonth()+1).padStart(2,"0")}.${value.getFullYear()}`;
}
