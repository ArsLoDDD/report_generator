import { invoke } from "@tauri-apps/api/core";

export type PaymentManualStatus = "БР" | "БР30" | "30Б" | "30" | "ПУСТО";
export type PaymentStatusTone = "green" | "yellow" | "blue" | "white" | "danger" | "empty";
export type PaymentReportKind = "duty" | "tenK";

export type PaymentDailyStatus = {
  personnelId: number;
  statusDate: string;
  status: string;
  reportCode: string;
  tone: PaymentStatusTone;
  actualLocation: string;
  sourceDetails: string;
  manualOverride: PaymentManualStatus | null;
};

export const paymentsService = {
  list: (month: string) => invoke<PaymentDailyStatus[]>("list_payment_statuses", { month }),
  save: (personnelId: number, statusDate: string, status: PaymentManualStatus | "") => invoke<void>("save_payment_status", { personnelId, statusDate, status }),
  saveRange: (personnelId: number, statusDates: string[], status: PaymentManualStatus | "") => invoke<void>("save_payment_statuses", { personnelId, statusDates, status }),
  exportReport: (month: string, path: string, reportKind: PaymentReportKind) => invoke<void>("export_payments_report", { month, path, reportKind }),
};
