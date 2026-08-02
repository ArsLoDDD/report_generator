import { invoke } from "@tauri-apps/api/core";
import type { Template } from "../../../shared/types/domain";

export const templateService = {
  list: () => invoke<Template[]>("list_templates")
};
