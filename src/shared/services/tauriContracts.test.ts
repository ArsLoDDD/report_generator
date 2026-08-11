import { describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { applicationService } from "../../app/services/applicationService";
import { generatedReportsService } from "../../features/generated-reports/services/generatedReportsService";
import { reportGenerationService } from "../../features/report-generation/services/reportGenerationService";
import { settingsService } from "../../features/settings/services/settingsService";
import { templateService } from "../../features/templates/services/templateService";
import { personnelService } from "./personnelService";

describe("Tauri command contracts", () => {
  it("sends personnel commands with exact command names and payloads", () => {
    const draft = { rank: "солдат" } as never;
    personnelService.list(20, 20); personnelService.create(draft); personnelService.update(4, draft); personnelService.delete(4);
    personnelService.importExcel("/tmp/source.xlsx", "replace"); personnelService.exportExcel("/tmp/out.xlsx");
    personnelService.listCustomFields(); personnelService.listPersonnelFields(); personnelService.createCustomField({ fieldKey: "unit_name", displayName: "Підрозділ", description: "", initialValue: "" });
    personnelService.updateCustomField({ fieldKey: "unit_name", displayName: "Підрозділ", description: "", initialValue: "" }); personnelService.deleteCustomField("unit_name");
    personnelService.listVehicleCustomFields(); personnelService.createVehicleCustomField({ fieldKey: "cargo", displayName: "Вантаж", description: "", initialValue: "" }); personnelService.updateVehicleCustomField({ fieldKey: "cargo", displayName: "Вантаж", description: "", initialValue: "" }); personnelService.deleteVehicleCustomField("cargo");
    expect(invoke.mock.calls).toEqual([
      ["list_personnel", { offset: 20, limit: 20 }], ["create_personnel", { draft }], ["update_personnel", { personnelId: 4, draft }], ["delete_personnel", { personnelId: 4 }],
      ["import_personnel_xlsx", { path: "/tmp/source.xlsx", mode: "replace" }], ["export_personnel_xlsx", { path: "/tmp/out.xlsx" }], ["list_custom_fields"], ["list_personnel_fields"],
      ["create_custom_field", { field: { fieldKey: "unit_name", displayName: "Підрозділ", description: "", initialValue: "" } }], ["update_custom_field", { field: { fieldKey: "unit_name", displayName: "Підрозділ", description: "", initialValue: "" } }], ["delete_custom_field", { fieldKey: "unit_name" }],
      ["list_vehicle_custom_fields"], ["create_vehicle_custom_field", { field: { fieldKey: "cargo", displayName: "Вантаж", description: "", initialValue: "" } }], ["update_vehicle_custom_field", { field: { fieldKey: "cargo", displayName: "Вантаж", description: "", initialValue: "" } }], ["delete_vehicle_custom_field", { fieldKey: "cargo" }]
    ]);
  });

  it("sends settings, templates, generation and reports commands exactly", () => {
    settingsService.get(); settingsService.updateSigner("main", { fullName: "Іваненко Іван", rank: "майор", position: "командир" }); settingsService.updateVisiblePersonnelColumns(["rank"]); settingsService.openApplicationDirectory(); settingsService.createDatabaseBackup(); settingsService.exportApplicationData("/tmp/backup.zip", { database: true, settings: true, customVariables: true, templates: true, reports: false }); settingsService.importApplicationData("/tmp/backup.zip");
    templateService.list(0, 20); templateService.inspect("/templates/a.docx"); templateService.open("/templates/a.docx"); templateService.openDirectory(); templateService.delete("/templates/a.docx");
    reportGenerationService.selectTemplateFile(); reportGenerationService.inspectTemplate("/templates/a.docx"); reportGenerationService.validateTemplate("/templates/a.docx", [1], "2026-08-11"); reportGenerationService.generateReport({ templatePath: "/templates/a.docx", personnelIds: [1], reportDate: "2026-08-11" }); reportGenerationService.openGeneratedReport("/reports/a.docx"); reportGenerationService.openGeneratedReportFolder("/reports");
    generatedReportsService.list(0, 20); generatedReportsService.openDocument("/reports/a.docx"); generatedReportsService.openFolder("/reports"); generatedReportsService.delete(["/reports/a.docx"]); applicationService.getStartupWarnings();
    expect(invoke.mock.calls).toEqual(expect.arrayContaining([
      ["get_app_settings"], ["update_signer_settings", { role: "main", signer: { fullName: "Іваненко Іван", rank: "майор", position: "командир" } }], ["update_visible_personnel_columns", { columns: ["rank"] }], ["open_application_directory"], ["create_database_backup"], ["export_application_data", { path: "/tmp/backup.zip", options: { database: true, settings: true, customVariables: true, templates: true, reports: false } }], ["import_application_data", { path: "/tmp/backup.zip" }],
      ["list_templates", { offset: 0, limit: 20 }], ["inspect_template", { templatePath: "/templates/a.docx" }], ["open_template", { templatePath: "/templates/a.docx" }], ["open_templates_directory"], ["delete_template", { templatePath: "/templates/a.docx" }],
      ["select_template_file"], ["validate_template", { templatePath: "/templates/a.docx", personnelIds: [1], reportDate: "2026-08-11", vehicleIds: [] }], ["generate_report", { request: { templatePath: "/templates/a.docx", personnelIds: [1], reportDate: "2026-08-11" } }], ["open_generated_report", { reportPath: "/reports/a.docx" }], ["open_generated_report_folder", { folderPath: "/reports" }],
      ["list_generated_reports", { offset: 0, limit: 20 }], ["open_generated_report", { reportPath: "/reports/a.docx" }], ["open_generated_report_folder", { folderPath: "/reports" }], ["delete_generated_reports", { reportPaths: ["/reports/a.docx"] }], ["get_startup_warnings"]
    ]));
  });
});
