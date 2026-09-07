import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("./", import.meta.url));
const outputPath = `${directory}test-excel-base-rbak.xlsx`;
const displayPath = `${directory}Тестова Excel-база РБАК.xlsx`;
const wb = Workbook.create();

const labels = {
  rank: "Звання", surname: "Прізвище", given_name: "Ім’я", patronymic: "По батькові", position: "Посада", tax_id: "ІПН", birth_date: "Дата народження", phone: "Телефон", email: "Електронна пошта", education_level: "Освіта", military_id: "Військовий квиток", gender: "Стать", service_type: "Вид служби", service_start_date: "Дата початку служби", military_fitness: "Придатність", blood_type: "Група крові", marital_status: "Сімейний стан", position_assigned_date: "Дата призначення", position_assignment_order: "Наказ про призначення", driver_license: "Посвідчення водія", driver_license_categories: "Категорії", driver_license_valid_until: "Дійсне до",
  name: "Назва", registration_number: "Державний номер", status: "Статус", driver_tax_id: "ІПН водія", driver_full_name: "ПІБ водія", crew_name: "Екіпаж", unit_type: "Підрозділ по типу", company_name: "Рота / окремий взвод", platoon: "Взвод", position_name: "Позиція", reconnaissance_area: "Район розвідки", battle_order: "БРО", sector: "Сектор роботи", official_strength: "Кількість в/с за штатом", working_strength: "Кількість в/с працює", uav_name: "Назва БпАК", uav_type: "Тип БпАК", functional_duties: "Функціональні обов’язки", current_location: "Де знаходиться", notes: "Примітка", position_type: "Тип позиції", strip_name: "Смуга", locality: "Район населеного пункту", condition: "Стан", condition_level: "Стан, %", field_type: "Тип поля", size: "Розмір", mgrs: "Орієнтовні координати MGRS", suitable_uav_text: "Під які БпЛА підходить", is_active: "Активна", personnel_tax_id: "ІПН військовослужбовця", personnel_full_name: "ПІБ військовослужбовця", holder_tax_id: "ІПН відповідального", holder_full_name: "ПІБ відповідального", inventory_number: "Інвентарний номер", incident_type: "Тип інциденту", occurred_at: "Дата та час", equipment_category: "Категорія майна", equipment_inventory_number: "Інвентарний номер майна", equipment_name: "Назва майна", description: "Опис", slot_id: "ID штатної посади", acting_slot_id: "ID посади ТВО", acting_position: "ТВО", full_name: "ПІБ", category: "Категорія", group_name: "Підгрупа", duties: "Функціональні обов’язки", arrived_at: "Дата прибуття", issued_at: "Дата видачі",
};

function columnName(index) { let value = index + 1; let result = ""; while (value) { const digit = (value - 1) % 26; result = String.fromCharCode(65 + digit) + result; value = Math.floor((value - 1) / 26); } return result; }
function addSheet(name, keys, rows, widths = {}) {
  const sheet = wb.worksheets.add(name);
  sheet.showGridLines = false;
  const table = [[...keys.map((key) => labels[key] ?? key)], keys, ...rows.map((row) => keys.map((key) => row[key] ?? ""))];
  const range = sheet.getRangeByIndexes(0, 0, table.length, keys.length);
  range.values = table;
  sheet.getRange(`A1:${columnName(keys.length - 1)}1`).format = { fill: "#183B4B", font: { bold: true, color: "#FFFFFF", name: "Arial", size: 10 }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, borders: { preset: "all", style: "thin", color: "#6E8793" } };
  sheet.getRange(`A2:${columnName(keys.length - 1)}2`).format = { fill: "#DCEAF0", font: { italic: true, color: "#49616D", name: "Arial", size: 9 }, horizontalAlignment: "center", verticalAlignment: "center", borders: { preset: "all", style: "thin", color: "#A6BBC4" } };
  if (rows.length) sheet.getRange(`A3:${columnName(keys.length - 1)}${rows.length + 2}`).format = { font: { name: "Arial", size: 10, color: "#111111" }, verticalAlignment: "center", borders: { preset: "insideHorizontal", style: "thin", color: "#D6E0E4" } };
  sheet.getRange(`A1:${columnName(keys.length - 1)}1`).format.rowHeight = 34;
  sheet.getRange(`A2:${columnName(keys.length - 1)}2`).format.rowHeight = 20;
  keys.forEach((key, index) => { const col = sheet.getRange(`${columnName(index)}:${columnName(index)}`); col.format.columnWidth = widths[key] ?? (/(position|notes|duties|description)/.test(key) ? 34 : /(full_name|name|company_name)/.test(key) ? 24 : 16); });
  sheet.freezePanes.freezeRows(2);
  return sheet;
}

const people = [
  ["капітан","КОВАЛЬ","Андрій","Миколайович","командир роти безпілотних авіаційних комплексів військової частини А0000","3000000001"],
  ["старший лейтенант","МЕЛЬНИК","Олена","Ігорівна","заступник командира роти безпілотних авіаційних комплексів військової частини А0000","3000000002"],
  ["лейтенант","ТКАЧЕНКО","Роман","Петрович","заступник командира роти з психологічної підтримки персоналу безпілотних авіаційних комплексів військової частини А0000","3000000003"],
  ["головний сержант","ШЕВЧУК","Дмитро","Олександрович","головний сержант роти безпілотних авіаційних комплексів військової частини А0000","3000000004"],
  ["штаб-сержант","БОЙКО","Максим","Васильович","старший технік роти безпілотних авіаційних комплексів військової частини А0000","3000000005"],
  ["штаб-сержант","ГРИЦЕНКО","Сергій","Іванович","технік роти безпілотних авіаційних комплексів військової частини А0000","3000000006"],
  ["сержант","ЛИСЕНКО","Марія","Олегівна","сержант із матеріального забезпечення роти безпілотних авіаційних комплексів військової частини А0000","3000000007"],
  ["сержант","МАРЧЕНКО","Віталій","Сергійович","старший бойовий медик роти безпілотних авіаційних комплексів військової частини А0000","3000000008"],
  ["солдат","ПОЛІЩУК","Ілля","Романович","водій роти безпілотних авіаційних комплексів військової частини А0000","3000000009"],
  ["молодший лейтенант","САВЧЕНКО","Олег","Володимирович","командир 1 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000010"],
  ["головний сержант","ДЕНИСЕНКО","Павло","Андрійович","головний сержант — командир 1 відділення 1 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000011"],
  ["солдат","ЧЕРНЕНКО","Артем","Юрійович","оператор 1 відділення 1 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000012"],
  ["солдат","КРАВЕЦЬ","Данило","Максимович","механік 1 відділення 1 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000013"],
  ["солдат","ОСТАПЕНКО","Богдан","Ігорович","водій-електрик 1 відділення 1 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000014"],
  ["сержант","РУДЕНКО","Юлія","Вікторівна","командир відділення 2 відділення 1 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000015"],
  ["солдат","БІЛАН","Тарас","Михайлович","оператор 2 відділення 1 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000016"],
  ["молодший лейтенант","ГОНЧАР","Владислав","Ігорович","командир 2 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000017"],
  ["головний сержант","ПАВЛЕНКО","Іван","Олексійович","головний сержант — командир 1 відділення 2 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000018"],
  ["солдат","КЛИМЕНКО","Максим","Дмитрович","оператор 1 відділення 2 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000019"],
  ["солдат","ЯРЕМЧУК","Назар","Петрович","механік 1 відділення 2 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000020"],
  ["молодший лейтенант","КОЗАК","Валерія","Олександрівна","командир 4 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000021"],
  ["сержант","СТРУК","Володимир","Володимирович","оператор відділення збору та обробки інформації роти безпілотних авіаційних комплексів військової частини А0000","3000000022"],
  ["солдат","БОНДАР","Аліна","Сергіївна","дешифрувальник розвідувальних матеріалів з безпілотних літальних апаратів відділення збору та обробки інформації роти безпілотних авіаційних комплексів військової частини А0000","3000000023"],
  ["солдат","ЗАХАРЧЕНКО","Євген","Юрійович","водій-електрик 2 відділення 4 взводу роти безпілотних авіаційних комплексів військової частини А0000","3000000024"],
];
const personnelRows = people.map(([rank, surname, given_name, patronymic, position, tax_id], index) => ({ rank, surname, given_name, patronymic, position, tax_id, birth_date: `199${index % 8}-0${(index % 8) + 1}-1${index % 9}`, phone: `+38067${String(1000000 + index).slice(1)}`, email: `test${index + 1}@example.test`, education_level: index % 3 ? "Вища" : "Середня спеціальна", military_id: `МК-${String(101 + index)}`, gender: index === 1 || index === 6 || index === 14 || index === 20 || index === 22 ? "Жіноча" : "Чоловіча", service_type: "Контракт", service_start_date: "2023-02-24", military_fitness: "Придатний", blood_type: ["I+", "II+", "III+", "IV+"][index % 4], marital_status: index % 2 ? "Одружений" : "Неодружений", position_assigned_date: "2025-01-15", position_assignment_order: "№ 17 від 15.01.2025", driver_license: index === 8 || index === 13 || index === 23 ? "Так" : "", driver_license_categories: index === 8 || index === 13 || index === 23 ? "B, C" : "", driver_license_valid_until: index === 8 || index === 13 || index === 23 ? "2030-12-31" : "" }));

const personnelKeys = ["rank","surname","given_name","patronymic","position","tax_id","birth_date","phone","email","education_level","military_id","gender","service_type","service_start_date","military_fitness","blood_type","marital_status","position_assigned_date","position_assignment_order","driver_license","driver_license_categories","driver_license_valid_until"];
addSheet("Особовий склад", personnelKeys, personnelRows, { position: 60, tax_id: 17, phone: 16, position_assignment_order: 24 });

const crewKeys = ["unit_type","company_name","name","platoon","position_name","reconnaissance_area","battle_order","sector","official_strength","working_strength","status","uav_name","uav_type","functional_duties","current_location","notes"];
const crews = [
  {unit_type:"Екіпаж",company_name:"Рота БпАК А0000",name:"Сокіл",platoon:"1 взвод",position_name:"СТАРТ-1",reconnaissance_area:"район НОВОСЕЛІВКА",battle_order:"БРО-01",sector:"Сектор «Північ»",official_strength:"4",working_strength:"3",status:"Працюючий",uav_name:"LELEKA-100",uav_type:"Літаковий Розвідувальний",functional_duties:"Розвідка та коригування",current_location:"На позиції",notes:"Тестовий екіпаж"},
  {unit_type:"Екіпаж",company_name:"Рота БпАК А0000",name:"Барс",platoon:"1 взвод",position_name:"СТАРТ-1",reconnaissance_area:"район НОВОСЕЛІВКА",battle_order:"БРО-01",sector:"Сектор «Північ»",official_strength:"3",working_strength:"3",status:"Працюючий",uav_name:"MAVIC 3T",uav_type:"Коптер",functional_duties:"Спостереження",current_location:"На позиції",notes:"Спільна позиція з «Соколом»"},
  {unit_type:"Екіпаж",company_name:"Рота БпАК А0000",name:"Вітер",platoon:"2 взвод",position_name:"ЗАПАС-2",reconnaissance_area:"район СТЕПОВЕ",battle_order:"БРО-02",sector:"Сектор «Схід»",official_strength:"4",working_strength:"2",status:"Формується",uav_name:"SHARK",uav_type:"Літаковий Розвідувальний",functional_duties:"Розвідка",current_location:"ПУ",notes:"Є вакансії"},
  {unit_type:"Екіпаж",company_name:"Рота БпАК А0000",name:"Грім",platoon:"4 взвод",position_name:"РЕЗЕРВ-4",reconnaissance_area:"район ЛІСОВЕ",battle_order:"БРО-04",sector:"Сектор «Захід»",official_strength:"3",working_strength:"0",status:"Не активний",uav_name:"FPV 10",uav_type:"ФПВ",functional_duties:"Ударні задачі",current_location:"",notes:"Резервний екіпаж"},
];
addSheet("Екіпажі", crewKeys, crews, { company_name: 26, functional_duties: 28, notes: 30 });

const positionKeys = ["name","position_type","strip_name","locality","battle_order","sector","condition","condition_level","field_type","size","mgrs","suitable_uav_text","is_active","crew_name","notes"];
addSheet("Позиції", positionKeys, [
  {name:"СТАРТ-1",position_type:"Основна",strip_name:"Смуга «Північ»",locality:"НОВОСЕЛІВКА",battle_order:"БРО-01",sector:"Сектор «Північ»",condition:"Повністю обладнана",condition_level:"90",field_type:"Відкрите поле",size:"30 × 40 м",mgrs:"36U UV 12000 67000",suitable_uav_text:"Літакові, коптери",is_active:"Так",crew_name:"Сокіл, Барс",notes:"Основна стартова позиція"},
  {name:"ЗАПАС-2",position_type:"Запасна",strip_name:"Смуга «Схід»",locality:"СТЕПОВЕ",battle_order:"БРО-02",sector:"Сектор «Схід»",condition:"Частково обладнана",condition_level:"60",field_type:"Лісосмуга",size:"25 × 25 м",mgrs:"36U UV 22000 55000",suitable_uav_text:"Літакові",is_active:"Так",crew_name:"Вітер",notes:"Потребує маскування"},
  {name:"РЕЗЕРВ-4",position_type:"Облаштовується",strip_name:"Смуга «Захід»",locality:"ЛІСОВЕ",battle_order:"БРО-04",sector:"Сектор «Захід»",condition:"Тривають роботи",condition_level:"35",field_type:"Узлісся",size:"20 × 30 м",mgrs:"36U UV 31000 44000",suitable_uav_text:"ФПВ",is_active:"Ні",crew_name:"Грім",notes:"Резервна позиція"},
  {name:"СПОСТЕРЕЖЕННЯ-3",position_type:"Зайнята суміжниками",strip_name:"Смуга «Центр»",locality:"КАЛИНІВКА",battle_order:"БРО-03",sector:"Сектор «Центр»",condition:"Не використовується",condition_level:"20",field_type:"Висота",size:"15 × 15 м",mgrs:"36U UV 41000 32000",suitable_uav_text:"Коптери",is_active:"Ні",crew_name:"",notes:"Інформаційна позиція"},
], { notes: 28, suitable_uav_text: 25 });

const memberKeys = ["crew_name","personnel_tax_id","personnel_full_name"];
const nameOf = (index) => people[index].slice(1, 4).join(" ");
addSheet("Склад екіпажів", memberKeys, [[11,12,13,14],[15,16,10],[18,19,20],[23]].flatMap((members, crew) => members.map((index) => ({crew_name:["Сокіл","Барс","Вітер","Грім"][crew],personnel_tax_id:people[index][5],personnel_full_name:nameOf(index)}))));
addSheet("Фактичний склад екіпажів", memberKeys, [[11,12,13],[15,16,10],[18,19],[23,14]].flatMap((members, crew) => members.map((index) => ({crew_name:["Сокіл","Барс","Вітер","Грім"][crew],personnel_tax_id:people[index][5],personnel_full_name:nameOf(index)}))));

addSheet("Автомобілі", ["name","registration_number","status","driver_tax_id","driver_full_name","crew_name"], [
  {name:"Mitsubishi L200",registration_number:"AA 1001 KT",status:"Справний",driver_tax_id:people[8][5],driver_full_name:nameOf(8),crew_name:"Сокіл"},
  {name:"Ford Ranger",registration_number:"AA 1002 KT",status:"Потребує ремонту",driver_tax_id:people[13][5],driver_full_name:nameOf(13),crew_name:"Барс"},
  {name:"Renault Master",registration_number:"AA 1003 KT",status:"Справний",driver_tax_id:people[23][5],driver_full_name:nameOf(23),crew_name:"Вітер"},
]);
const equipmentKeys = ["name","inventory_number","status","crew_name","holder_tax_id","holder_full_name","notes"];
addSheet("Генератори", equipmentKeys, [{name:"Honda EU22i",inventory_number:"GEN-001",status:"Справний",crew_name:"Сокіл",holder_tax_id:people[13][5],holder_full_name:nameOf(13),notes:"Основне живлення"},{name:"EcoFlow DELTA Pro",inventory_number:"GEN-002",status:"Потребує ремонту",crew_name:"Вітер",holder_tax_id:people[19][5],holder_full_name:nameOf(19),notes:"Потрібна діагностика"}]);
addSheet("БпЛА", equipmentKeys, [{name:"LELEKA-100",inventory_number:"UAV-001",status:"Справний",crew_name:"Сокіл",holder_tax_id:people[11][5],holder_full_name:nameOf(11),notes:"Комплект 1"},{name:"MAVIC 3T",inventory_number:"UAV-002",status:"Справний",crew_name:"Барс",holder_tax_id:people[15][5],holder_full_name:nameOf(15),notes:"Тепловізор"},{name:"SHARK",inventory_number:"UAV-003",status:"Ремонтується",crew_name:"Вітер",holder_tax_id:people[18][5],holder_full_name:nameOf(18),notes:"Заміна крила"}]);
addSheet("Зв’язок", equipmentKeys, [{name:"Motorola DP4400",inventory_number:"COM-001",status:"Справний",crew_name:"Сокіл",holder_tax_id:people[11][5],holder_full_name:nameOf(11),notes:"Резервна радіостанція"},{name:"Starlink Gen 3",inventory_number:"COM-002",status:"Справний",crew_name:"Барс",holder_tax_id:people[15][5],holder_full_name:nameOf(15),notes:"Термінал зв’язку"}]);
addSheet("Зброя та БК", equipmentKeys, [{name:"Кулемет ПКМ",inventory_number:"WPN-001",status:"Справний",crew_name:"",holder_tax_id:people[8][5],holder_full_name:nameOf(8),notes:"Закріплено за водієм"},{name:"Засіб РЕБ",inventory_number:"WPN-002",status:"Справний",crew_name:"Сокіл",holder_tax_id:people[12][5],holder_full_name:nameOf(12),notes:"Захист позиції"}]);

addSheet("Інциденти", ["incident_type","occurred_at","crew_name","equipment_category","equipment_inventory_number","equipment_name","position_name","reconnaissance_area","description"], [{incident_type:"Пошкодження БпЛА",occurred_at:"2026-09-03T10:30",crew_name:"Вітер",equipment_category:"uav",equipment_inventory_number:"UAV-003",equipment_name:"SHARK",position_name:"ЗАПАС-2",reconnaissance_area:"район СТЕПОВЕ",description:"Пошкоджено крило під час посадки"},{incident_type:"Інший інцидент",occurred_at:"2026-09-05T18:15",crew_name:"Сокіл",equipment_category:"generator",equipment_inventory_number:"GEN-001",equipment_name:"Honda EU22i",position_name:"СТАРТ-1",reconnaissance_area:"район НОВОСЕЛІВКА",description:"Короткочасне відключення живлення"}]);

addSheet("Штатні призначення", ["personnel_tax_id","personnel_full_name","slot_id","acting_slot_id","acting_position"], [
  [0,"management-0"],[1,"management-1"],[2,"management-2"],[3,"management-3"],[4,"management-4"],[5,"management-5"],[6,"management-6"],[7,"management-7"],[8,"management-9"],[9,"platoon-1-commander"],[10,"platoon-1-department-1-0"],[14,"platoon-1-department-2-0"],[16,"platoon-2-commander"],[17,"platoon-2-department-1-0"],[20,"inferred-platoon-4-commander"],
].map(([index, slot_id])=>({personnel_tax_id:people[index][5],personnel_full_name:nameOf(index),slot_id,acting_slot_id:index===1?"management-2":"",acting_position:index===1?"заступник командира роти з психологічної підтримки персоналу":""})));
addSheet("Рекомендаційні листи", ["slot_id","position_name","full_name","phone","rank","birth_date","issued_at","notes"], [{slot_id:"management-8",position_name:"Водій-електрик",full_name:"КУЗЬМЕНКО Денис Олексійович",phone:"+380671234567",rank:"солдат",birth_date:"2000-04-22",issued_at:"2026-09-06",notes:"Очікує призначення"}]);
addSheet("Додані до БЧС", ["category","group_name","full_name","rank","duties","arrived_at","current_location","notes"], [{category:"Прикомандировані",group_name:"",full_name:"СЕМЕНЮК Арсен Миколайович",rank:"солдат",duties:"Водій",arrived_at:"2026-09-01",current_location:"ПУ",notes:"До окремого розпорядження"},{category:"Тимчасово прибулі",group_name:"",full_name:"ЛЕВЧЕНКО Марина Ігорівна",rank:"сержант",duties:"Оператор",arrived_at:"2026-09-04",current_location:"ШТАБ",notes:"Очікує розподілу"},{category:"Інша підгрупа",group_name:"Навчальна група",full_name:"КОВТУН Назар Романович",rank:"солдат",duties:"Стажування",arrived_at:"2026-09-05",current_location:"ПТЗ Новостав",notes:"Практична підготовка"}]);

wb.recalculate();
await fs.mkdir(new URL(".", import.meta.url), { recursive: true });
const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(outputPath);
// artifact-tool treats a Unicode filename as a URL. Save under the stable,
// ASCII name required by the automated import test, then provide a readable
// Ukrainian copy for the user.
await fs.copyFile(outputPath, displayPath);
const check = await wb.inspect({ kind: "table", range: "Особовий склад!A1:V8", include: "values", tableMaxRows: 8, tableMaxCols: 22 });
console.log(check.ndjson);
console.log(outputPath);
