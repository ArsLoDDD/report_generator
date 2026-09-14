use crate::{
    document_commands::open_path, report_generation::create_template_from_literal_replacements,
    AppState,
};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use zip::{
    read::ZipArchive,
    write::{SimpleFileOptions, ZipWriter},
    CompressionMethod,
};

const TEMPLATE: &[u8] = include_bytes!("../resources/summary-report-template.docx");

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryShellingRow {
    pub time: String,
    pub shelling_type: String,
    pub target: String,
    pub direction: String,
    pub response: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryReportDocument {
    pub values: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub shelling_rows: Vec<SummaryShellingRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryReportDraftState {
    current: Option<String>,
    previous: Option<String>,
}

fn temp_path(extension: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "summary-report-{}-{nonce}.{extension}",
        std::process::id()
    ))
}

fn valid_date(value: &str) -> bool {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

#[tauri::command]
pub fn load_summary_report_draft(
    state: tauri::State<AppState>,
    report_date: String,
) -> Result<SummaryReportDraftState, String> {
    if !valid_date(&report_date) {
        return Err("Некоректна дата підсумкового донесення.".into());
    }
    let db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let current = db
        .connection
        .query_row(
            "SELECT manual_json FROM summary_report_drafts WHERE report_date=?1",
            [&report_date],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Не вдалося прочитати підсумкове донесення.".to_string())?;
    let previous = db.connection.query_row("SELECT manual_json FROM summary_report_drafts WHERE report_date<?1 ORDER BY report_date DESC LIMIT 1", [&report_date], |row| row.get(0)).optional().map_err(|_| "Не вдалося прочитати попереднє донесення.".to_string())?;
    Ok(SummaryReportDraftState { current, previous })
}

#[tauri::command]
pub fn save_summary_report_draft(
    state: tauri::State<AppState>,
    report_date: String,
    manual_json: String,
) -> Result<(), String> {
    if !valid_date(&report_date) {
        return Err("Некоректна дата підсумкового донесення.".into());
    }
    serde_json::from_str::<serde_json::Value>(&manual_json)
        .map_err(|_| "Пошкоджені параметри підсумкового донесення.".to_string())?;
    let db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    db.connection.execute("INSERT INTO summary_report_drafts(report_date,manual_json) VALUES(?1,?2) ON CONFLICT(report_date) DO UPDATE SET manual_json=excluded.manual_json,updated_at=CURRENT_TIMESTAMP", rusqlite::params![report_date,manual_json]).map_err(|_| "Не вдалося зберегти підсумкове донесення.".to_string())?;
    Ok(())
}

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn shelling_row(number: usize, row: Option<&SummaryShellingRow>) -> String {
    let values = row
        .map(|item| {
            vec![
                number.to_string(),
                item.time.clone(),
                item.shelling_type.clone(),
                item.target.clone(),
                item.direction.clone(),
                item.response.clone(),
            ]
        })
        .unwrap_or_else(|| vec!["-".into(); 6]);
    let widths = [500, 1100, 1050, 2050, 2200, 1900];
    let cells = values.into_iter().zip(widths).map(|(value,width)| format!("<w:tc><w:tcPr><w:tcW w:w=\"{width}\" w:type=\"dxa\"/><w:vAlign w:val=\"center\"/></w:tcPr><w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\"/><w:sz w:val=\"22\"/></w:rPr><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p></w:tc>", escape(if value.trim().is_empty() { "-" } else { &value }))).collect::<String>();
    format!("<w:tr>{cells}</w:tr>")
}

fn replace_shelling_rows(path: &Path, rows: &[SummaryShellingRow]) -> Result<(), String> {
    let source = temp_path("docx");
    fs::rename(path, &source)
        .map_err(|_| "Не вдалося підготувати таблицю обстрілів.".to_string())?;
    let result = (|| {
        let mut archive = ZipArchive::new(
            fs::File::open(&source).map_err(|_| "Не вдалося прочитати донесення.".to_string())?,
        )
        .map_err(|_| "Некоректний DOCX підсумкового донесення.".to_string())?;
        let mut writer = ZipWriter::new(
            fs::File::create(path).map_err(|_| "Не вдалося записати донесення.".to_string())?,
        );
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|_| "Не вдалося прочитати DOCX.".to_string())?;
            let name = entry.name().to_string();
            let options =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            if entry.is_dir() {
                writer
                    .add_directory(name, options)
                    .map_err(|_| "Не вдалося записати DOCX.".to_string())?;
                continue;
            }
            let mut bytes = Vec::new();
            entry
                .read_to_end(&mut bytes)
                .map_err(|_| "Не вдалося прочитати DOCX.".to_string())?;
            writer
                .start_file(&name, options)
                .map_err(|_| "Не вдалося записати DOCX.".to_string())?;
            if name == "word/document.xml" {
                let mut xml =
                    String::from_utf8(bytes).map_err(|_| "Некоректний текст DOCX.".to_string())?;
                let marker = "{{shelling_rows}}";
                let marker_pos = xml
                    .find(marker)
                    .ok_or_else(|| "У шаблоні не знайдено таблицю обстрілів.".to_string())?;
                let start = xml[..marker_pos]
                    .rfind("<w:tr>")
                    .ok_or_else(|| "Некоректна таблиця обстрілів.".to_string())?;
                let end = marker_pos
                    + xml[marker_pos..]
                        .find("</w:tr>")
                        .ok_or_else(|| "Некоректна таблиця обстрілів.".to_string())?
                    + "</w:tr>".len();
                let replacement = if rows.is_empty() {
                    shelling_row(0, None)
                } else {
                    rows.iter()
                        .enumerate()
                        .map(|(index, row)| shelling_row(index + 1, Some(row)))
                        .collect()
                };
                xml.replace_range(start..end, &replacement);
                writer
                    .write_all(xml.as_bytes())
                    .map_err(|_| "Не вдалося записати таблицю обстрілів.".to_string())?;
            } else {
                writer
                    .write_all(&bytes)
                    .map_err(|_| "Не вдалося записати DOCX.".to_string())?;
            }
        }
        writer
            .finish()
            .map_err(|_| "Не вдалося завершити DOCX.".to_string())?;
        Ok(())
    })();
    let _ = fs::remove_file(source);
    result
}

fn build_document(output: &Path, document: &SummaryReportDocument) -> Result<(), String> {
    let template_path = temp_path("docx");
    fs::write(&template_path, TEMPLATE)
        .map_err(|_| "Не вдалося підготувати шаблон донесення.".to_string())?;
    let replacements = document
        .values
        .iter()
        .map(|(key, value)| (format!("{{{{{key}}}}}"), value.clone(), None))
        .collect::<Vec<_>>();
    let result = create_template_from_literal_replacements(&template_path, output, &replacements)
        .and_then(|_| replace_shelling_rows(output, &document.shelling_rows));
    let _ = fs::remove_file(template_path);
    result
}

#[tauri::command]
pub fn render_summary_report_preview(document: SummaryReportDocument) -> Result<Vec<u8>, String> {
    let output = temp_path("docx");
    let result = build_document(&output, &document).and_then(|_| {
        fs::read(&output).map_err(|_| "Не вдалося прочитати перегляд донесення.".to_string())
    });
    let _ = fs::remove_file(output);
    result
}

#[tauri::command]
pub fn export_summary_report(path: String, document: SummaryReportDocument) -> Result<(), String> {
    let output = Path::new(&path);
    if !output
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("docx"))
    {
        return Err("Підсумкове донесення потрібно зберегти у форматі DOCX.".into());
    }
    build_document(output, &document)
}

#[tauri::command]
pub fn open_summary_report(path: String) -> Result<(), String> {
    let output = PathBuf::from(path);
    if !output.is_file()
        || !output
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("docx"))
    {
        return Err("Файл підсумкового донесення не знайдено.".into());
    }
    open_path(&output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn creates_a_docx_without_template_markers() {
        let output = temp_path("docx");
        let keys = [
            "recipient",
            "report_number",
            "unit_short_name",
            "military_unit_short_name",
            "ksp_name",
            "ksp_locality",
            "report_date",
            "enemy_losses",
            "composition_changes",
            "force_composition",
            "completeness",
            "positions",
            "enemy_actions",
            "assault_actions",
            "battalion_short_name",
            "period_start_date",
            "period_end_date",
            "flight_count",
            "flight_operations",
            "ksp_mgrs",
            "command_duties",
            "guard_duties",
            "period_events",
            "commissions",
            "fortification",
            "dzvin",
            "next_tasks",
            "personnel_losses",
            "equipment_losses",
            "equipment_losses_details",
            "ammunition_expenses",
            "problems",
            "other_issues",
            "signer_position",
            "signer_rank",
            "signer_given_name",
            "signer_surname",
            "arm_number",
        ];
        let values = keys
            .into_iter()
            .map(|key| (key.to_string(), "Тест".to_string()))
            .collect();
        build_document(
            &output,
            &SummaryReportDocument {
                values,
                shelling_rows: vec![],
            },
        )
        .unwrap();
        let bytes = fs::read(&output).unwrap();
        assert!(bytes.starts_with(b"PK"));
        let mut archive = ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let mut xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        assert!(!xml.contains("{{") && !xml.contains("!"));
        if let Ok(destination) = std::env::var("SUMMARY_REPORT_TEST_OUTPUT") {
            fs::copy(&output, destination).unwrap();
        }
        let _ = fs::remove_file(output);
    }
}
