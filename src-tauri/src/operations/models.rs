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
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Incident {
    pub id: i64,
    pub incident_type: String,
    pub occurred_at: String,
    pub crew_id: Option<i64>,
    pub crew_name: Option<String>,
    pub equipment_id: Option<i64>,
    pub equipment_name: Option<String>,
    pub position_name: String,
    pub reconnaissance_area: String,
    pub crew_snapshot: String,
    pub vehicle_name: String,
    pub description: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncidentDraft {
    pub incident_type: String,
    pub occurred_at: String,
    pub crew_id: Option<i64>,
    pub equipment_id: Option<i64>,
    pub position_name: String,
    pub reconnaissance_area: String,
    pub description: String,
}
