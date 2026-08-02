export type TemplateVariable = {
  token: string;
  label: string;
  description: string;
  example: string;
};

type PersonnelField = Omit<TemplateVariable, "token"> & { key: string };

const personnelFields: PersonnelField[] = [
  { key: "rank", label: "Звання", description: "Військове звання обраної особи.", example: "Солдат" },
  { key: "surname", label: "Прізвище", description: "Прізвище у затвердженому написанні.", example: "ВАСИЛЬОК" },
  { key: "givenName", label: "Ім’я", description: "Ім’я військовослужбовця.", example: "Іван" },
  { key: "patronymic", label: "По батькові", description: "По батькові військовослужбовця.", example: "Аркадійович" },
  { key: "fullName", label: "Повне ПІБ", description: "Прізвище, ім’я та по батькові одним рядком.", example: "ВАСИЛЬОК Іван Аркадійович" },
  { key: "position", label: "Посада", description: "Повна посада разом із військовою частиною.", example: "Стрілець, військова частина А0000" },
  { key: "taxId", label: "ІПН", description: "Десятизначний ідентифікаційний номер.", example: "7462389812" },
  { key: "birthDate", label: "Дата народження", description: "Дата народження у форматі, який зберігається в особовій справі.", example: "02.03.1999 року" },
  { key: "educationLevel", label: "Рівень освіти", description: "Формат або рівень здобутої освіти.", example: "вища" },
  { key: "educationDetails", label: "Де здобуто освіту", description: "Заклад освіти та рік, якщо вони внесені до обліку.", example: "Львівська комерційна академія у 2002р" },
  { key: "armedForcesServiceStartDate", label: "Початок служби в ЗСУ", description: "Дата або текст про початок служби в ЗСУ.", example: "у ЗС — із 27.02.2022 року" },
  { key: "positionAssignedDate", label: "Дата призначення", description: "Дата призначення на поточну посаду.", example: "02.08.2026 року" },
  { key: "positionAssignmentOrder", label: "Наказ про призначення", description: "Реквізити наказу про призначення на посаду.", example: "КВ ОК «Пуп» №000-ПС" },
  { key: "militaryId", label: "Військовий квиток", description: "Номер військового квитка.", example: "АВ №077672" },
  { key: "assignedVehicleName", label: "Закріплений автомобіль", description: "Назва транспортного засобу, закріпленого за особою.", example: "Great Wall" },
  { key: "assignedVehicleRegistration", label: "Номер автомобіля", description: "Державний номер закріпленого автомобіля.", example: "АВ 7265" }
];

export const singlePersonVariables: TemplateVariable[] = personnelFields.map(({ key, ...field }) => ({
  ...field,
  token: `{{soldier.${key}}}`
}));

export const multiPersonVariables: TemplateVariable[] = personnelFields.map(({ key, label, description, example }) => ({
  token: `{{soldiers[0].${key}}}`,
  label: `${label} першої особи`,
  description: `${description} Індекс [0] означає першу обрану особу; для наступної замініть його на [1], [2] тощо.`,
  example
}));

export const serviceVariables: TemplateVariable[] = [
  { token: "{{mainRank}}", label: "Звання основного підписанта", description: "Береться з налаштувань основного підписанта.", example: "майор" },
  { token: "{{mainName}}", label: "ПІБ основного підписанта", description: "Береться з налаштувань основного підписанта.", example: "Іваненко Іван Іванович" },
  { token: "{{mainPosition}}", label: "Посада основного підписанта", description: "Береться з налаштувань основного підписанта.", example: "Заступник командира з ППП" },
  { token: "{{mainSignature}}", label: "Підпис основного підписанта", description: "Зображення підпису з папки підписів; вставляється під час генерації, коли це підтримує шаблон.", example: "Підпис основного підписанта" },
  { token: "{{commanderName}}", label: "ПІБ командира", description: "ПІБ командира з налаштувань програми.", example: "Петренко Петро Петрович" },
  { token: "{{chiefName}}", label: "ПІБ начальника штабу", description: "ПІБ начальника штабу з налаштувань програми.", example: "Сидоренко Сергій Сергійович" }
];
