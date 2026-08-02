import type { Person } from "../types/domain";

const coreSamplePeople: Person[] = [
  { id: 1, rank: "Солдат", surname: "ВАСИЛЬОК", givenName: "Іван", patronymic: "Аркадійович", fullName: "ВАСИЛЬОК Іван Аркадійович", position: "Стрілець, військова частина А0000", taxId: "7462389812", birthDate: "02.03.1999 року", educationLevel: "вища", educationDetails: "Львівська комерційна академія у 2002р", armedForcesServiceStartDate: "у ЗС — із 27.02.2022 року", positionAssignedDate: "02.08.2026 року", positionAssignmentOrder: "КВ ОК «Пуп» №000-ПС", militaryId: "АВ №077672", assignedVehicleName: "Great Wall", assignedVehicleRegistration: "АВ 7265" },
  { id: 2, rank: "Старший солдат", surname: "ПЕТРЕНКО", givenName: "Петро", patronymic: "Петрович", fullName: "ПЕТРЕНКО Петро Петрович", position: "Оператор БпЛА, військова частина А0000", taxId: "7462389813", birthDate: "14.05.1998 року", educationLevel: "середня спеціальна", educationDetails: "Львівський фаховий коледж у 2018р", armedForcesServiceStartDate: "у ЗС — із 24.02.2022 року", positionAssignedDate: "10.03.2023 року", positionAssignmentOrder: "КВ ОК «Пуп» №018-ПС", militaryId: "АВ №077673", assignedVehicleName: "Mitsubishi L200", assignedVehicleRegistration: "АВ 7266" },
  { id: 3, rank: "Сержант", surname: "СИДОРЕНКО", givenName: "Сидір", patronymic: "Сидорович", fullName: "СИДОРЕНКО Сидір Сидорович", position: "Командир відділення, військова частина А0000", taxId: "7462389814", birthDate: "21.11.1995 року", educationLevel: "вища", educationDetails: "Національний університет у 2017р", armedForcesServiceStartDate: "у ЗС — із 01.09.2018 року", positionAssignedDate: "12.06.2024 року", positionAssignmentOrder: "КВ ОК «Пуп» №044-ПС", militaryId: "АВ №077674", assignedVehicleName: "Great Wall", assignedVehicleRegistration: "АВ 7267" }
];

const additionalMockPeople = [
  ["Молодший сержант", "КОВАЛЕНКО", "Дмитро", "Сергійович", "Стрілець"], ["Солдат", "БОНДАРЕНКО", "Андрій", "Олексійович", "Помічник оператора"],
  ["Старший солдат", "ТКАЧЕНКО", "Олексій", "Миколайович", "Механік-водій"], ["Сержант", "ШЕВЧЕНКО", "Тарас", "Григорович", "Командир відділення"],
  ["Солдат", "МЕЛЬНИК", "Віталій", "Васильович", "Стрілець"], ["Солдат", "ГНАТЮК", "Роман", "Ігорович", "Стрілець"],
  ["Молодший сержант", "КРАВЧУК", "Олег", "Петрович", "Оператор БпЛА"], ["Солдат", "ЛИСЕНКО", "Максим", "Олегович", "Стрілець"],
  ["Старший солдат", "РИБАК", "Богдан", "Васильович", "Водій"], ["Сержант", "ПОЛІЩУК", "Владислав", "Романович", "Командир екіпажу"],
  ["Солдат", "САВЧУК", "Михайло", "Ілліч", "Оператор БпЛА"], ["Старший солдат", "ДУБИНА", "Артем", "Євгенович", "Механік-водій"]
] as const;

export const samplePeople: Person[] = [...coreSamplePeople, ...additionalMockPeople.map(([rank, surname, givenName, patronymic, position], index) => {
  const id = index + 4;
  const taxId = `74623898${String(12 + id).padStart(2, "0")}`;
  return { id, rank, surname, givenName, patronymic, fullName: `${surname} ${givenName} ${patronymic}`, position: `${position}, військова частина А0000`, taxId, birthDate: "01.01.1998 року", educationLevel: "вища", educationDetails: "Національний університет у 2020р", armedForcesServiceStartDate: "у ЗС — із 24.02.2022 року", positionAssignedDate: "01.06.2024 року", positionAssignmentOrder: "КВ ОК «Пуп» №050-ПС", militaryId: `АВ №077${String(671 + id).padStart(3, "0")}`, assignedVehicleName: "Great Wall", assignedVehicleRegistration: `АВ ${7264 + id}` };
})];
