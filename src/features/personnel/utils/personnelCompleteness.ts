import type { Person } from "../../../shared/types/domain";

export function isPersonnelComplete(person: Person) {
  const values = [
    person.rank, person.surname, person.givenName, person.patronymic, person.position, person.taxId,
    person.birthDate, person.educationLevel, person.educationDetails, person.armedForcesServiceStartDate,
    person.positionAssignedDate, person.positionAssignmentOrder, person.militaryId
  ];
  return values.every((value) => value.trim().length > 0);
}
