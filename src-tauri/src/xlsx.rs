use crate::personnel::{Personnel, PersonnelDraft};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Write},
    path::Path,
};
mod reader;
mod writer;

pub use reader::*;
pub use writer::*;

use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

pub const PERSONNEL_KEYS: &[&str] = &[
    "rank",
    "surname",
    "given_name",
    "patronymic",
    "position",
    "tax_id",
    "birth_date",
    "education_level",
    "education_details",
    "armed_forces_service_start_date",
    "position_assigned_date",
    "position_assignment_order",
    "military_id",
    "gender",
    "full_name",
    "passport_series",
    "passport_number",
    "passport_issued_by",
    "passport_issue_date",
    "foreign_passport",
    "foreign_passport_issued_by",
    "foreign_passport_issue_date",
    "foreign_passport_series",
    "foreign_passport_number",
    "military_document_issued_by",
    "military_document_issue_date",
    "combatant_certificate",
    "combatant_certificate_issued_by",
    "combatant_certificate_issue_date",
    "combatant_certificate_series",
    "combatant_certificate_number",
    "driver_license",
    "driver_license_issued_by",
    "driver_license_categories",
    "driver_license_valid_until",
    "driver_license_issue_date",
    "driver_license_series",
    "driver_license_number",
    "basic_military_training",
    "basic_training_start_date",
    "basic_training_end_date",
    "basic_training_location",
    "phone",
    "email",
    "marital_status",
    "blood_type",
    "military_fitness",
    "oath_date",
    "service_type",
    "service_start_date",
    "conscription_institution",
];
pub const VEHICLE_KEYS: &[&str] = &[
    "name",
    "registration_number",
    "status",
    "driver_tax_id",
    "driver_full_name",
    "crew_name",
];
pub const CREW_KEYS: &[&str] = &[
    "unit_type",
    "company_name",
    "name",
    "platoon",
    "position_name",
    "reconnaissance_area",
    "battle_order",
    "sector",
    "official_strength",
    "working_strength",
    "status",
    "uav_name",
    "uav_type",
    "functional_duties",
    "current_location",
    "notes",
];
pub const POSITION_KEYS: &[&str] = &[
    "name",
    "position_type",
    "strip_name",
    "locality",
    "battle_order",
    "sector",
    "condition",
    "condition_level",
    "field_type",
    "size",
    "mgrs",
    "suitable_uav_text",
    "is_active",
    "crew_name",
    "notes",
];
pub const CREW_MEMBER_KEYS: &[&str] = &["crew_name", "personnel_tax_id", "personnel_full_name"];
pub const EQUIPMENT_KEYS: &[&str] = &[
    "name",
    "inventory_number",
    "status",
    "crew_name",
    "holder_tax_id",
    "holder_full_name",
    "notes",
];
pub const INCIDENT_KEYS: &[&str] = &[
    "incident_type",
    "occurred_at",
    "crew_name",
    "equipment_category",
    "equipment_inventory_number",
    "equipment_name",
    "position_name",
    "reconnaissance_area",
    "description",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VehicleRow {
    pub name: String,
    pub registration_number: String,
    pub status: String,
    pub driver_tax_id: String,
    pub driver_full_name: String,
    pub crew_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CrewRow {
    pub working_strength: String,
    pub name: String,
    pub platoon: String,
    pub position_name: String,
    pub reconnaissance_area: String,
    pub unit_type: String,
    pub company_name: String,
    pub battle_order: String,
    pub sector: String,
    pub official_strength: String,
    pub status: String,
    pub uav_name: String,
    pub uav_type: String,
    pub functional_duties: String,
    pub current_location: String,
    pub notes: String,
}

#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BcsRow {
    #[serde(default)]
    pub is_temporary: bool,
    #[serde(default)]
    pub is_external: bool,
    #[serde(default)]
    pub color_key: String,
    #[serde(default)]
    pub group_key: String,
    pub section: String,
    pub position_name: String,
    pub battle_order: String,
    pub sector: String,
    pub crew_name: String,
    pub crew_actual: String,
    pub crew_official: String,
    pub crew_status: String,
    pub uav_name: String,
    pub uav_type: String,
    pub personnel_position: String,
    pub rank: String,
    pub full_name: String,
    pub duties: String,
    pub location: String,
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PositionRow {
    pub name: String,
    pub position_type: String,
    pub strip_name: String,
    pub locality: String,
    pub battle_order: String,
    pub sector: String,
    pub condition: String,
    pub condition_level: String,
    pub field_type: String,
    pub size: String,
    pub mgrs: String,
    pub suitable_uav_text: String,
    pub is_active: String,
    pub crew_name: String,
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CrewMemberRow {
    pub crew_name: String,
    pub personnel_tax_id: String,
    pub personnel_full_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EquipmentRow {
    pub category: String,
    pub name: String,
    pub inventory_number: String,
    pub status: String,
    pub crew_name: String,
    pub holder_tax_id: String,
    pub holder_full_name: String,
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncidentRow {
    pub incident_type: String,
    pub occurred_at: String,
    pub crew_name: String,
    pub equipment_category: String,
    pub equipment_inventory_number: String,
    pub equipment_name: String,
    pub position_name: String,
    pub reconnaissance_area: String,
    pub description: String,
}

pub struct ImportData {
    pub staffing: crate::staffing_exchange::ExtraSheets,
    pub personnel: Vec<PersonnelDraft>,
    pub vehicles: Vec<VehicleRow>,
    pub crews: Vec<CrewRow>,
    pub crew_members: Vec<CrewMemberRow>,
    pub equipment: Vec<EquipmentRow>,
    pub incidents: Vec<IncidentRow>,
    pub positions: Vec<PositionRow>,
    pub personnel_custom_fields: Vec<CustomValueRow>,
    pub vehicle_custom_fields: Vec<CustomValueRow>,
    pub personnel_custom_field_maps: Vec<CustomFieldMapRow>,
    pub vehicle_custom_field_maps: Vec<CustomFieldMapRow>,
}

#[derive(Debug, Clone)]
struct RowWithNumber {
    values: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomValueRow {
    pub owner_key: String,
    pub values: HashMap<String, String>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomFieldMapRow {
    pub display_name: String,
    pub field_key: String,
    pub description: String,
    pub initial_value: String,
}

#[cfg(test)]
mod tests;
