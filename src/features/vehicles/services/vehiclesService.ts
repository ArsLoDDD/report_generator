import { invoke } from "@tauri-apps/api/core";
import type { Crew } from "../../operations/types";
import type { Vehicle } from "../types";

export const vehiclesService = {
  list: () => invoke<Vehicle[]>("list_vehicles"),
  create: (name: string, registrationNumber: string, status: string) => invoke<void>("create_vehicle", { name, registrationNumber, status }),
  assign: (vehicleId: number, personnelId: number | null, crewId: number | null) => invoke<void>("assign_vehicle", { vehicleId, personnelId, crewId }),
  updateStatus: (vehicleId: number, status: string) => invoke<void>("update_vehicle_status", { vehicleId, status }),
  remove: (vehicleId: number) => invoke<void>("delete_vehicle", { vehicleId }),
  listCrews: () => invoke<Crew[]>("list_crews"),
};
