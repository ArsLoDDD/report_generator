use rusqlite::{params, Connection};

pub fn initialise(connection: &Connection) -> Result<(), String> {
    connection.execute_batch("PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS personnel (id INTEGER PRIMARY KEY, rank TEXT NOT NULL, surname TEXT NOT NULL, given_name TEXT NOT NULL, patronymic TEXT NOT NULL DEFAULT '', position TEXT NOT NULL, tax_id TEXT NOT NULL UNIQUE CHECK(length(tax_id) = 10), birth_date TEXT NOT NULL, education_level TEXT NOT NULL, education_details TEXT NOT NULL, armed_forces_service_start_date TEXT NOT NULL, position_assigned_date TEXT NOT NULL, position_assignment_order TEXT NOT NULL, military_id TEXT NOT NULL, assigned_vehicle_name TEXT NOT NULL, assigned_vehicle_registration TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS personnel_custom_fields (personnel_id INTEGER NOT NULL, field_key TEXT NOT NULL, field_value TEXT NOT NULL, PRIMARY KEY(personnel_id, field_key), FOREIGN KEY(personnel_id) REFERENCES personnel(id) ON DELETE CASCADE); PRAGMA user_version = 1;")
        .map_err(|_| "Не вдалося підготувати базу даних.".to_string())?;
    seed_personnel(connection)
}

fn seed_personnel(connection: &Connection) -> Result<(), String> {
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM personnel", [], |row| row.get(0)).map_err(|_| "Не вдалося перевірити особовий склад.".to_string())?;
    if count > 0 { return Ok(()); }
    let records = [
        ("Солдат", "ВАСИЛЬОК", "Іван", "Аркадійович", "Стрілець, військова частина А0000", "7462389812", "02.03.1999 року", "вища", "Львівська комерційна академія у 2002р", "у ЗС — із 27.02.2022 року", "02.08.2026 року", "КВ ОК «Пуп» №000-ПС", "АВ №077672", "Great Wall", "АВ 7265"),
        ("Старший солдат", "ПЕТРЕНКО", "Петро", "Петрович", "Оператор БпЛА, військова частина А0000", "7462389813", "14.05.1998 року", "середня спеціальна", "Львівський фаховий коледж у 2018р", "у ЗС — із 24.02.2022 року", "10.03.2023 року", "КВ ОК «Пуп» №018-ПС", "АВ №077673", "Mitsubishi L200", "АВ 7266"),
        ("Сержант", "СИДОРЕНКО", "Сидір", "Сидорович", "Командир відділення, військова частина А0000", "7462389814", "21.11.1995 року", "вища", "Національний університет у 2017р", "у ЗС — із 01.09.2018 року", "12.06.2024 року", "КВ ОК «Пуп» №044-ПС", "АВ №077674", "Great Wall", "АВ 7267")
    ];
    for record in records { connection.execute("INSERT INTO personnel (rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, assigned_vehicle_name, assigned_vehicle_registration) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)", params![record.0, record.1, record.2, record.3, record.4, record.5, record.6, record.7, record.8, record.9, record.10, record.11, record.12, record.13, record.14]).map_err(|_| "Не вдалося створити початкові дані.".to_string())?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn creates_schema_and_seed_personnel() { let connection = Connection::open_in_memory().unwrap(); initialise(&connection).unwrap(); let count: i64 = connection.query_row("SELECT COUNT(*) FROM personnel", [], |row| row.get(0)).unwrap(); assert_eq!(count, 3); }
}
