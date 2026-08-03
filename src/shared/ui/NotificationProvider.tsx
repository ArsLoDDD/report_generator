import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type NotificationTone = "success" | "error" | "info";
type Notification = { id: number; message: string; tone: NotificationTone };
type Notifications = { notify: (message: string, tone?: NotificationTone) => void };
const NotificationContext = createContext<Notifications | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const notify = useCallback((message: string, tone: NotificationTone = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((current) => [...current, { id, message, tone }].slice(-4));
    window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  const value = useMemo(() => ({ notify }), [notify]);
  const icons = { success: CheckCircle2, error: XCircle, info: Info };
  return <NotificationContext.Provider value={value}>{children}<aside className="notifications" aria-live="polite">{items.map((item) => { const Icon = icons[item.tone]; return <div className={`notification notification--${item.tone}`} key={item.id}><Icon /><span>{item.message}</span><button aria-label="Закрити сповіщення" onClick={() => dismiss(item.id)}><X /></button></div>; })}</aside></NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider");
  return context;
}
