import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { operationsService } from "./services/operationsService";
import { FlightPlanningPage, flightPlanTransitionHasHappened } from "./FlightPlanningPage";

const { save } = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue("/tmp/РБПАК_10.09.2026_План_польотів.xlsx") }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save }));
vi.mock("./services/operationsService", () => ({ operationsService: { listCrews: vi.fn(), listEquipment: vi.fn(), listWorkshopProducts: vi.fn().mockResolvedValue([]), exportFlightPlan: vi.fn(), syncFlightPlanLocations: vi.fn().mockResolvedValue(undefined), saveFlightPlanSnapshot: vi.fn().mockResolvedValue(undefined), getFlightPlanSnapshot: vi.fn().mockResolvedValue(null) } }));
vi.mock("../vehicles/services/vehiclesService", () => ({ vehiclesService: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("../settings/services/settingsService", () => ({ settingsService: { get: vi.fn().mockResolvedValue({ unit: { shortName:"РБПАК",fullName:"",kind:"Рота",authorizedStrength:72 } }) } }));

const crew = (callsign: string) => ({ id:1,name:"БАРС",platoon:"1 взвод",positionName:"САПСАН",reconnaissanceArea:"Охтирка",unitType:"Екіпаж",companyName:"РБПАК",battleOrder:"БРО-02",sector:"Схід",officialStrength:1,workingStrength:1,positionId:1,status:"Працюючий",uavName:"MAVIC 3",uavType:"Коптер",functionalDuties:"",currentLocation:"",notes:"",memberCount:1,members:[{personnelId:1,fullName:"ТЕСТОВИЙ Тест Тестович",rank:"капітан",position:"командир екіпажу",callsign}],actualMembers:[{personnelId:1,fullName:"ТЕСТОВИЙ Тест Тестович",rank:"капітан",position:"командир екіпажу",callsign}]});

beforeEach(()=>{vi.clearAllMocks();localStorage.clear();vi.mocked(operationsService.listEquipment).mockResolvedValue([]);vi.mocked(operationsService.getFlightPlanSnapshot).mockResolvedValue(null);vi.mocked(operationsService.exportFlightPlan).mockResolvedValue();});
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

  it("restores today's plan and its rotation stages from the database snapshot",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot).mockResolvedValue(JSON.stringify({unitName:"АРХІВ",entries:[
      {crewId:1,actualMemberIds:[1],actualCommanderId:1,actualVehicleId:null,weather:{},routePoints:["БАЗА"],areaPoints:["РАЙОН"],altitudeFrom:"100",altitudeTo:"200",task:"Розвідка",startTime:"18:01",endTime:"19:00",uavSelections:[],payloadSelection:null},
      {crewId:1,rotationId:"saved-rotation",actualMemberIds:[1],actualCommanderId:1,actualVehicleId:null,weather:{},routePoints:["НОВА ТОЧКА"],areaPoints:["РАЙОН"],altitudeFrom:"100",altitudeTo:"200",task:"Розвідка",startTime:"19:01",endTime:"18:00",uavSelections:[],payloadSelection:null},
    ]}));
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    await waitFor(()=>{const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");expect(stored.entries[1].routePoints).toEqual(["БАЗА"]);expect(stored.rotations[1][0]).toEqual(expect.objectContaining({rotationId:"saved-rotation",routePoints:["НОВА ТОЧКА"]}));});
  });

  it("opens and upgrades a legacy local plan that has none of the new fields",async()=>{
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      unitName:"СТАРИЙ ПІДРОЗДІЛ",date:"01.01.2020",selected:[1],
      entries:{1:{crewId:1,actualMemberIds:[1],routePoints:["СТАРИЙ МАРШРУТ"],startTime:"06:00",endTime:"18:00"}},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);

    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);

    await screen.findByText("БАРС",{selector:"b"});
    await waitFor(()=>{
      const stored=JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}");
      expect(stored.entries[1]).toEqual(expect.objectContaining({
        crewId:1,routePoints:["СТАРИЙ МАРШРУТ"],areaPoints:[],uavSelections:[],
        arrivesToday:false,departsToday:false,departureTime:"",
        weather:expect.objectContaining({temperature:"20",windFrom:"2"}),
      }));
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
    await waitFor(()=>expect(operationsService.syncFlightPlanLocations).toHaveBeenLastCalledWith(expect.any(String),[{crewId:1,stages:[[1,2],[1,3]],arrivesToday:false,departsToday:false}]));

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
    await waitFor(()=>expect(operationsService.syncFlightPlanLocations).toHaveBeenLastCalledWith(expect.any(String),[{crewId:1,stages:[[1,2],[1,3],[1,4]],arrivesToday:false,departsToday:false}]));

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

  it("keeps a departure before a confirmed arrival only in the local draft",async()=>{
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:todayForTest(),selected:[1],
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
      date:todayForTest(),selected:[1],entries:{1:primary},
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
      date:todayForTest(),selected:[1],entries:{1:primary},
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
    fireEvent.click(screen.getByText("Виїжджає з позиції сьогодні"));
    expect(screen.getByLabelText("Час виїзду екіпажу БАРС")).toBeInvalid();
    fireEvent.click(screen.getByRole("button",{name:"Параметри плану польотів"}));
    fireEvent.click(screen.getByRole("button",{name:"Експорт плану"}));
    expect(await screen.findByText(/Вкажіть фактичний час виїзду екіпажу/u)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Час виїзду екіпажу БАРС"),{target:{value:"21:00"}});
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").entries[1]).toEqual(expect.objectContaining({departsToday:true,departureTime:"21:00"})));
    await waitFor(()=>{
      const calls=vi.mocked(operationsService.saveFlightPlanSnapshot).mock.calls;
      expect(calls[calls.length-1]?.[1].entries[0]).toEqual(expect.objectContaining({departsToday:true,departureTime:"21:00"}));
    });
    await waitFor(()=>expect(operationsService.syncFlightPlanLocations).toHaveBeenLastCalledWith(expect.any(String),[{crewId:1,stages:[[1]],arrivesToday:false,departsToday:true}]));
  });

  it("marks today's selection as a new arrival when yesterday's same crew had departed",async()=>{
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    vi.mocked(operationsService.getFlightPlanSnapshot)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({unitName:"РБПАК",entries:[{...initialStoredEntryForTest(),crewId:1,positionId:1,endTime:"19:00",departsToday:true,departureTime:"20:00"}]}));
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    await waitFor(()=>{
      const calls=vi.mocked(operationsService.saveFlightPlanSnapshot).mock.calls;
      expect(calls[calls.length-1]?.[1].entries[0]).toEqual(expect.objectContaining({arrivesToday:true}));
    });
    await waitFor(()=>expect(operationsService.syncFlightPlanLocations).toHaveBeenLastCalledWith(expect.any(String),[expect.objectContaining({crewId:1,arrivesToday:true,departsToday:false})]));
  });

  it("does not carry a daily departure marker or the departed crew into the next plan",async()=>{
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:"01.01.2020",selected:[1],
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
    expect(screen.getByText(/позначте «Виїжджає з позиції сьогодні» та вкажіть час/u)).toBeInTheDocument();
    expect(crewSelection).toBeChecked();
    await waitFor(()=>expect(JSON.parse(localStorage.getItem("flight-plan-draft-v2")??"{}").selected).toEqual([1]));
    await waitFor(()=>expect(operationsService.syncFlightPlanLocations).toHaveBeenLastCalledWith(expect.any(String),[expect.objectContaining({crewId:1,departsToday:false})]));
    await waitFor(()=>expect(operationsService.saveFlightPlanSnapshot).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({entries:[expect.objectContaining({crewId:1})]})));
  });

  it("keeps a newly arrived crew selected after its inferred arrival time",async()=>{
    const [day,month,year]=todayForTest().split(".").map(Number);
    const now=vi.spyOn(Date,"now").mockReturnValue(new Date(year,month-1,day,12,0).getTime());
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:todayForTest(),selected:[1],entries:{1:{...initialStoredEntryForTest(),crewId:1,arrivesToday:true,startTime:"07:00",endTime:"12:00"}},rotations:{},
    }));
    vi.mocked(operationsService.listCrews).mockResolvedValue([crew("СОКІЛ")]);
    render(<NotificationProvider><FlightPlanningPage/></NotificationProvider>);
    await screen.findByText("БАРС",{selector:"b"});
    fireEvent.click(screen.getByRole("button",{name:"Розгорнути БАРС"}));
    const arrivalNote=screen.getByRole("note");
    expect(within(arrivalNote).getByText("Заїзд визначено з попереднього плану: о 07:00.")).toBeInTheDocument();
    expect(within(arrivalNote).getByText("Для нового екіпажу початок роботи є часом заїзду.")).toBeInTheDocument();
    const crewSelection=screen.getAllByRole("checkbox")[0];
    fireEvent.click(crewSelection);
    expect(await screen.findByText(/Екіпаж «БАРС» підтверджено заїхав на позицію о 07:00/u)).toBeInTheDocument();
    expect(crewSelection).toBeChecked();
    now.mockRestore();
  });

  it("allows cancelling a newly planned arrival before its inferred arrival time",async()=>{
    const [day,month,year]=todayForTest().split(".").map(Number);
    const now=vi.spyOn(Date,"now").mockReturnValue(new Date(year,month-1,day,6,59).getTime());
    localStorage.setItem("flight-plan-draft-v2",JSON.stringify({
      date:todayForTest(),selected:[1],entries:{1:{...initialStoredEntryForTest(),crewId:1,arrivesToday:true,startTime:"07:00",endTime:"12:00"}},rotations:{},
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
      date:"01.01.2020",selected:[1],entries:{1:primary},
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

describe("визначення фактичного заїзду",()=>{
  it("changes from planned to confirmed exactly at the start time",()=>{
    expect(flightPlanTransitionHasHappened("15.09.2026","07:00",new Date(2026,8,15,6,59))).toBe(false);
    expect(flightPlanTransitionHasHappened("15.09.2026","07:00",new Date(2026,8,15,7,0))).toBe(true);
  });
});
