import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles.css";
import "../../src/layout-fixes.css";
import { BcsTable } from "../../src/features/operations/BcsTable";
import { StaffTransferModal } from "../../src/features/operations/StaffTransferModal";
import { buildStaffSlots } from "../../src/features/operations/staffing-slots";
import { temporaryStaffingRecord } from "../../src/features/operations/bcs-model";

const people = Array.from({length: 7}, (_, i) => ({
  personnelId:i+1, fullName:`ТЕСТОВИЙ ${i+1} Іван Іванович`,rank:"молодший сержант",
  position:i === 0 ? "командир роти" : `водій-електрик ${i % 3 + 1} відділення ${i < 4 ? 1 : 2} взводу роти тестового підрозділу військової частини А0000`,
  crewId:i<4?1:null,crewName:i<4?"Тестова підгрупа":null,platoon:"",companyName:"",unitType:"Екіпаж",
  crewPositionName:"Тестове значення",battleOrder:"",sector:"",officialStrength:4,actualStrength:4,workingStrength:2,
  crewStatus:"Формується",uavName:"Тестовий тип",uavType:"",functionalDuties:"Тестові обов’язки",
  currentLocation:"УПР",bcsStatus:"",notes:"Тестові дані, не реальні люди",actingPosition:"",recommendationCount:0,
}));
const arrival=temporaryStaffingRecord({id:1,fullName:"ТИМЧАСОВИЙ Тест Тестович",rank:"солдат",duties:"Тест",arrivedAt:"2026-09-06",currentLocation:"УПР",notes:"",category:"Тимчасово прибулі",groupName:""});
function Preview() {
  const [show,setShow]=useState(false);
  return <main style={{padding:24,width:"100%",height:"100vh",overflow:"auto"}}><header style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h1>БЧС · тестові дані</h1><button className="button primary" onClick={()=>setShow(true)}>Переміщення</button></header><BcsTable records={[...people,arrival]} authorized={50} zoom={70} onSave={async()=>{}} />{show&&<StaffTransferModal records={people} slots={buildStaffSlots(people,{kind:"Рота",shortName:"Тест",authorizedStrength:50})} onClose={()=>setShow(false)} onSave={async()=>setShow(false)} />}</main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
