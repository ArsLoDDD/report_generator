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

export type TemplateAnalysisProposal = {
  value: string;
  token: string;
  label: string;
  category: string;
  occurrences: number;
  alternatives: Array<{ token: string; label: string }>;
};

export type TemplateAnalysis = {
  sourceName: string;
  textPreview: string;
  paragraphs: Array<{ text: string; alignment: string; leftIndent: number; firstLineIndent: number; spaceBefore: number; spaceAfter: number }>;
  proposals: TemplateAnalysisProposal[];
};

export type TemplateAnalysisReplacement = Pick<TemplateAnalysisProposal, "value" | "token"> & {
  replacement?: string;
  occurrence?: number;
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
  coreFields?: Record<string, string>;
  customFields?: Record<string, string>;
};

export type PersonnelDraft = Omit<Person, "id" | "fullName" | "customFields">;

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
export type CustomFieldDefinition = { fieldKey: string; displayName: string; description: string; initialValue: string; scope?: "personnel" | "vehicle" };

export type SignerSettings = {
  fullName: string;
  rank: string;
  position: string;
};

export type SignerRole = { id: string; name: string; signer: SignerSettings };

export type AppSettings = {
  mainSigner: SignerSettings;
  commander: SignerSettings;
  chief: SignerSettings;
  deputyPpp: SignerSettings;
  deputyArmament: SignerSettings;
  deputyRear: SignerSettings;
  fuelChief: SignerSettings;
  signerRoles: SignerRole[];
  visiblePersonnelColumns?: string[];
  visibleVehicleColumns?: string[];
};

export type StartupWarning = {
  code: "database-missing" | "templates-missing" | "personnel-empty";
  title: string;
  message: string;
};

export type Screen = "generator" | "templates" | "report-analyser" | "people" | "vehicles" | "generators" | "uavs" | "communications" | "weapons" | "crews" | "incidents" | "generated" | "settings" | "documentation" | "variable-constructor";
