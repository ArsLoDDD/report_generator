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
    #[serde(default)]
    pub blocks: std::collections::HashMap<String, Vec<SummaryBlockLine>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryBlockLine {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub runs: Vec<SummaryBlockRun>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryBlockRun {
    pub text: String,
    #[serde(default)]
    pub bold: bool,
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

fn shelling_row(
    exemplar: &str,
    number: usize,
    row: Option<&SummaryShellingRow>,
) -> Result<String, String> {
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
    let mut generated = with_row_height(exemplar, 402);
    let cells = xml_element_ranges(&generated, "w:tc");
    if cells.len() != values.len() {
        return Err("Некоректний зразковий рядок таблиці обстрілів.".into());
    }
    for (cell, value) in cells.into_iter().zip(values).rev() {
        let original = &generated[cell.clone()];
        let replacement =
            replace_first_text(original, if value.trim().is_empty() { "-" } else { &value })?;
        generated.replace_range(cell, &replacement);
    }
    Ok(generated)
}

fn xml_element(source: &str, tag: &str) -> Option<String> {
    let plain = format!("<{tag}>");
    let attributed = format!("<{tag} ");
    let start = [source.find(&plain), source.find(&attributed)]
        .into_iter()
        .flatten()
        .min()?;
    let opening_end = start + source[start..].find('>')? + 1;
    if source[start..opening_end].ends_with("/>") {
        return Some(source[start..opening_end].to_string());
    }
    let closing = format!("</{tag}>");
    let end = opening_end + source[opening_end..].find(&closing)? + closing.len();
    Some(source[start..end].to_string())
}

fn xml_element_ranges(source: &str, tag: &str) -> Vec<std::ops::Range<usize>> {
    let plain = format!("<{tag}>");
    let attributed = format!("<{tag} ");
    let closing = format!("</{tag}>");
    let mut ranges = Vec::new();
    let mut offset = 0;
    while offset < source.len() {
        let Some(start) = [
            source[offset..].find(&plain),
            source[offset..].find(&attributed),
        ]
        .into_iter()
        .flatten()
        .min()
        .map(|relative| offset + relative) else {
            break;
        };
        let Some(opening_end) = source[start..]
            .find('>')
            .map(|relative| start + relative + 1)
        else {
            break;
        };
        let end = if source[start..opening_end].ends_with("/>") {
            opening_end
        } else if let Some(relative) = source[opening_end..].find(&closing) {
            opening_end + relative + closing.len()
        } else {
            break;
        };
        ranges.push(start..end);
        offset = end;
    }
    ranges
}

fn replace_first_text(source: &str, value: &str) -> Result<String, String> {
    let start = [source.find("<w:t>"), source.find("<w:t ")]
        .into_iter()
        .flatten()
        .min()
        .ok_or_else(|| "У комірці таблиці обстрілів відсутній текст.".to_string())?;
    let content_start = start
        + source[start..]
            .find('>')
            .ok_or_else(|| "Некоректний текст комірки таблиці обстрілів.".to_string())?
        + 1;
    let content_end = content_start
        + source[content_start..]
            .find("</w:t>")
            .ok_or_else(|| "Некоректний текст комірки таблиці обстрілів.".to_string())?;
    let mut result = source.to_string();
    result.replace_range(content_start..content_end, &escape(value));
    Ok(result)
}

fn replace_or_append_xml_element(properties: &str, tag: &str, replacement: &str) -> String {
    if let Some(existing) = xml_element(properties, tag) {
        return properties.replacen(&existing, replacement, 1);
    }
    if properties.ends_with("/>") {
        let root_end = properties[1..]
            .find([' ', '/', '>'])
            .map(|index| index + 1)
            .unwrap_or(properties.len() - 2);
        let root_tag = &properties[1..root_end];
        return format!(
            "{}>{replacement}</{root_tag}>",
            properties.trim_end_matches("/>")
        );
    }
    properties.rfind("</").map_or_else(
        || properties.to_string(),
        |closing_start| {
            format!(
                "{}{replacement}{}",
                &properties[..closing_start],
                &properties[closing_start..]
            )
        },
    )
}

fn marker_run_properties(marker_paragraph: &str, marker: &str) -> Option<String> {
    let marker_pos = marker_paragraph.find(marker)?;
    let start = [
        marker_paragraph[..marker_pos].rfind("<w:r>"),
        marker_paragraph[..marker_pos].rfind("<w:r "),
    ]
    .into_iter()
    .flatten()
    .max()?;
    let end = marker_pos + marker_paragraph[marker_pos..].find("</w:r>")? + "</w:r>".len();
    xml_element(&marker_paragraph[start..end], "w:rPr")
}

fn with_row_height(row: &str, height: u32) -> String {
    let height_xml = format!("<w:trHeight w:val=\"{height}\" w:hRule=\"atLeast\"/>");
    if let Some(existing_height) = xml_element(row, "w:trHeight") {
        return row.replacen(&existing_height, &height_xml, 1);
    }
    if let Some(properties) = xml_element(row, "w:trPr") {
        let properties_with_height = if properties.ends_with("/>") {
            format!(
                "{}>{height_xml}</w:trPr>",
                properties.trim_end_matches("/>")
            )
        } else {
            properties.replacen("</w:trPr>", &format!("{height_xml}</w:trPr>"), 1)
        };
        return row.replacen(&properties, &properties_with_height, 1);
    }
    row.replacen("<w:tr>", &format!("<w:tr><w:trPr>{height_xml}</w:trPr>"), 1)
}

fn stabilize_signer_layout(xml: &mut String) -> Result<(), String> {
    // `docx-preview` renders tab characters as a fixed-width space unless its
    // experimental layout mode is enabled. A borderless, full-width table is
    // deterministic in Word, LibreOffice and the in-app preview: rank stays at
    // the left edge, while the end of `Імʼя ПРІЗВИЩЕ` reaches the right text margin.
    const SIGNER_ROW_WIDTH: u32 = 9632;
    const SIGNER_CELL_WIDTH: u32 = SIGNER_ROW_WIDTH / 2;
    let marker = "{{signer_rank}}";
    let marker_pos = xml
        .find(marker)
        .ok_or_else(|| "У шаблоні не знайдено блок підписанта.".to_string())?;
    let start = [
        xml[..marker_pos].rfind("<w:p>"),
        xml[..marker_pos].rfind("<w:p "),
    ]
    .into_iter()
    .flatten()
    .max()
    .ok_or_else(|| "Некоректний блок підписанта.".to_string())?;
    let end = marker_pos
        + xml[marker_pos..]
            .find("</w:p>")
            .ok_or_else(|| "Некоректний блок підписанта.".to_string())?
        + "</w:p>".len();
    let paragraph = &xml[start..end];
    let mut paragraph_properties = xml_element(paragraph, "w:pPr").unwrap_or_else(|| {
        "<w:pPr><w:pStyle w:val=\"Normal.0\"/><w:spacing w:line=\"240\" w:lineRule=\"auto\"/></w:pPr>"
            .to_string()
    });
    if let Some(tabs) = xml_element(&paragraph_properties, "w:tabs") {
        paragraph_properties = paragraph_properties.replacen(&tabs, "", 1);
    }
    paragraph_properties = replace_or_append_xml_element(
        &paragraph_properties,
        "w:ind",
        "<w:ind w:left=\"0\" w:right=\"0\" w:firstLine=\"0\"/>",
    );
    let left_properties =
        replace_or_append_xml_element(&paragraph_properties, "w:jc", "<w:jc w:val=\"left\"/>");
    let right_properties =
        replace_or_append_xml_element(&paragraph_properties, "w:jc", "<w:jc w:val=\"right\"/>");
    let run_properties = marker_run_properties(paragraph, marker).unwrap_or_default();
    let run_properties = if run_properties.is_empty() {
        String::new()
    } else {
        run_properties
    };
    let replacement = format!(
        "<w:tbl><w:tblPr><w:tblW w:w=\"{SIGNER_ROW_WIDTH}\" w:type=\"dxa\"/><w:jc w:val=\"left\"/><w:tblInd w:w=\"0\" w:type=\"dxa\"/><w:tblBorders><w:top w:val=\"nil\"/><w:left w:val=\"nil\"/><w:bottom w:val=\"nil\"/><w:right w:val=\"nil\"/><w:insideH w:val=\"nil\"/><w:insideV w:val=\"nil\"/></w:tblBorders><w:tblLayout w:type=\"fixed\"/><w:tblCellMar><w:top w:w=\"0\" w:type=\"dxa\"/><w:left w:w=\"0\" w:type=\"dxa\"/><w:bottom w:w=\"0\" w:type=\"dxa\"/><w:right w:w=\"0\" w:type=\"dxa\"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w=\"{SIGNER_CELL_WIDTH}\"/><w:gridCol w:w=\"{SIGNER_CELL_WIDTH}\"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w=\"{SIGNER_CELL_WIDTH}\" w:type=\"dxa\"/><w:vAlign w:val=\"center\"/></w:tcPr><w:p>{left_properties}<w:r>{run_properties}<w:t xml:space=\"preserve\">{{{{signer_rank}}}}</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w=\"{SIGNER_CELL_WIDTH}\" w:type=\"dxa\"/><w:vAlign w:val=\"center\"/></w:tcPr><w:p>{right_properties}<w:r>{run_properties}<w:t xml:space=\"preserve\">{{{{signer_given_name}}}} {{{{signer_surname}}}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"
    );
    xml.replace_range(start..end, &replacement);
    Ok(())
}

fn block_run(text: &str, bold: bool, marker_run_properties: Option<&str>) -> String {
    let mut run_properties = marker_run_properties
        .unwrap_or("<w:rPr></w:rPr>")
        .to_string();
    run_properties = replace_or_append_xml_element(
        &run_properties,
        "w:b",
        if bold {
            "<w:b w:val=\"1\"/>"
        } else {
            "<w:b w:val=\"0\"/>"
        },
    );
    run_properties = replace_or_append_xml_element(
        &run_properties,
        "w:bCs",
        if bold {
            "<w:bCs w:val=\"1\"/>"
        } else {
            "<w:bCs w:val=\"0\"/>"
        },
    );
    format!(
        "<w:r>{run_properties}<w:t xml:space=\"preserve\">{}</w:t></w:r>",
        escape(text)
    )
}

fn block_paragraph_properties(line: &SummaryBlockLine, marker_properties: &str) -> String {
    let indent = match line.kind.as_deref() {
        Some("item") => Some("<w:ind w:left=\"709\" w:hanging=\"283\"/>"),
        Some("continuation") => Some("<w:ind w:left=\"709\"/>"),
        _ => None,
    };
    indent.map_or_else(
        || marker_properties.to_string(),
        |value| replace_or_append_xml_element(marker_properties, "w:ind", value),
    )
}

fn block_paragraph(
    line: &SummaryBlockLine,
    marker_properties: &str,
    marker_run_properties: Option<&str>,
) -> String {
    let paragraph_properties = block_paragraph_properties(line, marker_properties);
    let runs = if line.runs.is_empty() {
        block_run(&line.text, line.bold, marker_run_properties)
    } else {
        line.runs
            .iter()
            .map(|run| block_run(&run.text, run.bold, marker_run_properties))
            .collect::<String>()
    };
    format!("<w:p>{paragraph_properties}{runs}</w:p>")
}

fn replace_rich_blocks(
    path: &Path,
    blocks: &std::collections::HashMap<String, Vec<SummaryBlockLine>>,
) -> Result<(), String> {
    let source = temp_path("docx");
    fs::rename(path, &source)
        .map_err(|_| "Не вдалося підготувати форматовані блоки.".to_string())?;
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
                stabilize_signer_layout(&mut xml)?;
                for (key, lines) in blocks {
                    let marker = format!("{{{{{key}}}}}");
                    let Some(marker_pos) = xml.find(&marker) else {
                        continue;
                    };
                    let start = [
                        xml[..marker_pos].rfind("<w:p>"),
                        xml[..marker_pos].rfind("<w:p "),
                    ]
                    .into_iter()
                    .flatten()
                    .max()
                    .ok_or_else(|| format!("Некоректний блок {key}."))?;
                    let end = marker_pos
                        + xml[marker_pos..]
                            .find("</w:p>")
                            .ok_or_else(|| format!("Некоректний блок {key}."))?
                        + "</w:p>".len();
                    let marker_paragraph = &xml[start..end];
                    let marker_properties = xml_element(marker_paragraph, "w:pPr").unwrap_or_else(|| "<w:pPr><w:pStyle w:val=\"Normal.0\"/><w:spacing w:line=\"240\" w:lineRule=\"auto\"/><w:ind w:firstLine=\"709\"/></w:pPr>".to_string());
                    let marker_run_properties = marker_run_properties(marker_paragraph, &marker);
                    let replacement = lines
                        .iter()
                        .map(|line| {
                            block_paragraph(
                                line,
                                &marker_properties,
                                marker_run_properties.as_deref(),
                            )
                        })
                        .collect::<String>();
                    xml.replace_range(start..end, &replacement);
                }
                writer
                    .write_all(xml.as_bytes())
                    .map_err(|_| "Не вдалося записати форматовані блоки.".to_string())?;
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
                let exemplar = xml[start..end].to_string();
                let header_start = xml[..start]
                    .rfind("<w:tr>")
                    .ok_or_else(|| "У таблиці обстрілів не знайдено шапку.".to_string())?;
                let header_end = header_start
                    + xml[header_start..]
                        .find("</w:tr>")
                        .ok_or_else(|| "Некоректна шапка таблиці обстрілів.".to_string())?
                    + "</w:tr>".len();
                let header = with_row_height(&xml[header_start..header_end], 1278);
                let replacement = if rows.is_empty() {
                    shelling_row(&exemplar, 0, None)?
                } else {
                    rows.iter()
                        .enumerate()
                        .map(|(index, row)| shelling_row(&exemplar, index + 1, Some(row)))
                        .collect::<Result<String, String>>()?
                };
                xml.replace_range(start..end, &replacement);
                xml.replace_range(header_start..header_end, &header);
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
    replace_rich_blocks(&template_path, &document.blocks)?;
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

    fn paragraph_text(paragraph: &str) -> String {
        let mut text = String::new();
        let mut offset = 0;
        while offset < paragraph.len() {
            let Some(start) = [
                paragraph[offset..].find("<w:t>"),
                paragraph[offset..].find("<w:t "),
            ]
            .into_iter()
            .flatten()
            .min()
            .map(|relative| offset + relative) else {
                break;
            };
            let Some(opening_end) = paragraph[start..]
                .find('>')
                .map(|relative| start + relative + 1)
            else {
                break;
            };
            if paragraph[start..opening_end].ends_with("/>") {
                offset = opening_end;
                continue;
            }
            let Some(content_end) = paragraph[opening_end..]
                .find("</w:t>")
                .map(|relative| opening_end + relative)
            else {
                break;
            };
            text.push_str(&paragraph[opening_end..content_end]);
            offset = content_end + "</w:t>".len();
        }
        text
    }

    fn assert_required_blank_lines(xml: &str) {
        let paragraphs = xml_element_ranges(xml, "w:p");
        let texts = paragraphs
            .iter()
            .map(|range| paragraph_text(&xml[range.clone()]))
            .collect::<Vec<_>>();

        let conclusions = texts
            .iter()
            .position(|text| text == "1. ВИСНОВКИ З ОЦІНКИ ПРОТИВНИКА")
            .expect("heading 1 must be present");
        assert_eq!(texts.get(conclusions + 1).map(|text| text.trim()), Some(""));

        let completeness = texts
            .iter()
            .position(|text| text.trim() == "Укомплектованість")
            .expect("completeness heading must be present");
        assert!(completeness > 0);
        assert_eq!(texts[completeness - 1].trim(), "");
    }

    #[test]
    fn creates_a_docx_without_template_markers() {
        let output = temp_path("docx");
        let mut source = ZipArchive::new(std::io::Cursor::new(TEMPLATE)).unwrap();
        let mut template_xml = String::new();
        source
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut template_xml)
            .unwrap();
        assert_required_blank_lines(&template_xml);
        let mut values = std::collections::HashMap::new();
        let mut remaining = template_xml.as_str();
        while let Some(start) = remaining.find("{{") {
            let after_start = &remaining[start + 2..];
            let Some(end) = after_start.find("}}") else {
                break;
            };
            values.insert(after_start[..end].to_string(), "Тест".to_string());
            remaining = &after_start[end + 2..];
        }
        values.insert(
            "signer_position".into(),
            "Командир роти безпілотних авіаційних комплексів 477 окремого батальйону безпілотних систем".into(),
        );
        values.insert("signer_rank".into(), "молодший лейтенант".into());
        values.insert("signer_given_name".into(), "Арсеній".into());
        values.insert("signer_surname".into(), "ШКОЛЬНІКОВ".into());
        values.remove("shelling_rows");
        let rich_keys = [
            "force_composition",
            "positions",
            "enemy_actions",
            "assault_actions",
            "flight_operations",
            "command_duties",
            "guard_duties",
            "period_events",
            "next_tasks",
        ];
        let blocks = rich_keys
            .into_iter()
            .map(|key| {
                values.remove(key);
                let lines = if key == "flight_operations" {
                    vec![
                        SummaryBlockLine {
                            text: "У межах смуги оборони СМУГА ПІВНІЧ:".into(),
                            bold: true,
                            kind: Some("paragraph".into()),
                            runs: vec![],
                        },
                        SummaryBlockLine {
                            text: String::new(),
                            bold: false,
                            kind: Some("paragraph".into()),
                            runs: vec![],
                        },
                        SummaryBlockLine {
                            text: "Із стартової позиції «ХИЖАК» екіпажем РБАК «БАРС» виконується бойове чергування.".into(),
                            bold: false,
                            kind: Some("paragraph".into()),
                            runs: vec![
                                SummaryBlockRun {
                                    text: "Із стартової позиції ".into(),
                                    bold: false,
                                },
                                SummaryBlockRun {
                                    text: "«ХИЖАК»".into(),
                                    bold: true,
                                },
                                SummaryBlockRun {
                                    text: " екіпажем РБАК ".into(),
                                    bold: false,
                                },
                                SummaryBlockRun {
                                    text: "«БАРС»".into(),
                                    bold: true,
                                },
                                SummaryBlockRun {
                                    text: " виконується бойове чергування.".into(),
                                    bold: false,
                                },
                            ],
                        },
                        SummaryBlockLine {
                            text: String::new(),
                            bold: false,
                            kind: Some("paragraph".into()),
                            runs: vec![],
                        },
                        SummaryBlockLine {
                            text: "У межах смуги оборони СМУГА СХІД:".into(),
                            bold: true,
                            kind: Some("paragraph".into()),
                            runs: vec![],
                        },
                        SummaryBlockLine {
                            text: String::new(),
                            bold: false,
                            kind: Some("paragraph".into()),
                            runs: vec![],
                        },
                        SummaryBlockLine {
                            text: "Із стартової позиції «НОВА» екіпажем РБАК «ГРІМ» виконується бойове чергування.".into(),
                            bold: false,
                            kind: Some("paragraph".into()),
                            runs: vec![],
                        },
                    ]
                } else {
                    vec![
                        SummaryBlockLine {
                            text: format!("Перевірка форматованого блоку {key}."),
                            bold: true,
                            kind: Some("paragraph".into()),
                            runs: vec![],
                        },
                        SummaryBlockLine {
                            text: "-окремий елемент без суцільної жирності;".into(),
                            bold: false,
                            kind: Some("item".into()),
                            runs: vec![],
                        },
                        SummaryBlockLine {
                            text: "продовження окремого елемента;".into(),
                            bold: false,
                            kind: Some("continuation".into()),
                            runs: vec![],
                        },
                    ]
                };
                (
                    key.to_string(),
                    lines,
                )
            })
            .collect();
        build_document(
            &output,
            &SummaryReportDocument {
                values,
                shelling_rows: vec![SummaryShellingRow {
                    time: "12:34".into(),
                    shelling_type: "ОБСТРІЛ-ТЕСТ".into(),
                    target: "Ціль перевірки".into(),
                    direction: "Напрямок перевірки".into(),
                    response: "Результат перевірки".into(),
                }],
                blocks,
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
        assert_required_blank_lines(&xml);
        assert!(!xml.contains("{{") && !xml.contains("!"));
        assert!(xml.contains("<w:trHeight w:val=\"1278\" w:hRule=\"atLeast\"/>"));
        assert!(xml.contains("<w:trHeight w:val=\"402\" w:hRule=\"atLeast\"/>"));
        assert!(xml.contains("Командир роти безпілотних авіаційних комплексів 477 окремого батальйону безпілотних систем"));

        let signer_rank_pos = xml.find("молодший лейтенант").unwrap();
        let signer_table_start = xml[..signer_rank_pos].rfind("<w:tbl>").unwrap();
        let signer_table_end =
            signer_rank_pos + xml[signer_rank_pos..].find("</w:tbl>").unwrap() + "</w:tbl>".len();
        let signer_table = &xml[signer_table_start..signer_table_end];
        assert!(signer_table.contains("<w:tblW w:w=\"9632\" w:type=\"dxa\"/>"));
        assert!(signer_table.contains("<w:tblLayout w:type=\"fixed\"/>"));
        assert!(signer_table.contains("<w:tblCellMar><w:top w:w=\"0\" w:type=\"dxa\"/><w:left w:w=\"0\" w:type=\"dxa\"/><w:bottom w:w=\"0\" w:type=\"dxa\"/><w:right w:w=\"0\" w:type=\"dxa\"/></w:tblCellMar>"));
        assert!(!signer_table.contains("<w:tab"));
        let signer_cells = xml_element_ranges(signer_table, "w:tc");
        assert_eq!(signer_cells.len(), 2);
        let rank_cell = &signer_table[signer_cells[0].clone()];
        let name_cell = &signer_table[signer_cells[1].clone()];
        assert!(rank_cell.contains("<w:jc w:val=\"left\"/>"));
        assert!(rank_cell.contains("молодший лейтенант"));
        assert!(name_cell.contains("<w:jc w:val=\"right\"/>"));
        assert!(name_cell.contains("Арсеній ШКОЛЬНІКОВ"));

        let following_paragraphs = xml_element_ranges(&xml[signer_table_end..], "w:p");
        assert_eq!(
            following_paragraphs
                .first()
                .map(|range| paragraph_text(&xml[signer_table_end..][range.clone()])),
            Some("Тест".into())
        );

        let generated_paragraphs = xml_element_ranges(&xml, "w:p");
        let generated_texts = generated_paragraphs
            .iter()
            .map(|range| paragraph_text(&xml[range.clone()]))
            .collect::<Vec<_>>();
        let strip_heading = generated_texts
            .iter()
            .position(|text| text == "У межах смуги оборони СМУГА ПІВНІЧ:")
            .unwrap();
        assert!(strip_heading > 1);
        assert_ne!(generated_texts[strip_heading - 2], "");
        assert_eq!(generated_texts[strip_heading - 1], "");
        assert_eq!(generated_texts[strip_heading + 1], "");
        assert_ne!(generated_texts[strip_heading + 2], "");
        let second_strip_heading = generated_texts
            .iter()
            .position(|text| text == "У межах смуги оборони СМУГА СХІД:")
            .unwrap();
        assert_ne!(generated_texts[second_strip_heading - 2], "");
        assert_eq!(generated_texts[second_strip_heading - 1], "");
        assert_eq!(generated_texts[second_strip_heading + 1], "");
        assert_ne!(generated_texts[second_strip_heading + 2], "");
        let crew_paragraph = &xml[generated_paragraphs[strip_heading + 2].clone()];
        let crew_runs = xml_element_ranges(crew_paragraph, "w:r");
        let prefix_run = crew_runs
            .iter()
            .map(|range| &crew_paragraph[range.clone()])
            .find(|run| paragraph_text(run).contains("РБАК"))
            .unwrap();
        let crew_name_run = crew_runs
            .iter()
            .map(|range| &crew_paragraph[range.clone()])
            .find(|run| paragraph_text(run) == "«БАРС»")
            .unwrap();
        assert!(prefix_run.contains("<w:b w:val=\"0\"/>"));
        assert!(crew_name_run.contains("<w:b w:val=\"1\"/>"));

        let exemplar_marker = template_xml.find("{{shelling_rows}}").unwrap();
        let exemplar_start = template_xml[..exemplar_marker].rfind("<w:tr>").unwrap();
        let exemplar_end = exemplar_marker
            + template_xml[exemplar_marker..].find("</w:tr>").unwrap()
            + "</w:tr>".len();
        let exemplar = &template_xml[exemplar_start..exemplar_end];
        let generated_marker = xml.find("ОБСТРІЛ-ТЕСТ").unwrap();
        let generated_start = xml[..generated_marker].rfind("<w:tr>").unwrap();
        let generated_end =
            generated_marker + xml[generated_marker..].find("</w:tr>").unwrap() + "</w:tr>".len();
        let generated = &xml[generated_start..generated_end];
        let exemplar_cells = xml_element_ranges(exemplar, "w:tc");
        let generated_cells = xml_element_ranges(generated, "w:tc");
        assert_eq!(exemplar_cells.len(), 6);
        assert_eq!(generated_cells.len(), 6);
        assert!(generated.contains(
            "<w:tblPrEx><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"cad1d7\"/></w:tblPrEx>"
        ));
        for (exemplar_cell, generated_cell) in exemplar_cells.iter().zip(&generated_cells) {
            let exemplar_cell = &exemplar[exemplar_cell.clone()];
            let generated_cell = &generated[generated_cell.clone()];
            assert_eq!(
                xml_element(generated_cell, "w:tcPr"),
                xml_element(exemplar_cell, "w:tcPr")
            );
            assert_eq!(
                xml_element(generated_cell, "w:pPr"),
                xml_element(exemplar_cell, "w:pPr")
            );
            assert_eq!(
                xml_element(generated_cell, "w:rPr"),
                xml_element(exemplar_cell, "w:rPr")
            );
            assert!(generated_cell
                .contains("<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"auto\"/>"));
            assert!(generated_cell.contains("<w:pStyle w:val=\"Normal.0\"/>"));
            assert!(generated_cell.contains("<w:spacing w:line=\"240\" w:lineRule=\"auto\"/>"));
        }
        let generated_cell_runs = generated_cells
            .iter()
            .map(|cell| xml_element(&generated[cell.clone()], "w:rPr").unwrap())
            .collect::<Vec<_>>();
        assert!(generated_cell_runs[3].contains("<w:sz w:val=\"24\"/>"));
        assert!(generated_cell_runs[3].contains("<w:szCs w:val=\"24\"/>"));
        for (index, run) in generated_cell_runs.iter().enumerate() {
            if index != 3 {
                assert!(run.contains("<w:sz w:val=\"22\"/>"));
                assert!(run.contains("<w:szCs w:val=\"22\"/>"));
            }
        }

        let composition_text = "Перевірка форматованого блоку force_composition.";
        let composition_pos = xml.find(composition_text).unwrap();
        let composition_start = xml[..composition_pos].rfind("<w:p>").unwrap();
        let composition_end =
            composition_pos + xml[composition_pos..].find("</w:p>").unwrap() + "</w:p>".len();
        let composition_properties =
            xml_element(&xml[composition_start..composition_end], "w:pPr").unwrap();
        assert!(composition_properties.contains("<w:pStyle w:val=\"Звичайний2\"/>"));
        assert!(composition_properties.contains("<w:ind w:firstLine=\"851\"/>"));

        let assault_text = "Перевірка форматованого блоку assault_actions.";
        let assault_pos = xml.find(assault_text).unwrap();
        let assault_start = xml[..assault_pos].rfind("<w:p>").unwrap();
        let assault_end = assault_pos + xml[assault_pos..].find("</w:p>").unwrap() + "</w:p>".len();
        let assault_properties = xml_element(&xml[assault_start..assault_end], "w:pPr").unwrap();
        assert!(assault_properties.contains("<w:b w:val=\"1\"/><w:bCs w:val=\"1\"/>"));

        let item_text = "-окремий елемент без суцільної жирності;";
        let item_pos = assault_pos + xml[assault_pos..].find(item_text).unwrap();
        let item_start = xml[..item_pos].rfind("<w:p>").unwrap();
        let item_end = item_pos + xml[item_pos..].find("</w:p>").unwrap() + "</w:p>".len();
        let item_properties = xml_element(&xml[item_start..item_end], "w:pPr").unwrap();
        assert!(item_properties.contains("<w:pStyle w:val=\"Normal.0\"/>"));
        assert!(item_properties.contains("<w:spacing w:line=\"240\" w:lineRule=\"auto\"/>"));
        assert!(item_properties.contains("<w:ind w:left=\"709\" w:hanging=\"283\"/>"));
        assert!(!item_properties.contains("w:firstLine="));
        let item_run_start = xml[..item_pos].rfind("<w:r>").unwrap();
        let item_run_end = item_pos + xml[item_pos..].find("</w:r>").unwrap() + "</w:r>".len();
        let item_run = &xml[item_run_start..item_run_end];
        assert!(item_run.contains("<w:b w:val=\"0\"/><w:bCs w:val=\"0\"/>"));
        assert!(!item_run.contains("<w:sz "));

        let continuation_text = "продовження окремого елемента;";
        let continuation_pos = item_pos + xml[item_pos..].find(continuation_text).unwrap();
        let continuation_start = xml[..continuation_pos].rfind("<w:p>").unwrap();
        let continuation_end =
            continuation_pos + xml[continuation_pos..].find("</w:p>").unwrap() + "</w:p>".len();
        let continuation_properties =
            xml_element(&xml[continuation_start..continuation_end], "w:pPr").unwrap();
        assert!(continuation_properties.contains("<w:pStyle w:val=\"Normal.0\"/>"));
        assert!(continuation_properties.contains("<w:ind w:left=\"709\"/>"));
        assert!(!continuation_properties.contains("w:hanging="));
        assert!(!continuation_properties.contains("w:firstLine="));
        if let Ok(destination) = std::env::var("SUMMARY_REPORT_TEST_OUTPUT") {
            fs::copy(&output, destination).unwrap();
        }
        let _ = fs::remove_file(output);
    }

    #[test]
    fn block_lines_keep_template_run_formatting_and_only_override_kind_indent() {
        let marker_properties = "<w:pPr><w:pStyle w:val=\"TemplateBody\"/><w:keepNext/><w:spacing w:before=\"120\" w:line=\"240\"/><w:ind w:firstLine=\"851\"/><w:rPr><w:sz w:val=\"24\"/></w:rPr></w:pPr>";
        let marker_run_properties = "<w:rPr><w:rFonts w:ascii=\"Template Font\"/><w:i/><w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/><w:rtl w:val=\"0\"/></w:rPr>";
        let line = SummaryBlockLine {
            text: "Елемент".into(),
            bold: false,
            kind: Some("item".into()),
            runs: vec![],
        };

        let paragraph = block_paragraph(&line, marker_properties, Some(marker_run_properties));
        let properties = xml_element(&paragraph, "w:pPr").unwrap();
        assert!(properties.contains("<w:pStyle w:val=\"TemplateBody\"/>"));
        assert!(properties.contains("<w:keepNext/>"));
        assert!(properties.contains("<w:spacing w:before=\"120\" w:line=\"240\"/>"));
        assert!(properties.contains("<w:rPr><w:sz w:val=\"24\"/></w:rPr>"));
        assert!(properties.contains("<w:ind w:left=\"709\" w:hanging=\"283\"/>"));
        assert!(!properties.contains("w:firstLine="));

        let run = xml_element(&paragraph, "w:r").unwrap();
        assert!(run.contains("<w:rFonts w:ascii=\"Template Font\"/>"));
        assert!(run.contains("<w:i/>"));
        assert!(run.contains("<w:sz w:val=\"22\"/>"));
        assert!(run.contains("<w:szCs w:val=\"22\"/>"));
        assert!(!run.contains("w:val=\"28\""));
        assert!(run.contains("<w:b w:val=\"0\"/>"));
        assert!(run.contains("<w:bCs w:val=\"0\"/>"));
    }

    #[test]
    fn flight_strip_spacing_and_crew_prefix_keep_the_requested_formatting() {
        let marker_properties = "<w:pPr><w:pStyle w:val=\"Normal.0\"/><w:spacing w:line=\"240\" w:lineRule=\"auto\"/></w:pPr>";
        let marker_run_properties = "<w:rPr><w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/></w:rPr>";
        let lines = [
            SummaryBlockLine {
                text: "У межах смуги оборони СМУГА ПІВНІЧ:".into(),
                bold: true,
                kind: Some("paragraph".into()),
                runs: vec![],
            },
            SummaryBlockLine {
                text: String::new(),
                bold: false,
                kind: Some("paragraph".into()),
                runs: vec![],
            },
            SummaryBlockLine {
                text: "екіпажем РБАК «БАРС»".into(),
                bold: false,
                kind: Some("paragraph".into()),
                runs: vec![
                    SummaryBlockRun {
                        text: "екіпажем РБАК ".into(),
                        bold: false,
                    },
                    SummaryBlockRun {
                        text: "«БАРС»".into(),
                        bold: true,
                    },
                ],
            },
            SummaryBlockLine {
                text: String::new(),
                bold: false,
                kind: Some("paragraph".into()),
                runs: vec![],
            },
            SummaryBlockLine {
                text: "У межах смуги оборони СМУГА СХІД:".into(),
                bold: true,
                kind: Some("paragraph".into()),
                runs: vec![],
            },
            SummaryBlockLine {
                text: String::new(),
                bold: false,
                kind: Some("paragraph".into()),
                runs: vec![],
            },
        ];
        let paragraphs = lines
            .iter()
            .map(|line| block_paragraph(line, marker_properties, Some(marker_run_properties)))
            .collect::<Vec<_>>();

        assert_eq!(
            paragraph_text(&paragraphs[0]),
            "У межах смуги оборони СМУГА ПІВНІЧ:"
        );
        assert_eq!(paragraph_text(&paragraphs[1]), "");
        assert_ne!(paragraph_text(&paragraphs[2]), "");
        assert_eq!(paragraph_text(&paragraphs[3]), "");
        assert_eq!(
            paragraph_text(&paragraphs[4]),
            "У межах смуги оборони СМУГА СХІД:"
        );
        assert_eq!(paragraph_text(&paragraphs[5]), "");
        assert!(paragraphs[0].contains("<w:b w:val=\"1\"/>"));

        let runs = xml_element_ranges(&paragraphs[2], "w:r");
        assert_eq!(runs.len(), 2);
        let prefix = &paragraphs[2][runs[0].clone()];
        let crew = &paragraphs[2][runs[1].clone()];
        assert_eq!(paragraph_text(prefix), "екіпажем РБАК ");
        assert!(prefix.contains("<w:b w:val=\"0\"/>"));
        assert_eq!(paragraph_text(crew), "«БАРС»");
        assert!(crew.contains("<w:b w:val=\"1\"/>"));
    }
}
