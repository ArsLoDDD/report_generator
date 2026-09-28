export type IncidentField = {
  key: string;
  label: string;
  wide?: boolean;
  placeholder?: string;
  inputType?: "text" | "textarea" | "time" | "number";
};

export const incidentTypesByCategory: Record<string, string[]> = {
  "Особовий склад": ["Поранення", "Загибель", "Травма", "СЗЧ", "Алкогольне/наркотичне сп’яніння", "Самогубство"],
  "БпЛА": ["Втрата БпЛА"],
  "Майно": ["Втрата майна", "Втрата військового квитка/посвідчення УБД"],
  "Транспорт": ["Знищення машини", "Пошкодження машини", "ДТП"],
  "Позиція і бойова обстановка": ["Обстріл", "Знищення позиції"],
  "Інше": ["Інший інцидент"],
};

export const incidentFieldsByType: Record<string, IncidentField[]> = {
  "Втрата БпЛА": [
    { key: "lastPoint", label: "Остання точка / телеметрія", wide: true, inputType: "textarea" },
    { key: "altitude", label: "Висота" },
    { key: "additionalEquipment", label: "Додаткове обладнання", wide: true, inputType: "textarea", placeholder: "БК, носії інформації, РЕБ/РЕР, інше" },
    { key: "lossReason", label: "Причина втрати", wide: true, inputType: "textarea" },
    { key: "searchResult", label: "Результат пошуку", wide: true, inputType: "textarea" },
  ],
  "Втрата майна": [],
  "Знищення машини": [{ key: "damageDescription", label: "Характер знищення", wide: true, inputType: "textarea" }],
  "Пошкодження машини": [{ key: "damageDescription", label: "Характер пошкоджень", wide: true, inputType: "textarea" }],
  "ДТП": [
    { key: "participants", label: "Учасники", wide: true, inputType: "textarea" },
    { key: "casualties", label: "Постраждалі" },
    { key: "witnesses", label: "Свідки", wide: true, inputType: "textarea" },
    { key: "fatalities", label: "Загиблі" },
    { key: "damageDescription", label: "Пошкодження", wide: true, inputType: "textarea" },
  ],
  "Обстріл": [
    { key: "startTime", label: "Час початку", inputType: "time" },
    { key: "endTime", label: "Час завершення", inputType: "time" },
    { key: "weaponType", label: "Тип засобу ураження" },
    { key: "estimatedCount", label: "Орієнтовна кількість", inputType: "number" },
    { key: "measures", label: "Вжиті заходи", wide: true, inputType: "textarea" },
    { key: "relocation", label: "Зміна позиції" },
    { key: "evacuation", label: "Евакуація" },
  ],
  "Знищення позиції": [
    { key: "cause", label: "Причина", wide: true, inputType: "textarea" },
    { key: "destructionDegree", label: "Ступінь руйнування" },
    { key: "evacuation", label: "Евакуація", wide: true, inputType: "textarea" },
    { key: "reservePosition", label: "Резервна позиція" },
  ],
  "Поранення": [
    { key: "severity", label: "Попередня тяжкість" },
    { key: "injuryMeans", label: "Засіб ураження" },
    { key: "injuryZone", label: "Зона ураження" },
    { key: "evacuationTime", label: "Час евакуації", inputType: "time" },
    { key: "evacuationFacility", label: "Заклад евакуації" },
  ],
  "Травма": [
    { key: "severity", label: "Попередня тяжкість" },
    { key: "injuryMeans", label: "Засіб травмування" },
    { key: "injuryZone", label: "Зона травми" },
    { key: "evacuationTime", label: "Час евакуації", inputType: "time" },
    { key: "evacuationFacility", label: "Заклад евакуації" },
  ],
  "Загибель": [{ key: "injuryMeans", label: "Засіб / фактичні обставини", wide: true, inputType: "textarea" }],
  "Самогубство": [{ key: "witnesses", label: "Свідки", wide: true, inputType: "textarea" }],
  "СЗЧ": [
    { key: "departedFrom", label: "Звідки здійснено" },
    { key: "contactAttempts", label: "Спроби зв’язку", wide: true, inputType: "textarea" },
    { key: "reportsOrders", label: "Доповіді, повідомлення, накази", wide: true, inputType: "textarea" },
    { key: "currentResult", label: "Поточний результат" },
  ],
  "Алкогольне/наркотичне сп’яніння": [
    { key: "grounds", label: "Підстава" },
    { key: "witnesses", label: "Свідки", wide: true, inputType: "textarea" },
    { key: "testMethod", label: "Спосіб перевірки" },
    { key: "deviceNumber", label: "Прилад / номер" },
    { key: "testResult", label: "Результат" },
    { key: "repeatResult", label: "Повторний вимір" },
    { key: "consentRefusal", label: "Згода / відмова" },
    { key: "medicalFacility", label: "Медичний заклад" },
  ],
  "Втрата військового квитка/посвідчення УБД": [
    { key: "documentType", label: "Вид документа" },
    { key: "documentNumber", label: "Серія / номер" },
    { key: "lastLocation", label: "Останнє підтверджене місце", wide: true, inputType: "textarea" },
    { key: "searchActions", label: "Пошукові дії", wide: true, inputType: "textarea" },
  ],
};

export const incidentFieldLabels = Object.fromEntries(
  Object.values(incidentFieldsByType).flat().map((field) => [field.key, field.label]),
);

export function incidentAssetLabel(incidentType: string) {
  if (incidentType === "Втрата БпЛА") return "БпЛА та складові";
  if (["Знищення машини", "Пошкодження машини", "ДТП"].includes(incidentType)) return "Техніка";
  return "Майно";
}

export function flightOccurredAt(flightDate: string, skyTime: string) {
  const value = new Date(`${flightDate}T${skyTime || "00:00"}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function isFlightWithinLastDay(flightDate: string, skyTime: string, now = new Date()) {
  const occurredAt = flightOccurredAt(flightDate, skyTime);
  if (!occurredAt) return false;
  const difference = now.getTime() - occurredAt.getTime();
  return difference >= 0 && difference <= 24 * 60 * 60 * 1000;
}
