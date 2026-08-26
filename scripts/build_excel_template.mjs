import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputPath = `${process.cwd()}/outputs/personnel-import-template.xlsx`;
const previewDir = `${process.cwd()}/outputs/.excel-template-preview`;

const personnel = [
  ["Звання", "rank"], ["Прізвище", "surname"], ["Ім’я", "given_name"], ["По батькові", "patronymic"], ["Посада", "position"], ["ІПН", "tax_id"], ["Дата народження", "birth_date"], ["Формат освіти", "education_level"], ["Де отримана освіта", "education_details"], ["У ЗСУ з", "armed_forces_service_start_date"], ["Дата призначення", "position_assigned_date"], ["Наказ про призначення", "position_assignment_order"], ["Військовий квиток", "military_id"], ["Стать", "gender"], ["ПІБ", "full_name"], ["Серія паспорту", "passport_series"], ["Номер паспорту", "passport_number"], ["Ким виданий", "passport_issued_by"], ["Дата видачі", "passport_issue_date"], ["Закордонний паспорт", "foreign_passport"], ["Закордонний паспорт: Ким виданий", "foreign_passport_issued_by"], ["Закордонний паспорт: Дата видачі", "foreign_passport_issue_date"], ["Закордонний паспорт: Серія", "foreign_passport_series"], ["Закордонний паспорт: Номер", "foreign_passport_number"], ["Військовий документ: Ким виданий", "military_document_issued_by"], ["Військовий документ: Дата видачі", "military_document_issue_date"], ["Посвідчення УБД", "combatant_certificate"], ["Посвідчення УБД: Ким видане", "combatant_certificate_issued_by"], ["Посвідчення УБД: Дата видачі", "combatant_certificate_issue_date"], ["Посвідчення УБД: Серія", "combatant_certificate_series"], ["Посвідчення УБД: Номер", "combatant_certificate_number"], ["Посвідчення водія", "driver_license"], ["Посвідчення водія: Орган що видав", "driver_license_issued_by"], ["Посвідчення водія: Категорії", "driver_license_categories"], ["Посвідчення водія: Дійсне до", "driver_license_valid_until"], ["Посвідчення водія: Дата видачі", "driver_license_issue_date"], ["Посвідчення водія: Серія", "driver_license_series"], ["Посвідчення водія: Номер", "driver_license_number"], ["БЗВП", "basic_military_training"], ["БЗВП: Дата початку", "basic_training_start_date"], ["БЗВП: Дата закінчення", "basic_training_end_date"], ["БЗВП: Місце проходження", "basic_training_location"], ["Номер телефону", "phone"], ["Email", "email"], ["Сімейний стан", "marital_status"], ["Група крові", "blood_type"], ["Придатність до військової служби", "military_fitness"], ["Дата прийняття присяги", "oath_date"], ["Вид служби", "service_type"], ["Дата призову / Укладання контракту", "service_start_date"], ["Установа призову", "conscription_institution"], ["Функціональні обов’язки", "functional_duties"], ["Де знаходиться", "current_location"], ["Статус у БЧС", "bcs_status"], ["Примітка БЧС", "bcs_notes"],
];
const vehicles = [["Автомобіль", "name"], ["Державний номер", "registration_number"], ["Статус", "status"], ["ІПН закріпленого водія", "driver_tax_id"], ["ПІБ закріпленого водія", "driver_full_name"], ["Екіпаж", "crew_name"]];
const crews = [["Підрозділ по типу", "unit_type"], ["Рота / окремий взвод", "company_name"], ["Назва екіпажу", "name"], ["Взвод", "platoon"], ["Позиція", "position_name"], ["Район розвідки", "reconnaissance_area"], ["БРО", "battle_order"], ["Сектор роботи", "sector"], ["Кількість в/с за штатом", "official_strength"], ["Статус екіпажу", "status"], ["Назва БпАК", "uav_name"], ["Тип БпАК", "uav_type"], ["Функціональні обов’язки", "functional_duties"], ["Де знаходиться", "current_location"], ["Примітка", "notes"]];
const positions = [["Назва позиції", "name"], ["Тип позиції", "position_type"], ["Смуга", "strip_name"], ["Район населеного пункту", "locality"], ["БРО", "battle_order"], ["Сектор", "sector"], ["Стан", "condition"], ["Розмір", "size"], ["Приблизні координати MGRS", "mgrs"], ["Під які БпЛА підходить", "suitable_uav_text"], ["Активна", "is_active"], ["Закріплений екіпаж", "crew_name"], ["Примітка", "notes"]];
const members = [["Назва екіпажу", "crew_name"], ["ІПН військовослужбовця", "personnel_tax_id"], ["ПІБ військовослужбовця", "personnel_full_name"]];
const equipment = [["Назва", "name"], ["Інвентарний номер", "inventory_number"], ["Статус", "status"], ["Екіпаж", "crew_name"], ["ІПН відповідального", "holder_tax_id"], ["ПІБ відповідального", "holder_full_name"], ["Примітка", "notes"]];
const incidents = [["Тип інциденту", "incident_type"], ["Дата та час", "occurred_at"], ["Екіпаж", "crew_name"], ["Категорія майна", "equipment_category"], ["Інвентарний номер майна", "equipment_inventory_number"], ["Назва майна", "equipment_name"], ["Позиція", "position_name"], ["Район розвідки", "reconnaissance_area"], ["Опис", "description"]];

const definitions = [
  ["Особовий склад", personnel], ["Мапа полів ОС", personnel, true], ["Кастомні поля ОС", [["ІПН / ПІБ", "personnel_reference"]]],
  ["Автомобілі", vehicles], ["Мапа полів автомобілів", vehicles, true], ["Кастомні поля автомобілів", [["Державний номер", "registration_number"]]],
  ["Екіпажі", crews], ["Мапа полів екіпажів", crews, true], ["Позиції", positions], ["Мапа полів позицій", positions, true],
  ["Склад екіпажів", members], ["Мапа складу екіпажів", members, true],
  ["Генератори", equipment], ["Мапа полів генераторів", equipment, true], ["БпЛА", equipment], ["Мапа полів БпЛА", equipment, true],
  ["Зв’язок", equipment], ["Мапа полів зв’язку", equipment, true], ["Зброя та БК", equipment], ["Мапа полів зброї та БК", equipment, true],
  ["Інциденти", incidents], ["Мапа полів інцидентів", incidents, true],
];

const workbook = Workbook.create();
for (const [name, fields, isMap = false] of definitions) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(2);
  const rows = isMap
    ? [["Назва в Excel", "Назва змінної в БД"], ["excel_name", "field_key"], ...fields]
    : [fields.map(([label]) => label), fields.map(([, key]) => key)];
  const range = sheet.getRangeByIndexes(0, 0, rows.length, rows[0].length);
  range.values = rows;
  sheet.getRangeByIndexes(0, 0, 1, rows[0].length).format = { fill: "#1F8F3A", font: { bold: true, color: "#FFFFFF" }, wrapText: true, rowHeight: 34, verticalAlignment: "center" };
  sheet.getRangeByIndexes(1, 0, 1, rows[0].length).format = { fill: "#E8F3EB", font: { color: "#31523A" }, wrapText: true, rowHeight: 28, verticalAlignment: "center" };
  range.format.borders = { preset: "inside", style: "thin", color: "#D7E2DA" };
  range.format.autofitColumns();
  range.format.autofitRows();
  for (let column = 0; column < rows[0].length; column += 1) {
    sheet.getRangeByIndexes(0, column, rows.length, 1).format.columnWidth = isMap ? (column === 0 ? 34 : 30) : 24;
  }
}

await fs.mkdir(previewDir, { recursive: true });
for (const [name] of definitions) {
  const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${previewDir}/${name.replaceAll("/", "-")}.png`, new Uint8Array(await preview.arrayBuffer()));
}
const inspection = await workbook.inspect({ kind: "sheet,table", maxChars: 8000, tableMaxRows: 5, tableMaxCols: 8 });
console.log(inspection.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula errors" });
console.log(errors.ndjson);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
