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

export const singlePersonVariables: TemplateVariable[] = personnelFields.map(({ key, ...field }) => ({ ...field, token: `{{soldier.${key}}}` }));

export const multiPersonVariables: TemplateVariable[] = personnelFields.map(({ key, label, description, example }) => ({ token: `{{soldiers[0].${key}}}`, label: `${label} у масиві осіб`, description, example }));

export const documentVariables: TemplateVariable[] = [
  { token: "{{document.date}}", label: "Дата рапорту", description: "Дата, яку користувач обирає на сторінці генерації. Поле дати з’являється лише для шаблону, що містить цю змінну.", example: "03.08.2026 року" }
];

export const signerVariables: TemplateVariable[] = [
  { token: "{{main.rank}}", label: "Звання основного підписанта", description: "Звання основного підписанта з налаштувань програми.", example: "майор" },
  { token: "{{main.fullName}}", label: "Повне ПІБ основного підписанта", description: "ПІБ основного підписанта з налаштувань програми.", example: "Іваненко Іван Іванович" },
  { token: "{{main.position}}", label: "Посада основного підписанта", description: "Посада основного підписанта з налаштувань програми.", example: "Заступник командира з ППП" },
  { token: "{{main.signature}}", label: "Підпис основного підписанта", description: "PNG-зображення з папки «Підписи». Назва файлу налаштовується лише для основного підписанта.", example: "[зображення підпису]" },
  { token: "{{commanderName}}", label: "ПІБ командира", description: "ПІБ командира з налаштувань програми.", example: "Петренко Петро Петрович" },
  { token: "{{chiefName}}", label: "ПІБ начальника штабу", description: "ПІБ начальника штабу з налаштувань програми.", example: "Сидоренко Сергій Сергійович" }
];
