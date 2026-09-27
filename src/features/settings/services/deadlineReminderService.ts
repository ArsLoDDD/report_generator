import { invoke } from "@tauri-apps/api/core";
import type { DeadlineNotification, DeadlineReminder } from "../../../shared/types/domain";

export type DeadlineReminderInput = { id?: number; description: string; dueAt: string };

const changed = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("deadline-reminders-updated"));
  window.dispatchEvent(new Event("operational-data-updated"));
};

export const deadlineReminderService = {
  list: () => invoke<DeadlineReminder[]>("list_deadline_reminders"),
  save: (reminder: DeadlineReminderInput) => Promise.resolve(invoke<DeadlineReminder>("save_deadline_reminder", { reminder })).then((result) => { changed(); return result; }),
  complete: (id: number) => Promise.resolve(invoke<void>("complete_deadline_reminder", { id })).then(() => { changed(); }),
  delete: (id: number) => Promise.resolve(invoke<void>("delete_deadline_reminder", { id })).then(() => { changed(); }),
  acknowledgeWarnings: (ids: number[]) => Promise.resolve(invoke<void>("acknowledge_deadline_warnings", { ids })).then(() => { changed(); }),
  listNotifications: () => invoke<DeadlineNotification[]>("list_deadline_notifications"),
  acknowledgeNotification: (id: number, slot: string) => invoke<void>("acknowledge_deadline_notification", { id, slot }),
};
