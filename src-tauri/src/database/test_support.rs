use super::*;

#[cfg(test)]
pub fn seed_test_personnel(connection: &Connection) -> Result<(), String> {
    use rusqlite::params;
    let records = [
        (
            "Солдат",
            "ВАСИЛЬОК",
            "Іван",
            "Аркадійович",
            "Стрілець, військова частина А0000",
            "7462389812",
            "02.03.1999 року",
            "вища",
            "Львівська комерційна академія у 2002р",
            "у ЗС — із 27.02.2022 року",
            "02.08.2026 року",
            "КВ ОК «Пуп» №000-ПС",
            "АВ №077672",
            "Great Wall",
            "АВ 7265",
        ),
        (
            "Старший солдат",
            "ПЕТРЕНКО",
            "Петро",
            "Петрович",
            "Оператор БпЛА, військова частина А0000",
            "7462389813",
            "14.05.1998 року",
            "середня спеціальна",
            "Львівський фаховий коледж у 2018р",
            "у ЗС — із 24.02.2022 року",
            "10.03.2023 року",
            "КВ ОК «Пуп» №018-ПС",
            "АВ №077673",
            "Mitsubishi L200",
            "АВ 7266",
        ),
        (
            "Сержант",
            "СИДОРЕНКО",
            "Сидір",
            "Сидорович",
            "Командир відділення, військова частина А0000",
            "7462389814",
            "21.11.1995 року",
            "вища",
            "Національний університет у 2017р",
            "у ЗС — із 01.09.2018 року",
            "12.06.2024 року",
            "КВ ОК «Пуп» №044-ПС",
            "АВ №077674",
            "Great Wall",
            "АВ 7267",
        ),
        (
            "Молодший сержант",
            "КОВАЛЕНКО",
            "Дмитро",
            "Сергійович",
            "Стрілець, військова частина А0000",
            "7462389815",
            "08.08.1997 року",
            "вища",
            "Київський університет у 2019р",
            "у ЗС — із 03.03.2022 року",
            "17.08.2024 року",
            "КВ ОК «Пуп» №053-ПС",
            "АВ №077675",
            "Great Wall",
            "АВ 7268",
        ),
        (
            "Солдат",
            "БОНДАРЕНКО",
            "Андрій",
            "Олексійович",
            "Помічник оператора, військова частина А0000",
            "7462389816",
            "12.02.2000 року",
            "середня",
            "Ліцей №5 у 2017р",
            "у ЗС — із 26.02.2022 року",
            "20.03.2023 року",
            "КВ ОК «Пуп» №024-ПС",
            "АВ №077676",
            "Mitsubishi L200",
            "АВ 7269",
        ),
        (
            "Старший солдат",
            "ТКАЧЕНКО",
            "Олексій",
            "Миколайович",
            "Механік-водій, військова частина А0000",
            "7462389817",
            "05.09.1994 року",
            "середня спеціальна",
            "Автотранспортний коледж у 2014р",
            "у ЗС — із 15.04.2016 року",
            "11.01.2023 року",
            "КВ ОК «Пуп» №012-ПС",
            "АВ №077677",
            "HMMWV",
            "АВ 7270",
        ),
        (
            "Сержант",
            "ШЕВЧЕНКО",
            "Тарас",
            "Григорович",
            "Командир відділення, військова частина А0000",
            "7462389818",
            "17.07.1992 року",
            "вища",
            "Національна академія у 2015р",
            "у ЗС — із 11.10.2014 року",
            "01.03.2024 року",
            "КВ ОК «Пуп» №035-ПС",
            "АВ №077678",
            "Great Wall",
            "АВ 7271",
        ),
        (
            "Солдат",
            "МЕЛЬНИК",
            "Віталій",
            "Васильович",
            "Стрілець, військова частина А0000",
            "7462389819",
            "27.12.1999 року",
            "вища",
            "Тернопільський університет у 2021р",
            "у ЗС — із 28.02.2022 року",
            "14.07.2023 року",
            "КВ ОК «Пуп» №032-ПС",
            "АВ №077679",
            "Mitsubishi L200",
            "АВ 7272",
        ),
        (
            "Солдат",
            "ГНАТЮК",
            "Роман",
            "Ігорович",
            "Стрілець, військова частина А0000",
            "7462389820",
            "19.04.1998 року",
            "середня спеціальна",
            "Фаховий коледж у 2018р",
            "у ЗС — із 25.02.2022 року",
            "08.09.2023 року",
            "КВ ОК «Пуп» №041-ПС",
            "АВ №077680",
            "Great Wall",
            "АВ 7273",
        ),
        (
            "Молодший сержант",
            "КРАВЧУК",
            "Олег",
            "Петрович",
            "Оператор БпЛА, військова частина А0000",
            "7462389821",
            "22.06.1996 року",
            "вища",
            "Львівська політехніка у 2018р",
            "у ЗС — із 12.03.2022 року",
            "21.11.2024 року",
            "КВ ОК «Пуп» №061-ПС",
            "АВ №077681",
            "HMMWV",
            "АВ 7274",
        ),
        (
            "Солдат",
            "ЛИСЕНКО",
            "Максим",
            "Олегович",
            "Стрілець, військова частина А0000",
            "7462389822",
            "03.01.2001 року",
            "середня",
            "Ліцей №2 у 2018р",
            "у ЗС — із 05.03.2022 року",
            "05.05.2024 року",
            "КВ ОК «Пуп» №048-ПС",
            "АВ №077682",
            "Great Wall",
            "АВ 7275",
        ),
        (
            "Старший солдат",
            "РИБАК",
            "Богдан",
            "Васильович",
            "Водій, військова частина А0000",
            "7462389823",
            "28.10.1993 року",
            "середня спеціальна",
            "Технічний коледж у 2013р",
            "у ЗС — із 03.05.2015 року",
            "28.02.2023 року",
            "КВ ОК «Пуп» №017-ПС",
            "АВ №077683",
            "Mitsubishi L200",
            "АВ 7276",
        ),
        (
            "Сержант",
            "ПОЛІЩУК",
            "Владислав",
            "Романович",
            "Командир екіпажу, військова частина А0000",
            "7462389824",
            "09.03.1991 року",
            "вища",
            "Військовий інститут у 2013р",
            "у ЗС — із 19.08.2013 року",
            "04.04.2024 року",
            "КВ ОК «Пуп» №039-ПС",
            "АВ №077684",
            "HMMWV",
            "АВ 7277",
        ),
        (
            "Солдат",
            "САВЧУК",
            "Михайло",
            "Ілліч",
            "Оператор БпЛА, військова частина А0000",
            "7462389825",
            "24.05.2000 року",
            "вища",
            "Харківський університет у 2022р",
            "у ЗС — із 02.03.2022 року",
            "19.01.2025 року",
            "КВ ОК «Пуп» №070-ПС",
            "АВ №077685",
            "Great Wall",
            "АВ 7278",
        ),
        (
            "Старший солдат",
            "ДУБИНА",
            "Артем",
            "Євгенович",
            "Механік-водій, військова частина А0000",
            "7462389826",
            "16.08.1995 року",
            "середня спеціальна",
            "Автомеханічний коледж у 2015р",
            "у ЗС — із 01.06.2017 року",
            "02.02.2024 року",
            "КВ ОК «Пуп» №046-ПС",
            "АВ №077686",
            "Mitsubishi L200",
            "АВ 7279",
        ),
    ];
    for record in records {
        connection.execute("INSERT OR IGNORE INTO personnel (rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)", params![record.0, record.1, record.2, record.3, record.4, record.5, record.6, record.7, record.8, record.9, record.10, record.11, record.12]).map_err(|_| "Не вдалося створити початкові дані.".to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn creates_an_empty_schema_without_demo_records() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM personnel", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_fixtures_are_opt_in() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        seed_test_personnel(&connection).unwrap();
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM personnel", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 15);
    }

    #[test]
    fn canonicalizes_staff_position_once_with_the_unit_in_genitive() {
        assert_eq!(
            canonical_staff_position("Оператор 3 відділення 4 взводу Рота БпАК військової частини А0000 військової частини А0000"),
            "оператор 3 відділення 4 взводу роти бпак військової частини А0000"
        );
    }

    #[test]
    fn migrates_v1_personnel_with_an_empty_gender() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE personnel (id INTEGER PRIMARY KEY, rank TEXT NOT NULL, surname TEXT NOT NULL, given_name TEXT NOT NULL, patronymic TEXT NOT NULL DEFAULT '', position TEXT NOT NULL, tax_id TEXT NOT NULL UNIQUE, birth_date TEXT NOT NULL, education_level TEXT NOT NULL, education_details TEXT NOT NULL, armed_forces_service_start_date TEXT NOT NULL, position_assigned_date TEXT NOT NULL, position_assignment_order TEXT NOT NULL, military_id TEXT NOT NULL, assigned_vehicle_name TEXT NOT NULL, assigned_vehicle_registration TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);").unwrap();
        initialise(&connection).unwrap();
        let gender: String = connection
            .query_row("SELECT gender FROM personnel LIMIT 1", [], |row| row.get(0))
            .unwrap_or_default();
        assert_eq!(gender, "");
        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            4
        );
        let columns = connection
            .prepare("PRAGMA table_info(personnel)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(!columns.contains(&"assigned_vehicle_name".to_string()));
        assert!(!columns.contains(&"assigned_vehicle_registration".to_string()));
    }

    #[test]
    fn migrates_legacy_tax_id_constraint_to_allow_empty_import_values() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE personnel (id INTEGER PRIMARY KEY, rank TEXT NOT NULL, surname TEXT NOT NULL, given_name TEXT NOT NULL, patronymic TEXT NOT NULL DEFAULT '', position TEXT NOT NULL, tax_id TEXT NOT NULL UNIQUE CHECK(length(tax_id) = 10), birth_date TEXT NOT NULL, education_level TEXT NOT NULL, education_details TEXT NOT NULL, armed_forces_service_start_date TEXT NOT NULL, position_assigned_date TEXT NOT NULL, position_assignment_order TEXT NOT NULL, military_id TEXT NOT NULL, gender TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);").unwrap();
        initialise(&connection).unwrap();
        for surname in ["ПЕРШИЙ", "ДРУГИЙ"] {
            connection.execute("INSERT INTO personnel (rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, gender) VALUES ('', ?1, '', '', '', '', '', '', '', '', '', '', '', '')", [surname]).unwrap();
        }
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM personnel WHERE tax_id = ''",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn custom_field_is_seeded_for_existing_personnel() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        seed_test_personnel(&connection).unwrap();
        create_custom_field(
            &connection,
            CustomFieldDefinition {
                field_key: "custom_unit_code".into(),
                display_name: "Код підрозділу".into(),
                description: "Внутрішній код".into(),
                initial_value: "А0000".into(),
                scope: "personnel".into(),
            },
        )
        .unwrap();
        let count: i64 = connection.query_row("SELECT COUNT(*) FROM personnel_custom_fields WHERE field_key='custom_unit_code' AND field_value='А0000'", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 15);
    }

    #[test]
    fn custom_field_can_be_updated_and_deleted() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        create_custom_field(
            &connection,
            CustomFieldDefinition {
                field_key: "unit_name".into(),
                display_name: "Підрозділ".into(),
                description: "Назва".into(),
                initial_value: "А0000".into(),
                scope: "personnel".into(),
            },
        )
        .unwrap();
        let updated = update_custom_field(
            &connection,
            CustomFieldDefinition {
                field_key: "unit_name".into(),
                display_name: "Назва підрозділу".into(),
                description: "Оновлено".into(),
                initial_value: "Б0000".into(),
                scope: "personnel".into(),
            },
        )
        .unwrap();
        assert_eq!(updated.display_name, "Назва підрозділу");
        delete_custom_field(&connection, "unit_name").unwrap();
        assert!(!list_custom_fields(&connection)
            .unwrap()
            .iter()
            .any(|field| field.field_key == "unit_name"));
    }

    #[test]
    fn custom_field_key_does_not_require_a_prefix() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        assert!(create_custom_field(
            &connection,
            CustomFieldDefinition {
                field_key: "unit_name".into(),
                display_name: "Підрозділ".into(),
                description: "".into(),
                initial_value: "".into(),
                scope: "personnel".into()
            }
        )
        .is_ok());
    }

    #[test]
    fn creates_operational_registers_and_keeps_vehicle_crew_relation() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(name) VALUES('Екіпаж 1')", [])
            .unwrap();
        connection.execute("INSERT INTO vehicles(name, registration_number, crew_id) VALUES('Тестове авто', 'АА0001АА', 1)", []).unwrap();
        connection
            .execute(
                "INSERT INTO equipment(category, name, crew_id) VALUES('uav', 'Тестовий БпЛА', 1)",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO incidents(incident_type, crew_id, equipment_id) VALUES('Втрата БпЛА', 1, 1)", []).unwrap();
        let linked: i64 = connection
            .query_row("SELECT COUNT(*) FROM vehicles WHERE crew_id=1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(linked, 1);
        let incident: String = connection
            .query_row("SELECT incident_type FROM incidents", [], |row| row.get(0))
            .unwrap();
        assert_eq!(incident, "Втрата БпЛА");
    }

    #[test]
    fn position_test_fixture_covers_every_kind_without_seeding_production() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(name) VALUES('Екіпаж Тест')", [])
            .unwrap();
        for (index, kind) in [
            "Основна",
            "Основна",
            "Запасна",
            "Запасна",
            "Облаштовується",
            "Облаштовується",
            "Виявлена ворогом",
            "Виявлена ворогом",
            "Зайнята суміжниками",
            "Зайнята суміжниками",
        ]
        .into_iter()
        .enumerate()
        {
            connection.execute(
                "INSERT INTO positions(name,position_type,mgrs,is_active,crew_id) VALUES(?1,?2,?3,?4,?5)",
                rusqlite::params![format!("Позиція {}", index + 1), kind, format!("36U UV {}000 {}000", 10 + index, 60 + index), index == 0, if index == 0 { Some(1_i64) } else { None }],
            ).unwrap();
        }
        let counts = connection.prepare("SELECT position_type,COUNT(*) FROM positions GROUP BY position_type ORDER BY position_type").unwrap().query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))).unwrap().collect::<Result<Vec<_>, _>>().unwrap();
        assert_eq!(counts.len(), 5);
        assert!(counts.iter().all(|(_, count)| *count == 2));
    }

    #[test]
    fn bcs_location_is_limited_to_the_shared_reference() {
        assert!(is_valid_bcs_location(""));
        assert!(is_valid_bcs_location("На позиції"));
        assert!(is_valid_bcs_location("Логістика на позиції"));
        assert!(!is_valid_bcs_location("Довільне місце"));

        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        connection.execute("INSERT INTO temporary_personnel(full_name,arrived_at,current_location) VALUES('Тест','2026-09-07','Довільне місце')", []).unwrap();
        initialise(&connection).unwrap();
        let location: String = connection
            .query_row(
                "SELECT current_location FROM temporary_personnel",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(location.is_empty());
    }
}
