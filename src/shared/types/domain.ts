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
  confidence: "high" | "medium";
  autoSelect: boolean;
  reason: string;
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
export type CommissionMember = { id: string; signerRoleId: string; order: number };
export type CommissionTemplate = { id: string; name: string; variable: string; members: CommissionMember[] };
export type UnitStructureNode = {
  id: string;
  parentId: string | null;
  kind: "group" | "position";
  name: string;
  order: number;
  rankRequirement?: string;
  vos?: string;
  tariffGrade?: string;
};
export type UnitSettings = { kind: "Рота" | "Окремий взвод" | "Інше"; shortName: string; fullName?: string; unitCode?: string; authorizedStrength: number; structure?: UnitStructureNode[]; battalionFullName?: string; battalionShortName?: string; militaryUnitShortName?: string; reportRecipient?: string; kspName?: string; kspLocality?: string; kspMgrs?: string; armyCorpsNumber?: string; armNumber?: string };

export type AppSettings = {
  mainSigner: SignerSettings;
  commander: SignerSettings;
  chief: SignerSettings;
  deputyPpp: SignerSettings;
  deputyArmament: SignerSettings;
  deputyRear: SignerSettings;
  fuelChief: SignerSettings;
  signerRoles: SignerRole[];
  commissionTemplates?: CommissionTemplate[];
  visiblePersonnelColumns?: string[];
  visibleVehicleColumns?: string[];
  unit: UnitSettings;
};

export type StartupWarning = {
  code: "database-missing" | "templates-missing" | "personnel-empty" | "crew-callsign-missing" | "uav-type-missing" | "crew-primary-uav-missing" | `position-work-overdue-${number}` | `deadline-reminder-${number}`;
  title: string;
  message: string;
};

export type DeadlineReminder = {
  id: number;
  description: string;
  dueAt: string;
  status: "active" | "completed";
  warningSeenAt?: string | null;
  lastNotificationSlot?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeadlineNotification = {
  reminder: DeadlineReminder;
  slot: string;
  cadenceMinutes: number;
  overdue: boolean;
};

export type Screen = "warnings" | "generator" | "templates" | "report-analyser" | "summary-report" | "people" | "staffing-bcs" | "payments" | "flight-planning" | "flight-journal" | "positions" | "assets" | "vehicles" | "generators" | "uavs" | "communications" | "weapons" | "crews" | "incidents" | "generated" | "settings" | "documentation";
