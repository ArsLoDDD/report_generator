export type TemplateStatus = "ready" | "warning" | "error";

export type Template = {
  name: string;
  description: string;
  changed: string;
  status: TemplateStatus;
  variables: number;
  sourcePath?: string;
};

export type TemplateInspection = {
  isValid: boolean;
  errors: string[];
  variables: string[];
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
  gender?: "чоловіча" | "жіноча" | "";
};

export type PersonnelDraft = Omit<Person, "id" | "fullName">;

export type GeneratedReportSummary = {
  name: string;
  template: string;
  generatedAt: string;
  docxPath: string;
  folderPath: string;
};

export type PaginatedResult<T> = {
  items: T[];
  totalCount: number;
};

export type SignerRole = "main" | "commander" | "chief" | "deputyPpp" | "deputyArmament" | "deputyRear" | "fuelChief";

export type SignerSettings = {
  fullName: string;
  rank: string;
  position: string;
};

export type AppSettings = {
  mainSigner: SignerSettings;
  commander: SignerSettings;
  chief: SignerSettings;
  deputyPpp: SignerSettings;
  deputyArmament: SignerSettings;
  deputyRear: SignerSettings;
  fuelChief: SignerSettings;
};

export type StartupWarning = {
  code: "database-missing" | "templates-missing" | "personnel-empty";
  title: string;
  message: string;
};

export type Screen = "generator" | "templates" | "people" | "generated" | "settings" | "documentation";
