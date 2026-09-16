//! Data-transfer objects for the operational domain.
//!
//! These contracts are intentionally independent from command/query code so new
//! asset types can reuse the same ownership links without growing one large file.

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vehicle {
    pub id: i64,
    pub name: String,
    pub registration_number: String,
    pub status: String,
    pub personnel_id: Option<i64>,
    pub driver_name: Option<String>,
    pub crew_id: Option<i64>,
    pub crew_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Crew {
    pub id: i64,
    pub name: String,
    pub platoon: String,
    pub position_name: String,
    pub reconnaissance_area: String,
    pub unit_type: String,
    pub company_name: String,
    pub battle_order: String,
    pub sector: String,
    pub official_strength: i64,
    pub working_strength: i64,
    pub position_id: Option<i64>,
    pub status: String,
    pub uav_name: String,
    pub uav_type: String,
    pub primary_uav_id: Option<i64>,
    pub functional_duties: String,
    pub current_location: String,
    pub notes: String,
    pub member_count: i64,
    pub members: Vec<CrewMember>,
    pub actual_members: Vec<CrewMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewMember {
    pub personnel_id: i64,
    pub full_name: String,
    pub rank: String,
    pub position: String,
    pub callsign: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewDraft {
    pub name: String,
    pub platoon: String,
    pub position_name: String,
    pub reconnaissance_area: String,
    #[serde(default = "default_unit_type")]
    pub unit_type: String,
    #[serde(default)]
    pub company_name: String,
    #[serde(default)]
    pub battle_order: String,
    #[serde(default)]
    pub sector: String,
    #[serde(default = "default_official_strength")]
    pub official_strength: i64,
    #[serde(default)]
    pub working_strength: i64,
    #[serde(default)]
    pub position_id: Option<i64>,
    #[serde(default = "default_crew_status")]
    pub status: String,
    #[serde(default)]
    pub uav_name: String,
    #[serde(default)]
    pub uav_type: String,
    #[serde(default)]
    pub primary_uav_id: Option<i64>,
    #[serde(default)]
    pub functional_duties: String,
    #[serde(default)]
    pub current_location: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub member_ids: Vec<i64>,
    #[serde(default)]
    pub actual_member_ids: Vec<i64>,
}

fn default_unit_type() -> String {
    "Екіпаж".into()
}
fn default_official_strength() -> i64 {
    4
}
fn default_crew_status() -> String {
    "Формується".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub id: i64,
    pub name: String,
    pub position_type: String,
    pub strip_name: String,
    pub locality: String,
    pub battle_order: String,
    pub sector: String,
    pub condition: String,
    pub condition_level: i64,
    pub field_type: String,
    pub size: String,
    pub mgrs: String,
    pub suitable_uav_text: String,
    pub is_active: bool,
    pub crew_id: Option<i64>,
    pub crew_name: Option<String>,
    pub notes: String,
    pub uav_ids: Vec<i64>,
    pub uav_names: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionDraft {
    pub name: String,
    pub position_type: String,
    pub strip_name: String,
    pub locality: String,
    pub battle_order: String,
    pub sector: String,
    pub condition: String,
    pub condition_level: i64,
    pub field_type: String,
    pub size: String,
    pub mgrs: String,
    pub suitable_uav_text: String,
    pub is_active: bool,
    pub crew_id: Option<i64>,
    pub notes: String,
    #[serde(default)]
    pub uav_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionWorkMember {
    pub assignment_id: Option<i64>,
    pub personnel_id: i64,
    pub full_name: String,
    pub rank: String,
    pub duty_type: String,
    pub start_date: String,
    pub start_time: String,
    pub end_date: String,
    pub end_time: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionWorkMemberDraft {
    pub personnel_id: i64,
    pub duty_type: String,
    pub start_date: String,
    pub start_time: String,
    pub end_date: String,
    pub end_time: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionWork {
    pub id: i64,
    pub position_id: i64,
    pub position_name: String,
    pub work_type: String,
    pub status: String,
    pub start_date: String,
    pub start_time: String,
    pub end_date: String,
    pub end_time: String,
    pub battle_order: String,
    pub notes: String,
    pub members: Vec<PositionWorkMember>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionWorkStatusEvent {
    pub id: i64,
    pub work_id: i64,
    pub position_id: i64,
    pub position_name: String,
    pub position_mgrs: String,
    pub position_locality: String,
    pub work_type: String,
    pub status: String,
    pub start_date: String,
    pub start_time: String,
    pub end_date: String,
    pub end_time: String,
    pub battle_order: String,
    pub notes: String,
    pub members: Vec<PositionWorkMember>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionWorkDraft {
    pub position_id: i64,
    pub work_type: String,
    pub status: String,
    pub start_date: String,
    pub start_time: String,
    pub end_date: String,
    pub end_time: String,
    pub battle_order: String,
    pub notes: String,
    #[serde(default)]
    pub personnel_ids: Vec<i64>,
    #[serde(default)]
    pub member_assignments: Vec<PositionWorkMemberDraft>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffingRecord {
    pub working_strength: i64,
    pub staff_slot_id: String,
    pub acting_slot_id: String,
    pub personnel_id: i64,
    pub full_name: String,
    pub rank: String,
    pub position: String,
    pub crew_id: Option<i64>,
    pub crew_name: Option<String>,
    pub actual_crew_id: Option<i64>,
    pub actual_crew_name: Option<String>,
    pub platoon: String,
    pub company_name: String,
    pub unit_type: String,
    pub crew_position_name: String,
    pub battle_order: String,
    pub sector: String,
    pub official_strength: i64,
    pub actual_strength: i64,
    pub crew_status: String,
    pub uav_name: String,
    pub uav_type: String,
    pub functional_duties: String,
    pub current_location: String,
    pub bcs_status: String,
    pub notes: String,
    pub acting_position: String,
    pub recommendation_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanCrewLocationAssignment {
    pub crew_id: i64,
    #[serde(default)]
    pub stages: Vec<Vec<i64>>,
    #[serde(default)]
    pub arrives_today: bool,
    #[serde(default)]
    pub departs_today: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffRecommendation {
    pub id: i64,
    pub personnel_id: i64,
    pub full_name: String,
    pub position_name: String,
    pub issued_at: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VacancyRecommendation {
    pub slot_id: String,
    pub id: i64,
    pub position_name: String,
    pub full_name: String,
    pub phone: String,
    pub rank: String,
    pub birth_date: String,
    pub issued_at: String,
    pub notes: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffTransfer {
    pub personnel_id: i64,
    pub position: String,
    pub slot_id: String,
    pub expected_position: String,
    pub expected_occupant_ids: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActingChange {
    pub personnel_id: i64,
    pub slot_id: String,
    pub position: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Equipment {
    pub id: i64,
    pub category: String,
    pub name: String,
    pub inventory_number: String,
    pub status: String,
    pub crew_id: Option<i64>,
    pub crew_name: Option<String>,
    pub personnel_id: Option<i64>,
    pub holder_name: Option<String>,
    pub total_quantity: i64,
    pub day_quantity: i64,
    pub night_quantity: i64,
    pub uav_type: String,
    pub asset_kind: String,
    pub components_json: String,
    pub assigned_quantity: i64,
    pub weapon_kind: String,
    pub measurement_unit: String,
    pub stock_quantity: f64,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentDraft {
    pub category: String,
    pub name: String,
    pub inventory_number: String,
    pub status: String,
    pub crew_id: Option<i64>,
    pub personnel_id: Option<i64>,
    pub total_quantity: i64,
    pub day_quantity: i64,
    pub night_quantity: i64,
    #[serde(default)]
    pub uav_type: String,
    #[serde(default = "default_asset_kind")]
    pub asset_kind: String,
    #[serde(default)]
    pub components_json: String,
    #[serde(default)]
    pub assigned_quantity: i64,
    #[serde(default = "default_weapon_kind")]
    pub weapon_kind: String,
    #[serde(default = "default_measurement_unit")]
    pub measurement_unit: String,
    #[serde(default)]
    pub stock_quantity: f64,
    pub notes: String,
}

fn default_asset_kind() -> String {
    "aircraft".into()
}

fn default_weapon_kind() -> String {
    "weapon".into()
}

fn default_measurement_unit() -> String {
    "шт".into()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopProduct {
    pub id: i64,
    pub name: String,
    pub quantity: f64,
    pub measurement_unit: String,
    pub ingredients: Vec<WorkshopIngredient>,
    pub notes: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopIngredient {
    pub equipment_id: i64,
    #[serde(default)]
    pub equipment_name: String,
    pub quantity: f64,
    #[serde(default)]
    pub measurement_unit: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopDraft {
    pub name: String,
    pub quantity: f64,
    pub measurement_unit: String,
    pub ingredients: Vec<WorkshopIngredient>,
    pub notes: String,
    #[serde(default)]
    pub accounted_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Incident {
    pub id: i64,
    pub category: String,
    pub incident_type: String,
    pub status: String,
    pub occurred_at: String,
    pub crew_id: Option<i64>,
    pub crew_name: Option<String>,
    pub equipment_id: Option<i64>,
    pub equipment_name: Option<String>,
    pub equipment_ids: Vec<i64>,
    pub equipment_names: Vec<String>,
    pub personnel_ids: Vec<i64>,
    pub personnel_names: Vec<String>,
    pub position_name: String,
    pub reconnaissance_area: String,
    pub crew_snapshot: String,
    pub vehicle_name: String,
    pub description: String,
    pub immediate_actions: String,
    pub consequences: String,
    pub flight_stage: String,
    pub preliminary_cause: String,
    pub snapshot_source: String,
    pub reported_to: String,
    pub reported_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncidentDraft {
    #[serde(default)]
    pub category: String,
    pub incident_type: String,
    #[serde(default)]
    pub status: String,
    pub occurred_at: String,
    pub crew_id: Option<i64>,
    pub equipment_id: Option<i64>,
    #[serde(default)]
    pub equipment_ids: Vec<i64>,
    #[serde(default)]
    pub personnel_ids: Vec<i64>,
    pub position_name: String,
    pub reconnaissance_area: String,
    pub description: String,
    #[serde(default)]
    pub immediate_actions: String,
    #[serde(default)]
    pub consequences: String,
    #[serde(default)]
    pub flight_stage: String,
    #[serde(default)]
    pub preliminary_cause: String,
    #[serde(default)]
    pub snapshot_source: String,
    #[serde(default)]
    pub reported_to: String,
    #[serde(default)]
    pub reported_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightJournalEntry {
    pub id: i64,
    pub flight_date: String,
    pub sky_time: String,
    pub ground_time: String,
    pub crew_id: Option<i64>,
    pub crew_name: String,
    pub position_id: Option<i64>,
    pub position_name: String,
    pub battle_order: String,
    pub work_strip: String,
    pub uav_id: Option<i64>,
    pub uav_name: String,
    pub uav_type: String,
    pub uav_serial_number: String,
    pub mission: String,
    pub payload_source: String,
    pub payload_id: Option<i64>,
    pub payload_type: String,
    pub payload_serial_number: String,
    pub notes: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightJournalDraft {
    pub flight_date: String,
    #[serde(default)]
    pub sky_time: String,
    #[serde(default)]
    pub ground_time: String,
    pub crew_id: Option<i64>,
    pub crew_name: String,
    pub position_id: Option<i64>,
    #[serde(default)]
    pub position_name: String,
    #[serde(default)]
    pub battle_order: String,
    #[serde(default)]
    pub work_strip: String,
    pub uav_id: Option<i64>,
    #[serde(default)]
    pub uav_name: String,
    #[serde(default)]
    pub uav_type: String,
    #[serde(default)]
    pub uav_serial_number: String,
    #[serde(default)]
    pub mission: String,
    #[serde(default)]
    pub payload_source: String,
    pub payload_id: Option<i64>,
    #[serde(default)]
    pub payload_type: String,
    #[serde(default)]
    pub payload_serial_number: String,
    #[serde(default)]
    pub notes: String,
}
