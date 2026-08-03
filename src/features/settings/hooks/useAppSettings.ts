import { useCallback, useEffect, useState } from "react";
import type { AppSettings, SignerRole, SignerSettings } from "../../../shared/types/domain";
import { settingsService } from "../services/settingsService";

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const refresh = useCallback(async () => {
    try { setSettings(await settingsService.get()); setErrorMessage(null); }
    catch { setErrorMessage("Не вдалося завантажити налаштування підписантів."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const updateSigner = async (role: SignerRole, signer: SignerSettings) => {
    setIsSaving(true); setErrorMessage(null);
    try { setSettings(await settingsService.updateSigner(role, signer)); return true; }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : "Не вдалося зберегти підписанта."); return false; }
    finally { setIsSaving(false); }
  };
  return { settings, errorMessage, isSaving, updateSigner };
}
