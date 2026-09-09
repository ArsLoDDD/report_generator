use crate::xlsx::BcsRow;
use std::path::Path;

fn esc(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
fn text_cell(col: usize, row: usize, value: &str, style: usize) -> String {
    format!("<c r=\"{}{row}\" s=\"{style}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{}</t></is></c>", (b'A' + col as u8) as char, esc(value))
}
fn number_cell(col: usize, row: usize, value: i64, formula: &str, style: usize) -> String {
    format!(
        "<c r=\"{}{row}\" s=\"{style}\">{}<v>{value}</v></c>",
        (b'A' + col as u8) as char,
        if formula.is_empty() {
            String::new()
        } else {
            format!("<f>{}</f>", esc(formula))
        }
    )
}

fn bcs_styles() -> String {
    let fills = ["D7E48D", "FDEADA", "E6B8B7", "CCC0DA", "C7BED0", "DBEEF4", "D7E4BD", "F2DCDB", "FCD5B4"]
        .iter().map(|color| format!(r#"<fill><patternFill patternType="solid"><fgColor rgb="FF{color}"/><bgColor indexed="64"/></patternFill></fill>"#)).collect::<String>();
    let xfs = (10..=18).map(|fill| format!(r#"<xf numFmtId="0" fontId="7" fillId="{fill}" borderId="7" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>"#)).collect::<String>();
    include_str!("../resources/bcs-reference-styles.xml")
        .replace("<fills count=\"10\">", "<fills count=\"19\">")
        .replace("</fills>", &format!("{fills}</fills>"))
        .replace("<cellXfs count=\"171\">", "<cellXfs count=\"180\">")
        .replace("</cellXfs>", &format!("{xfs}</cellXfs>"))
}

pub fn export(
    path: &Path,
    unit: &str,
    date: &str,
    authorized: i64,
    rows: &[BcsRow],
) -> Result<(), String> {
    let schema: serde_json::Value =
        serde_json::from_str(include_str!("../../src/shared/bcs-schema.json"))
            .map_err(|e| e.to_string())?;
    let locations = schema["locations"]
        .as_array()
        .ok_or("Немає довідника БЧС.")?;
    let headers = schema["headers"]
        .as_array()
        .ok_or("Немає заголовків БЧС.")?;
    let widths = schema["widths"].as_array().ok_or("Немає розмірів БЧС.")?;
    let mut merges = vec!["A1:O2".to_string(), "A6:P6".into()];
    let mut sheet = String::from("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"6\" topLeftCell=\"A7\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews><cols>");
    for (index, width) in widths.iter().enumerate() {
        sheet.push_str(&format!(
            "<col min=\"{}\" max=\"{}\" width=\"{}\" customWidth=\"1\"/>",
            index + 1,
            index + 1,
            width
        ));
    }
    sheet.push_str("</cols><sheetData><row r=\"1\" ht=\"18\" customHeight=\"1\">");
    sheet.push_str(&text_cell(
        0,
        1,
        &format!("БЧС\n{unit}\nстаном на 08:00 год {date} року"),
        2,
    ));
    sheet.push_str("</row><row r=\"2\" ht=\"44.25\" customHeight=\"1\"/><row r=\"4\" ht=\"30\" customHeight=\"1\">");
    for (index, header) in headers.iter().enumerate() {
        sheet.push_str(&text_cell(index, 4, header.as_str().unwrap_or_default(), 3));
        merges.push(format!("{0}4:{0}5", (b'A' + index as u8) as char));
    }
    sheet.push_str("</row><row r=\"5\" ht=\"30\" customHeight=\"1\"/><row r=\"6\" ht=\"20\" customHeight=\"1\">");
    sheet.push_str(&text_cell(0, 6, unit, 6));
    sheet.push_str("</row>");
    let mut start = 0;
    let mut group_starts = Vec::new();
    while start < rows.len() {
        let first = &rows[start];
        let mut end = start + 1;
        while end < rows.len()
            && if first.group_key.is_empty() {
                rows[end].section == first.section && rows[end].crew_name == first.crew_name
            } else {
                rows[end].group_key == first.group_key
            }
        {
            end += 1;
        }
        group_starts.push(first);
        if end - start > 1 {
            let first_row = start + 7;
            let last_row = end + 6;
            for col in 0..10 {
                let letter = (b'A' + col as u8) as char;
                merges.push(format!("{letter}{first_row}:{letter}{last_row}"));
            }
        }
        for (index, row) in rows.iter().enumerate().take(end).skip(start) {
            let r = index + 7;
            let values = [
                &row.section,
                &row.position_name,
                &row.battle_order,
                &row.sector,
                &row.crew_name,
                &row.crew_actual,
                &row.crew_official,
                &row.crew_status,
                &row.uav_name,
                &row.uav_type,
                &row.personnel_position,
                &row.rank,
                &row.full_name,
                &row.duties,
                &row.location,
                &row.notes,
            ];
            let max_lines = values
                .iter()
                .enumerate()
                .skip(10)
                .map(|(col, value)| {
                    value
                        .split('\n')
                        .map(|line| {
                            (line.chars().count() as f64
                                / (widths[col].as_f64().unwrap_or(20.0) * 0.8))
                                .ceil()
                                .max(1.0) as usize
                        })
                        .sum::<usize>()
                })
                .max()
                .unwrap_or(1);
            let height = (max_lines * 14 + 10).max(40);
            sheet.push_str(&format!(r#"<row r="{r}" ht="{height}" customHeight="1">"#));
            let style = match row.color_key.as_str() {
                "crew-working" => 171,
                "crew-forming" => 172,
                "crew-inactive" => 173,
                "company-management" => 174,
                "platoon-management" => 175,
                "independent" => 176,
                "unassigned" => 177,
                "attached" => 178,
                "temporary" => 179,
                _ => 177,
            };
            for (col, value) in values.iter().enumerate() {
                let group_value: &str = if index > start && col < 10 {
                    ""
                } else {
                    value.as_str()
                };
                if (col == 5 || col == 6) && !group_value.is_empty() {
                    let number = group_value
                        .parse::<i64>()
                        .map_err(|_| "Кількість в/с має бути цілим числом.")?;
                    if number < 0 {
                        return Err("Кількість в/с не може бути від’ємною.".into());
                    }
                    sheet.push_str(&number_cell(col, r, number, "", style));
                } else {
                    sheet.push_str(&text_cell(col, r, group_value, style));
                }
            }
            sheet.push_str("</row>");
        }
        start = end;
    }
    let last = (rows.len() + 6).max(7);
    let summary = rows.len() + 9;
    let count = |location: &str| rows.iter().filter(|row| row.location == location).count() as i64;
    let personnel_rows = rows
        .iter()
        .filter(|row| !row.full_name.trim().is_empty())
        .collect::<Vec<_>>();
    let own = personnel_rows.iter().filter(|row| !row.is_external).count() as i64;
    let absent = ["ВІДП", "ЛІК", "НАВЧ", "ВІДР", "Відкомандировані", "СЗЧ"];
    let present = rows
        .iter()
        .filter(|row| !row.full_name.trim().is_empty())
        .filter(|row| !row.is_external && !absent.contains(&row.location.as_str()))
        .count() as i64;
    let labels = [
        "По штату",
        "По списку",
        "В наявності",
        "Відпустка",
        "Шпиталь",
        "Відрядження",
        "Відкомандировані",
        "Прикомандировані",
        "ПТЗ Новостав",
        "СЗЧ",
        "Тимчасово прибулі",
    ];
    let summary_values = [
        authorized,
        own,
        present,
        count("ВІДП"),
        count("ЛІК"),
        count("НАВЧ") + count("ВІДР"),
        count("Відкомандировані"),
        rows.iter()
            .filter(|row| row.section == "Прикомандировані")
            .count() as i64,
        count("ПТЗ Новостав"),
        count("СЗЧ"),
        rows.iter().filter(|row| row.is_temporary).count() as i64,
    ];
    let location_formula = |location: &str| format!("COUNTIF(O7:O{last},\"{location}\")");
    let temporary_formula = format!(r#"SUMIF(A7:A{last},"Тимчасово прибулі",G7:G{last})"#);
    let summary_formulas = [
        String::new(),
        String::new(),
        String::new(),
        location_formula("ВІДП"),
        location_formula("ЛІК"),
        format!("{}+{}", location_formula("НАВЧ"), location_formula("ВІДР")),
        location_formula("Відкомандировані"),
        format!(r#"SUMIF(A7:A{last},"Прикомандировані",G7:G{last})"#),
        location_formula("ПТЗ Новостав"),
        location_formula("СЗЧ"),
        temporary_formula,
    ];
    let crews: Vec<_> = group_starts
        .iter()
        .filter(|row| !row.crew_name.is_empty())
        .collect();
    let wings: Vec<_> = crews
        .iter()
        .filter(|row| {
            let kind = row.uav_type.to_lowercase();
            kind.contains("крил") || kind.contains("літак")
        })
        .collect();
    let wing_formula = |col: &str| {
        format!(
            r#"SUMIF(J7:J{last},"*крил*",{col}7:{col}{last})+SUMIF(J7:J{last},"*літак*",{col}7:{col}{last})-SUMIFS({col}7:{col}{last},J7:J{last},"*крил*",J7:J{last},"*літак*")"#
        )
    };
    let section_count = |name: &str| {
        group_starts
            .iter()
            .filter(|row| row.section == name)
            .map(|row| row.crew_official.parse::<i64>().unwrap_or(0))
            .sum::<i64>()
    };
    let functional = [
        (
            "Екіпажі крил (ос-загальна)",
            wings
                .iter()
                .map(|row| row.crew_official.parse::<i64>().unwrap_or(0))
                .sum(),
            wing_formula("G"),
        ),
        (
            "Екіпажі крил (ос-в задіяні)",
            wings
                .iter()
                .map(|row| row.crew_actual.parse::<i64>().unwrap_or(0))
                .sum(),
            wing_formula("F"),
        ),
        (
            "Екіпажі крил (екіпажі)",
            wings.len() as i64,
            format!(
                r#"COUNTIF(J7:J{last},"*крил*")+COUNTIF(J7:J{last},"*літак*")-COUNTIFS(J7:J{last},"*крил*",J7:J{last},"*літак*")"#
            ),
        ),
        (
            "Екіпажі - формуються",
            crews
                .iter()
                .filter(|row| row.crew_status.to_lowercase().starts_with("форм"))
                .count() as i64,
            format!(r#"COUNTIFS(E7:E{last},"<>",H7:H{last},"форм*")"#),
        ),
        (
            "Екіпажі - працюючі",
            crews
                .iter()
                .filter(|row| row.crew_status.to_lowercase().starts_with("прац"))
                .count() as i64,
            format!(r#"COUNTIFS(E7:E{last},"<>",H7:H{last},"прац*")"#),
        ),
        (
            "Екіпажі - не активні",
            crews
                .iter()
                .filter(|row| {
                    row.crew_status
                        .to_lowercase()
                        .replace(' ', "")
                        .starts_with("неактив")
                })
                .count() as i64,
            format!(
                r#"COUNTIFS(E7:E{last},"<>",H7:H{last},"неактив*")+COUNTIFS(E7:E{last},"<>",H7:H{last},"не актив*")"#
            ),
        ),
        (
            "Управління роти",
            section_count("Управління роти"),
            format!(r#"SUMIF(A7:A{last},"Управління роти",G7:G{last})"#),
        ),
        (
            "Управління взводів",
            section_count("Управління взводів"),
            format!(r#"SUMIF(A7:A{last},"Управління взводів",G7:G{last})"#),
        ),
        (
            "Відділення збору та обробки інформації",
            section_count("Відділення збору та обробки інформації"),
            format!(r#"SUMIF(A7:A{last},"Відділення збору та обробки інформації",G7:G{last})"#),
        ),
    ];
    sheet.push_str(&format!(
        "<row r=\"{summary}\">{}{}{} </row>",
        text_cell(4, summary, &format!("БЧС {unit}:"), 5),
        text_cell(8, summary, "БЧС по функціоналу:", 5),
        text_cell(12, summary, "Де знаходиться", 5)
    ));
    for index in 0..locations.len() + 2 {
        let r = summary + index + 1;
        sheet.push_str(&format!("<row r=\"{r}\" ht=\"24\" customHeight=\"1\">"));
        if let Some(label) = labels.get(index) {
            sheet.push_str(&text_cell(4, r, label, 3));
            if let (Some(value), Some(formula)) =
                (summary_values.get(index), summary_formulas.get(index))
            {
                sheet.push_str(&number_cell(5, r, *value, formula, 3));
            } else {
                sheet.push_str(&text_cell(5, r, "", 3));
            }
        }
        if let Some((label, value, formula)) = functional.get(index) {
            sheet.push_str(&text_cell(8, r, label, 3));
            sheet.push_str(&number_cell(10, r, *value, formula, 3));
        }
        if let Some(location) = locations.get(index).and_then(|value| value.as_str()) {
            sheet.push_str(&number_cell(
                11,
                r,
                count(location),
                &location_formula(location),
                3,
            ));
            sheet.push_str(&text_cell(12, r, location, 3));
        } else if index == locations.len() {
            let unknown = rows
                .iter()
                .filter(|row| !row.full_name.trim().is_empty())
                .filter(|row| {
                    !locations
                        .iter()
                        .any(|value| value.as_str() == Some(&row.location))
                })
                .count() as i64;
            sheet.push_str(&number_cell(
                11,
                r,
                unknown,
                &format!("COUNTA(M7:M{last})-SUM(L{}:L{})", summary + 1, r - 1),
                3,
            ));
            sheet.push_str(&text_cell(12, r, "Не вказано / інше", 3));
        } else {
            sheet.push_str(&number_cell(
                11,
                r,
                personnel_rows.len() as i64,
                &format!("SUM(L{}:L{})", summary + 1, r - 1),
                3,
            ));
            sheet.push_str(&text_cell(12, r, "Загалом", 3));
        }
        sheet.push_str("</row>");
    }
    sheet.push_str(&format!("</sheetData><mergeCells count=\"{}\">{}</mergeCells><pageMargins left=\"0.25\" right=\"0.25\" top=\"0.3\" bottom=\"0.3\" header=\"0\" footer=\"0\"/><pageSetup paperSize=\"8\" orientation=\"landscape\" fitToWidth=\"1\" fitToHeight=\"0\"/></worksheet>",merges.len(),merges.iter().map(|range|format!("<mergeCell ref=\"{range}\"/>")).collect::<String>()));
    let styles = bcs_styles();
    crate::xlsx::write_styled_workbook(
        path,
        vec![("БЧС".into(), sheet)],
        &styles,
        include_str!("../resources/bcs-reference-theme.xml"),
    )
}
