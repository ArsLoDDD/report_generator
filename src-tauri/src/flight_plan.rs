use crate::AppState;
use rusqlite::{Connection, OptionalExtension};
use serde::Deserialize;
use std::{
    fs::File,
    io::{Cursor, Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

const TEMPLATE: &[u8] = include_bytes!("../resources/flight-plan-template.xlsx");

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanWeather {
    temperature: String,
    wind_from: String,
    wind_to: String,
    gust_from: String,
    gust_to: String,
    cloudiness: String,
    cloud_height: String,
    precipitation: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanEntry {
    crew_id: i64,
    #[serde(default)]
    actual_commander_id: Option<i64>,
    #[serde(default)]
    actual_vehicle_id: Option<i64>,
    weather: FlightPlanWeather,
    route_points: Vec<String>,
    altitude_from: String,
    altitude_to: String,
    area_points: Vec<String>,
    task: String,
    start_time: String,
    end_time: String,
    #[serde(default)]
    uav_selections: Vec<FlightPlanUavSelection>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlightPlanUavSelection {
    equipment_id: i64,
    day_quantity: i64,
    night_quantity: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanRequest {
    unit_name: String,
    entries: Vec<FlightPlanEntry>,
}

#[derive(Debug, Clone)]
struct PersonLine {
    id: i64,
    full_name: String,
    rank: String,
    position: String,
    callsign: String,
}

#[derive(Debug, Clone)]
struct ExportRow {
    values: [String; 14],
    start: f64,
    end: f64,
}

fn esc(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn inline_cell(column: char, row: usize, value: &str, style: usize) -> String {
    format!(
        r#"<c r="{column}{row}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{}</t></is></c>"#,
        esc(value)
    )
}

fn number_cell(column: char, row: usize, value: f64, style: usize) -> String {
    format!(r#"<c r="{column}{row}" s="{style}" t="n"><v>{value}</v></c>"#)
}

fn short_rank(rank: &str) -> String {
    match rank.trim().to_lowercase().as_str() {
        "солдат" => "сол.".into(),
        "старший солдат" => "ст. сол.".into(),
        "молодший сержант" => "мол. серж.".into(),
        "сержант" => "серж.".into(),
        "старший сержант" => "ст. серж.".into(),
        "головний сержант" => "гол. серж.".into(),
        "штаб-сержант" => "штаб-серж.".into(),
        "майстер-сержант" => "майстер-серж.".into(),
        "старший майстер-сержант" => "ст. майстер-серж.".into(),
        "головний майстер-сержант" => "гол. майстер-серж.".into(),
        "молодший лейтенант" => "мол. лейт.".into(),
        "лейтенант" => "лейт.".into(),
        "старший лейтенант" => "ст. лейт.".into(),
        "капітан" => "кап.".into(),
        "підполковник" => "підполк.".into(),
        "полковник" => "полк.".into(),
        _ => rank.trim().to_string(),
    }
}

fn display_name(value: &str) -> String {
    let mut words = value.split_whitespace();
    let surname = words.next().unwrap_or_default().to_uppercase();
    let initials = words
        .take(2)
        .filter_map(|word| word.chars().next())
        .map(|letter| format!("{letter}."))
        .collect::<String>();
    format!("{surname} {initials}").trim().to_string()
}

fn person_text(person: &PersonLine) -> String {
    format!(
        "{} {} ({})",
        short_rank(&person.rank),
        display_name(&person.full_name),
        person.callsign.trim()
    )
    .trim()
    .to_string()
}

fn parse_time(value: &str) -> Result<f64, String> {
    let (hours, minutes) = value
        .trim()
        .split_once(':')
        .ok_or_else(|| "Час має бути у форматі ГГ:ХХ.".to_string())?;
    let hours = hours
        .parse::<u32>()
        .map_err(|_| "Некоректна година у плані польотів.".to_string())?;
    let minutes = minutes
        .parse::<u32>()
        .map_err(|_| "Некоректні хвилини у плані польотів.".to_string())?;
    if hours > 23 || minutes > 59 {
        return Err("Час у плані польотів виходить за межі доби.".into());
    }
    Ok(f64::from(hours * 60 + minutes) / 1440.0)
}

fn list_members(
    connection: &Connection,
    crew_id: i64,
    actual: bool,
) -> Result<Vec<PersonLine>, String> {
    let source = if actual {
        "crew_actual_members"
    } else {
        "crew_members"
    };
    let active = if actual {
        ""
    } else {
        " AND membership.left_at IS NULL"
    };
    let query = format!("SELECT p.id,trim(p.surname||' '||p.given_name||' '||p.patronymic),p.rank,p.position,COALESCE(p.callsign,'') FROM {source} membership JOIN personnel p ON p.id=membership.personnel_id WHERE membership.crew_id=?1{active} ORDER BY CASE WHEN lower(p.position) LIKE '%командир%' THEN 0 ELSE 1 END,p.id");
    connection
        .prepare(&query)
        .map_err(|e| e.to_string())?
        .query_map([crew_id], |row| {
            Ok(PersonLine {
                id: row.get(0)?,
                full_name: row.get(1)?,
                rank: row.get(2)?,
                position: row.get(3)?,
                callsign: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn linked_assets(
    connection: &Connection,
    crew_id: i64,
    table: &str,
) -> Result<Vec<(String, String)>, String> {
    let query = if table == "vehicles" {
        "SELECT name,registration_number FROM vehicles WHERE crew_id=?1 ORDER BY id"
    } else {
        "SELECT name,inventory_number FROM equipment WHERE crew_id=?1 AND category='uav' ORDER BY id"
    };
    connection
        .prepare(query)
        .map_err(|e| e.to_string())?
        .query_map([crew_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn clean_points(points: &[String]) -> String {
    points
        .iter()
        .map(|point| point.trim().to_uppercase())
        .filter(|point| !point.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

fn build_rows(
    connection: &Connection,
    request: &FlightPlanRequest,
) -> Result<Vec<ExportRow>, String> {
    if request.entries.is_empty() {
        return Err("Оберіть хоча б один екіпаж для плану польотів.".into());
    }
    let mut rows = Vec::with_capacity(request.entries.len());
    for (index, entry) in request.entries.iter().enumerate() {
        let weather = &entry.weather;
        let weather_text = format!("Згідно прогнозу UAV Forecast {} С, вітер від {} до {} м/с, пориви від {} до {} м/с. Хмарність {} % {} м. Вірогідність опадів {} %", weather.temperature.trim(), weather.wind_from.trim(), weather.wind_to.trim(), weather.gust_from.trim(), weather.gust_to.trim(), weather.cloudiness.trim(), weather.cloud_height.trim(), weather.precipitation.trim());
        let crew = connection.query_row(
            "SELECT c.name,COALESCE(primary_uav.name,c.uav_name),COALESCE(primary_uav.inventory_number,''),COALESCE(p.name,c.position_name),COALESCE(p.battle_order,c.battle_order),COALESCE(p.locality,c.reconnaissance_area) FROM crews c LEFT JOIN positions p ON p.id=c.position_id LEFT JOIN equipment primary_uav ON primary_uav.id=c.primary_uav_id AND primary_uav.crew_id=c.id WHERE c.id=?1",
            [entry.crew_id], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,String>(5)?)),
        ).optional().map_err(|e| e.to_string())?.ok_or_else(|| "Один з екіпажів плану більше не існує.".to_string())?;
        let actual = list_members(connection, entry.crew_id, true)?;
        let official = list_members(connection, entry.crew_id, false)?;
        let mut all = official.clone();
        for member in &actual {
            if !all.iter().any(|item| item.full_name == member.full_name) {
                all.push(member.clone());
            }
        }
        let missing = all
            .iter()
            .filter(|member| member.callsign.trim().is_empty())
            .map(|member| display_name(&member.full_name))
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Err(format!(
                "Не можна сформувати план: в екіпажі «{}» немає позивних у: {}.",
                crew.0,
                missing.join(", ")
            ));
        }
        let commander = entry
            .actual_commander_id
            .and_then(|id| actual.iter().find(|member| member.id == id))
            .or_else(|| {
                actual
                    .iter()
                    .find(|member| member.position.to_lowercase().contains("командир"))
                    .or_else(|| actual.first())
            });
        let mut uavs = Vec::<(String, String, i64, i64)>::new();
        for selected in &entry.uav_selections {
            let row=connection.query_row("SELECT name,inventory_number,total_quantity FROM equipment WHERE id=?1 AND crew_id=?2 AND category='uav'",rusqlite::params![selected.equipment_id,entry.crew_id],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,i64>(2)?))).optional().map_err(|e|e.to_string())?.ok_or_else(||"Один з вибраних БпЛА більше не закріплений за цим екіпажем.".to_string())?;
            let day = selected.day_quantity.max(0);
            let night = selected.night_quantity.max(0);
            if day + night > row.2 {
                return Err(format!(
                    "Для БпЛА «{}» вибрано більше одиниць, ніж закріплено за екіпажем.",
                    row.0
                ));
            }
            uavs.push((row.0, row.1, day, night));
        }
        let mut vehicles = linked_assets(connection, entry.crew_id, "vehicles")?;
        if vehicles.len() > 1 {
            let selected_id = entry
                .actual_vehicle_id
                .ok_or_else(|| format!("Оберіть фактичний автомобіль екіпажу «{}».", crew.0))?;
            vehicles = connection
                .query_row(
                    "SELECT name,registration_number FROM vehicles WHERE id=?1 AND crew_id=?2",
                    rusqlite::params![selected_id, entry.crew_id],
                    |row| Ok(vec![(row.get(0)?, row.get(1)?)]),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .ok_or_else(|| {
                    "Вибраний автомобіль більше не закріплений за екіпажем.".to_string()
                })?;
        }
        let uav_column = [crew.1.to_uppercase(), crew.2.to_uppercase()]
            .into_iter()
            .filter(|item| !item.trim().is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        let day_uavs: i64 = uavs.iter().map(|(_, _, day, _)| day).sum();
        let night_uavs: i64 = uavs.iter().map(|(_, _, _, night)| night).sum();
        let total_uavs = day_uavs + night_uavs;
        let mut support = Vec::new();
        if total_uavs > 0 {
            let period = if day_uavs > 0 && night_uavs > 0 {
                "денні/ніч"
            } else if day_uavs > 0 {
                "денні"
            } else {
                "ніч"
            };
            support.push(format!("БпЛА {period} - {total_uavs} шт"));
        }
        support.extend(
            vehicles.iter().map(|(name, number)| {
                format!("{}\n{}", name.to_uppercase(), number.to_uppercase())
            }),
        );
        let route = clean_points(&entry.route_points);
        let area = clean_points(&entry.area_points);
        let altitude = format!(
            "{}-{}м",
            entry.altitude_from.trim(),
            entry.altitude_to.trim()
        );
        let task = if entry.task.trim().is_empty() {
            "Розвідка противника та місцевості"
        } else {
            entry.task.trim()
        };
        let values = [
            (index + 1).to_string(),
            request.unit_name.trim().to_string(),
            uav_column,
            if crew.3.trim().is_empty() {
                crew.0.to_uppercase()
            } else {
                format!("{}\n({})", crew.0.to_uppercase(), crew.3.to_uppercase())
            },
            crew.4,
            commander.map(person_text).unwrap_or_default(),
            actual
                .iter()
                .map(person_text)
                .collect::<Vec<_>>()
                .join("\n"),
            weather_text,
            format!("{route}\n{altitude}"),
            if area.is_empty() {
                crew.5.to_uppercase()
            } else {
                area
            },
            format!("Бойове чергування, {}", task.to_lowercase()),
            support.join("\n"),
            String::new(),
            String::new(),
        ];
        rows.push(ExportRow {
            values,
            start: parse_time(&entry.start_time)?,
            end: parse_time(&entry.end_time)?,
        });
    }
    Ok(rows)
}

fn worksheet(rows: &[ExportRow]) -> String {
    let last = rows.len() + 2;
    let mut xml = format!(
        r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr filterMode="false"><pageSetUpPr fitToPage="true"/></sheetPr><dimension ref="A1:N{last}"/><sheetViews><sheetView showGridLines="false" zoomScale="40" zoomScaleNormal="40" workbookViewId="0"><selection activeCell="A3" sqref="A3"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="8.4453125" defaultRowHeight="15" customHeight="true"/><cols>"#
    );
    for (index, width) in [
        7.0, 13.88, 28.33, 20.33, 17.67, 39.44, 46.44, 34.33, 32.44, 38.44, 28.67, 31.67, 17.0,
        18.44,
    ]
    .iter()
    .enumerate()
    {
        xml.push_str(&format!(
            r#"<col customWidth="true" min="{}" max="{}" style="1" width="{width}"/>"#,
            index + 1,
            index + 1
        ));
    }
    xml.push_str(r#"</cols><sheetData><row r="1" ht="126" customHeight="true">"#);
    for (index, value) in [
        "№ п/п",
        "Підрозділ",
        "Тип БпАК (№ борта)",
        "Найменування екіпажу\n(позиція)",
        "Смуга відпові- дальності \n(кому підпорядко- вано)",
        "Командир екіпажу БпАК, позивний",
        "ПІБ складу екіпажу БпАК",
        "Погодні умови польоту БпЛА",
        "Маршрут та висота польоту на ділянках маршруту",
        "Район виконання завдання (н.п.)",
        "Завдання польоту",
        "Озброєння та техніка, яка задіяна до забезпечення польотів БпАК",
        "Планований час початку завдання",
        "Планований час закінчення завдання",
    ]
    .iter()
    .enumerate()
    {
        xml.push_str(&inline_cell((b'A' + index as u8) as char, 1, value, 2));
    }
    xml.push_str(r#"</row><row r="2" ht="23.25" customHeight="true">"#);
    for index in 0..14 {
        xml.push_str(&number_cell(
            (b'A' + index as u8) as char,
            2,
            (index + 1) as f64,
            3,
        ));
    }
    xml.push_str("</row>");
    for (offset, data) in rows.iter().enumerate() {
        let row = offset + 3;
        let line_count = data.values[6]
            .lines()
            .count()
            .max(data.values[11].lines().count())
            .max(3);
        let height = (line_count * 20).max(90);
        xml.push_str(&format!(
            r#"<row r="{row}" ht="{height}" customHeight="true">"#
        ));
        for index in 0..12 {
            let style = match index {
                1 => 5,
                10 => 6,
                11 => 7,
                _ => 4,
            };
            xml.push_str(&inline_cell(
                (b'A' + index as u8) as char,
                row,
                &data.values[index],
                style,
            ));
        }
        xml.push_str(&number_cell('M', row, data.start, 8));
        xml.push_str(&number_cell('N', row, data.end, 9));
        xml.push_str("</row>");
    }
    xml.push_str(r#"</sheetData><printOptions headings="false" gridLines="false"/><pageMargins left="0.708333333333333" right="0.708333333333333" top="0.747916666666667" bottom="0.747916666666667" header="0.511811023622047" footer="0.511805555555556"/><pageSetup paperSize="1" scale="100" fitToWidth="1" fitToHeight="1" pageOrder="downThenOver" orientation="landscape" horizontalDpi="300" verticalDpi="300" copies="1"/><headerFooter><oddFooter>&amp;C&amp;&quot;Helvetica Neue,Regular&quot;&amp;12&amp;K000000&amp;P</oddFooter></headerFooter></worksheet>"#);
    xml
}

fn write_workbook(path: &Path, rows: &[ExportRow]) -> Result<(), String> {
    let mut source = ZipArchive::new(Cursor::new(TEMPLATE)).map_err(|e| e.to_string())?;
    let output =
        File::create(path).map_err(|_| "Не вдалося створити файл плану польотів.".to_string())?;
    let mut target = ZipWriter::new(output);
    for index in 0..source.len() {
        let mut entry = source.by_index(index).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        target
            .start_file(
                &name,
                SimpleFileOptions::default().compression_method(entry.compression()),
            )
            .map_err(|e| e.to_string())?;
        if name == "xl/worksheets/sheet1.xml" {
            target
                .write_all(worksheet(rows).as_bytes())
                .map_err(|e| e.to_string())?;
        } else {
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            target.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }
    target.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn export_flight_plan_excel(
    state: tauri::State<AppState>,
    path: String,
    request: FlightPlanRequest,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let rows = build_rows(&database.connection, &request)?;
    write_workbook(Path::new(&path), &rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;

    #[test]
    fn fills_the_reference_template_and_keeps_excel_times_numeric() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,callsign) VALUES(1,'капітан','ТЕСТОВИЙ','Тест','Тестович','командир екіпажу','1','','','','','','','','СОКІЛ')", []).unwrap();
        connection
            .execute(
                "INSERT INTO crews(id,name,uav_name,uav_type) VALUES(1,'БАРС','MAVIC 3','Коптер')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,1)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO crew_actual_members(crew_id,personnel_id) VALUES(1,1)",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO equipment(id,category,name,inventory_number,crew_id,total_quantity,day_quantity,night_quantity) VALUES(7,'uav','SHARK','UAV-02',1,4,2,2)",[]).unwrap();
        let request = FlightPlanRequest {
            unit_name: "РБПАК".into(),
            entries: vec![FlightPlanEntry {
                crew_id: 1,
                actual_commander_id: Some(1),
                actual_vehicle_id: None,
                weather: FlightPlanWeather {
                    temperature: "20".into(),
                    wind_from: "2".into(),
                    wind_to: "4".into(),
                    gust_from: "5".into(),
                    gust_to: "7".into(),
                    cloudiness: "30".into(),
                    cloud_height: "1200".into(),
                    precipitation: "10".into(),
                },
                route_points: vec!["Охтирка".into(), "Тростянець".into()],
                altitude_from: "800".into(),
                altitude_to: "1100".into(),
                area_points: vec!["Боромля".into()],
                task: "Розвідка противника та місцевості".into(),
                start_time: "05:00".into(),
                end_time: "21:00".into(),
                uav_selections: vec![FlightPlanUavSelection {
                    equipment_id: 7,
                    day_quantity: 2,
                    night_quantity: 2,
                }],
            }],
        };
        let rows = build_rows(&connection, &request).unwrap();
        let path = std::env::temp_dir().join(format!("flight-plan-{}.xlsx", std::process::id()));
        write_workbook(&path, &rows).unwrap();
        let mut archive = ZipArchive::new(File::open(&path).unwrap()).unwrap();
        let mut xml = String::new();
        archive
            .by_name("xl/worksheets/sheet1.xml")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        assert!(
            xml.contains("РБПАК")
                && xml.contains("ОХТИРКА, ТРОСТЯНЕЦЬ")
                && xml.contains("800-1100м")
        );
        assert!(xml.contains("ТЕСТОВИЙ Т.Т.") && xml.contains("БпЛА денні/ніч - 4 шт"));
        assert!(xml.contains("r=\"M3\" s=\"8\" t=\"n\"") && xml.contains("0.20833333333333334"));
        if let Ok(destination) = std::env::var("FLIGHT_PLAN_TEST_OUTPUT") {
            std::fs::copy(&path, destination).unwrap();
        }
        let _ = std::fs::remove_file(path);
    }
}
