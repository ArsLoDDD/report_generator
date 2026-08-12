import { useCallback, useEffect, useState } from "react";
import type { AppSettings, SignerSettings } from "../../../shared/types/domain";
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
  const updateSigner = async (role: string, signer: SignerSettings) => {
    setIsSaving(true); setErrorMessage(null);
    try { setSettings(await settingsService.updateSigner(role, signer)); return true; }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : "Не вдалося зберегти підписанта."); return false; }
    finally { setIsSaving(false); }
  };
  const addSigner = async (name: string, signer: SignerSettings) => {
    setIsSaving(true); setErrorMessage(null);
    try { setSettings(await settingsService.addSigner(name, signer)); return true; }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : "Не вдалося додати підписанта."); return false; }
    finally { setIsSaving(false); }
  };
  const deleteSigner = async (id: string) => {
    setIsSaving(true); setErrorMessage(null);
    try { setSettings(await settingsService.deleteSigner(id)); return true; }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : "Не вдалося видалити підписанта."); return false; }
    finally { setIsSaving(false); }
  };
  return { settings, errorMessage, isSaving, updateSigner, addSigner, deleteSigner };
}
