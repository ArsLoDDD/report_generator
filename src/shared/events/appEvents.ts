export type AppDataEvent =
  | "generated-reports-changed"
  | "personnel-refresh"
  | "vehicles-refresh";

export function emitAppDataEvent(eventName: AppDataEvent) {
  window.dispatchEvent(new Event(eventName));
}

export function subscribeToAppDataEvent(eventName: AppDataEvent, listener: () => void) {
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}

