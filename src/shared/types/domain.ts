export type TemplateStatus = "ready" | "warning" | "error";

export type Template = {
  name: string;
  description: string;
  changed: string;
  status: TemplateStatus;
  variables: number;
  sourcePath?: string;
};

export type Person = {
  id: number;
  fullName: string;
  rank: string;
  surname: string;
  givenName: string;
  patronymic: string;
  position: string;
  taxId: string;
  birthDate: string;
  educationLevel: string;
  educationDetails: string;
  armedForcesServiceStartDate: string;
  positionAssignedDate: string;
  positionAssignmentOrder: string;
  militaryId: string;
  assignedVehicleName: string;
  assignedVehicleRegistration: string;
};

export type PersonnelDraft = Omit<Person, "id" | "fullName">;

export type GeneratedReportSummary = {
  name: string;
  template: string;
  generatedAt: string;
  docxPath: string;
  folderPath: string;
};

export type Screen = "generator" | "templates" | "people" | "generated" | "settings" | "documentation";
