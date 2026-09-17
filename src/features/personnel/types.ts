export type PersonnelControlSource = "automatic" | "manual" | "bcs";
export type ManualPersonnelLocation = "ПУ" | "ШТАБ" | "УПР" | "КСП Роти" | "ЗАБ" | "ЗХВ" | "ВІДП" | "НАВЧ" | "ВІДР" | "ЛІК" | "Відкомандировані" | "СЗЧ" | "ПТЗ Новостав";

export type PersonnelControlRecord = {
  personnelId: number;
  fullName: string;
  rank: string;
  position: string;
  tab: string;
  locationType: string;
  source: PersonnelControlSource;
  sourceLabel: string;
  canEdit: boolean;
  assignmentId: number | null;
  institution: string;
  startDate: string;
  endDate: string;
  untilSeparateOrder: boolean;
  notes: string;
  crewId: number | null;
  crewName: string;
  positionId: number | null;
  positionName: string;
  workId: number | null;
  workType: string;
  updatedAt: string;
};

export type PersonnelControlDraft = {
  personnelId: number;
  locationType: ManualPersonnelLocation;
  institution: string;
  startDate: string;
  endDate: string;
  notes: string;
};

export type PersonnelControlHistoryEvent = {
  id: number;
  assignmentId?: number | null;
  personnelId: number;
  fullName: string;
  action: string;
  locationType: string;
  institution: string;
  startDate: string;
  endDate: string;
  notes: string;
  reason: string;
  occurredAt: string;
};
