use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Personnel {
    pub id: i64,
    pub rank: String,
    pub full_name: String,
    pub surname: String,
    pub given_name: String,
    pub patronymic: String,
    pub position: String,
    pub tax_id: String,
    pub birth_date: String,
    pub education_level: String,
    pub education_details: String,
    pub armed_forces_service_start_date: String,
    pub position_assigned_date: String,
    pub position_assignment_order: String,
    pub military_id: String,
    pub assigned_vehicle_name: String,
    pub assigned_vehicle_registration: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonnelDraft {
    pub rank: String,
    pub surname: String,
    pub given_name: String,
    pub patronymic: String,
    pub position: String,
    pub tax_id: String,
    pub birth_date: String,
    pub education_level: String,
    pub education_details: String,
    pub armed_forces_service_start_date: String,
    pub position_assigned_date: String,
    pub position_assignment_order: String,
    pub military_id: String,
    pub assigned_vehicle_name: String,
    pub assigned_vehicle_registration: String,
}

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Personnel> {
    let surname: String = row.get(2)?;
    let given_name: String = row.get(3)?;
    let patronymic: String = row.get(4)?;
    Ok(Personnel {
        id: row.get(0)?, rank: row.get(1)?, full_name: format!("{} {} {}", surname, given_name, patronymic), surname, given_name, patronymic,
        position: row.get(5)?, tax_id: row.get(6)?, birth_date: row.get(7)?, education_level: row.get(8)?, education_details: row.get(9)?,
        armed_forces_service_start_date: row.get(10)?, position_assigned_date: row.get(11)?, position_assignment_order: row.get(12)?,
        military_id: row.get(13)?, assigned_vehicle_name: row.get(14)?, assigned_vehicle_registration: row.get(15)?,
    })
}

pub fn list(connection: &Connection) -> Result<Vec<Personnel>, String> {
    let mut statement = connection.prepare("SELECT id, rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, assigned_vehicle_name, assigned_vehicle_registration FROM personnel ORDER BY surname, given_name")
        .map_err(|_| "Не вдалося відкрити особовий склад. Спробуйте перезапустити програму.".to_string())?;
    let rows = statement.query_map([], map_row)
        .map_err(|_| "Не вдалося прочитати особовий склад.".to_string())?;
    rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати один із записів особового складу.".to_string())
}

pub fn create(connection: &Connection, draft: PersonnelDraft) -> Result<Personnel, String> {
    validate(&draft)?;
    connection.execute("INSERT INTO personnel (rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, assigned_vehicle_name, assigned_vehicle_registration) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)", params![draft.rank, draft.surname, draft.given_name, draft.patronymic, draft.position, draft.tax_id, draft.birth_date, draft.education_level, draft.education_details, draft.armed_forces_service_start_date, draft.position_assigned_date, draft.position_assignment_order, draft.military_id, draft.assigned_vehicle_name, draft.assigned_vehicle_registration])
        .map_err(|_| "Не вдалося зберегти військовослужбовця. Перевірте унікальність ІПН.".to_string())?;
    find(connection, connection.last_insert_rowid())
}

pub fn update(connection: &Connection, id: i64, draft: PersonnelDraft) -> Result<Personnel, String> {
    validate(&draft)?;
    let updated = connection.execute("UPDATE personnel SET rank=?1, surname=?2, given_name=?3, patronymic=?4, position=?5, tax_id=?6, birth_date=?7, education_level=?8, education_details=?9, armed_forces_service_start_date=?10, position_assigned_date=?11, position_assignment_order=?12, military_id=?13, assigned_vehicle_name=?14, assigned_vehicle_registration=?15, updated_at=CURRENT_TIMESTAMP WHERE id=?16", params![draft.rank, draft.surname, draft.given_name, draft.patronymic, draft.position, draft.tax_id, draft.birth_date, draft.education_level, draft.education_details, draft.armed_forces_service_start_date, draft.position_assigned_date, draft.position_assignment_order, draft.military_id, draft.assigned_vehicle_name, draft.assigned_vehicle_registration, id])
        .map_err(|_| "Не вдалося оновити військовослужбовця.".to_string())?;
    if updated == 0 { return Err("Військовослужбовця не знайдено. Оновіть список і спробуйте знову.".to_string()); }
    find(connection, id)
}

fn find(connection: &Connection, id: i64) -> Result<Personnel, String> {
    connection.query_row("SELECT id, rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, assigned_vehicle_name, assigned_vehicle_registration FROM personnel WHERE id=?1", [id], map_row)
        .map_err(|_| "Не вдалося знайти збережений запис.".to_string())
}

fn validate(draft: &PersonnelDraft) -> Result<(), String> {
    if [draft.rank.as_str(), draft.surname.as_str(), draft.given_name.as_str(), draft.position.as_str()].iter().any(|value| value.trim().is_empty()) { return Err("Заповніть звання, прізвище, ім'я та посаду.".to_string()); }
    if draft.tax_id.len() != 10 || !draft.tax_id.chars().all(|character| character.is_ascii_digit()) { return Err("ІПН має містити рівно 10 цифр.".to_string()); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;

    fn valid_draft() -> PersonnelDraft {
        PersonnelDraft { rank: "Солдат".into(), surname: "ТЕСТ".into(), given_name: "Іван".into(), patronymic: "Іванович".into(), position: "Стрілець, в/ч А0000".into(), tax_id: "7462389899".into(), birth_date: "01.01.2000 року".into(), education_level: "вища".into(), education_details: "Університет".into(), armed_forces_service_start_date: "із 01.01.2022 року".into(), position_assigned_date: "01.01.2023 року".into(), position_assignment_order: "№1".into(), military_id: "АВ №000001".into(), assigned_vehicle_name: "Great Wall".into(), assigned_vehicle_registration: "АВ 0001".into() }
    }

    #[test]
    fn saves_and_reads_valid_personnel() { let connection = Connection::open_in_memory().unwrap(); database::initialise(&connection).unwrap(); let saved = create(&connection, valid_draft()).unwrap(); assert_eq!(saved.full_name, "ТЕСТ Іван Іванович"); assert_eq!(list(&connection).unwrap().len(), 4); }

    #[test]
    fn rejects_invalid_tax_id() { let mut draft = valid_draft(); draft.tax_id = "123".into(); assert_eq!(validate(&draft).unwrap_err(), "ІПН має містити рівно 10 цифр."); }
}
