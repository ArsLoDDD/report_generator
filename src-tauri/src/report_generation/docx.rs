use super::*;

pub(super) fn read_variables(path: &Path) -> Result<Vec<String>, String> {
    let file = File::open(path)
        .map_err(|_| "Не вдалося відкрити шаблон. Перевірте шлях і доступ.".to_string())?;
    let mut zip =
        ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?;
    let mut out = Vec::new();
    for i in 0..zip.len() {
        let mut e = zip
            .by_index(i)
            .map_err(|_| "Не вдалося прочитати DOCX.".to_string())?;
        if !e.name().ends_with(".xml") {
            continue;
        }
        let mut s = String::new();
        let _ = e.read_to_string(&mut s);
        out.extend(extract_variables(&s))
    }
    out.sort();
    out.dedup();
    Ok(out)
}

/// Text used by the local template analyser. It reads only the XML stored in
/// the selected DOCX file and never sends the document anywhere.
pub fn read_docx_text(path: &Path) -> Result<String, String> {
    let file = File::open(path)
        .map_err(|_| "Не вдалося відкрити DOCX-файл. Перевірте шлях і доступ.".to_string())?;
    let mut zip =
        ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-документом.".to_string())?;
    let mut text = String::new();
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|_| "Не вдалося прочитати DOCX-документ.".to_string())?;
        if !entry.name().ends_with(".xml") {
            continue;
        }
        let mut xml = String::new();
        let _ = entry.read_to_string(&mut xml);
        if entry.name().starts_with("word/") {
            text.push_str(&word_xml_visible_text(&xml));
            text.push('\n');
        }
    }
    Ok(text)
}

/// Reads the body paragraphs that are visible in Word together with the most
/// important paragraph layout properties. This stays local and is solely for
/// the analyser preview; DOCX generation still preserves the original XML.
pub fn read_docx_paragraphs(path: &Path) -> Result<Vec<DocxParagraphPreview>, String> {
    let file = File::open(path)
        .map_err(|_| "Не вдалося відкрити DOCX-файл. Перевірте шлях і доступ.".to_string())?;
    let mut zip =
        ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-документом.".to_string())?;
    let mut xml = String::new();
    zip.by_name("word/document.xml")
        .map_err(|_| "У DOCX не знайдено основний текст документа.".to_string())?
        .read_to_string(&mut xml)
        .map_err(|_| "Не вдалося прочитати текст DOCX-документа.".to_string())?;
    let mut paragraphs = Vec::new();
    for raw in xml.split("</w:p>") {
        let Some(start) = raw.rfind("<w:p") else {
            continue;
        };
        let paragraph = &raw[start..];
        let text =
            word_xml_visible_text(&paragraph.replace("<w:tab/>", "\t").replace("<w:br/>", "\n"));
        if text.trim().is_empty() {
            continue;
        }
        let value = |name: &str| -> Option<String> {
            let start = paragraph.find(name)? + name.len();
            let tail = &paragraph[start..];
            let end = tail.find('"')?;
            Some(tail[..end].to_string())
        };
        let alignment = value("<w:jc w:val=\"").unwrap_or_else(|| "left".into());
        let left_indent = value("<w:ind w:left=\"")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let first_line_indent = value("w:firstLine=\"")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let space_before = value("<w:spacing w:before=\"")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let space_after = value("w:after=\"")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        paragraphs.push(DocxParagraphPreview {
            text,
            alignment,
            left_indent,
            first_line_indent,
            space_before,
            space_after,
        });
    }
    Ok(paragraphs)
}

/// Creates a copy of a DOCX and replaces only the confirmed literal values.
/// The original document is not modified.
#[allow(dead_code)]
pub fn create_template_from_replacements(
    input: &Path,
    output: &Path,
    replacements: &[(String, String)],
) -> Result<(), String> {
    let mut literal_replacements = replacements
        .iter()
        .map(|(value, token)| (value.clone(), format!("{{{{{token}}}}}"), None))
        .collect::<Vec<_>>();
    literal_replacements.sort_by_key(|right| std::cmp::Reverse(right.0.chars().count()));
    create_template_from_literal_replacements(input, output, &literal_replacements)
}

/// Creates a copy of a DOCX using already prepared visible replacement text.
/// This is used by the report editor, where a user may enter either a template
/// token or another literal text. The original document is never modified.
pub fn create_template_from_literal_replacements(
    input: &Path,
    output: &Path,
    replacements: &[(String, String, Option<usize>)],
) -> Result<(), String> {
    let temporary_output = output.with_file_name(format!(
        ".{}.partial-{}",
        output
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("template.docx"),
        std::process::id()
    ));
    let result = create_template_archive(input, &temporary_output, replacements).and_then(|_| {
        let mut verification = ZipArchive::new(
            File::open(&temporary_output)
                .map_err(|_| "Не вдалося перевірити створений DOCX-шаблон.".to_string())?,
        )
        .map_err(|_| "Створений DOCX-шаблон має пошкоджену структуру.".to_string())?;
        for index in 0..verification.len() {
            let mut entry = verification
                .by_index(index)
                .map_err(|_| "Не вдалося перевірити вміст DOCX-шаблону.".to_string())?;
            let mut contents = Vec::new();
            entry
                .read_to_end(&mut contents)
                .map_err(|_| "DOCX-шаблон записано не повністю.".to_string())?;
            if entry.name().ends_with(".xml") {
                let mut xml_reader = Reader::from_reader(contents.as_slice());
                xml_reader.config_mut().trim_text(false);
                let mut buffer = Vec::new();
                loop {
                    match xml_reader.read_event_into(&mut buffer) {
                        Ok(Event::Eof) => break,
                        Ok(_) => buffer.clear(),
                        Err(_) => {
                            return Err("Створений DOCX-шаблон містить пошкоджений XML.".into())
                        }
                    }
                }
            }
        }
        File::options()
            .write(true)
            .open(&temporary_output)
            .and_then(|file| file.sync_all())
            .map_err(|_| "Не вдалося завершити запис DOCX-шаблону на диск.".to_string())?;
        fs::rename(&temporary_output, output)
            .map_err(|_| "Не вдалося зберегти створений DOCX-шаблон.".to_string())
    });
    if result.is_err() {
        let _ = fs::remove_file(&temporary_output);
    }
    result
}

pub(super) fn create_template_archive(
    input: &Path,
    output: &Path,
    replacements: &[(String, String, Option<usize>)],
) -> Result<(), String> {
    let mut zip = ZipArchive::new(
        File::open(input).map_err(|_| "Не вдалося відкрити вихідний DOCX-файл.".to_string())?,
    )
    .map_err(|_| "Файл не є коректним DOCX-документом.".to_string())?;
    let mut writer = ZipWriter::new(
        File::create(output).map_err(|_| "Не вдалося створити новий DOCX-шаблон.".to_string())?,
    );
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|_| "Не вдалося прочитати DOCX-документ.".to_string())?;
        let name = entry.name().to_owned();
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        if entry.is_dir() {
            writer
                .add_directory(name, options)
                .map_err(|_| "Не вдалося сформувати DOCX-шаблон.".to_string())?;
            continue;
        }
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|_| "Не вдалося прочитати DOCX-документ.".to_string())?;
        writer
            .start_file(&name, options)
            .map_err(|_| "Не вдалося сформувати DOCX-шаблон.".to_string())?;
        if name.ends_with(".xml") {
            let mut xml = String::from_utf8_lossy(&bytes).into_owned();
            // A full name must be replaced before its surname; otherwise the
            // shorter replacement destroys the longer source text first.
            for (value, replacement, occurrence) in replacements {
                if !value.is_empty() {
                    xml = replace_word_token_occurrence_case_insensitive(
                        &xml,
                        value,
                        &escape_xml(replacement),
                        *occurrence,
                    );
                }
            }
            writer
                .write_all(xml.as_bytes())
                .map_err(|_| "Не вдалося записати DOCX-шаблон.".to_string())?;
        } else {
            writer
                .write_all(&bytes)
                .map_err(|_| "Не вдалося записати DOCX-шаблон.".to_string())?;
        }
    }
    writer
        .finish()
        .map_err(|_| "Не вдалося завершити створення DOCX-шаблону.".to_string())?;
    Ok(())
}
pub(super) fn extract_variables(xml: &str) -> Vec<String> {
    let text = xml_visible_text(xml);
    let mut out = Vec::new();
    let mut rest = text.as_str();
    while let Some(start) = rest.find("{{") {
        let after = &rest[start + 2..];
        if let Some(end) = after.find("}}") {
            out.push(after[..end].into());
            rest = &after[end + 2..]
        } else {
            break;
        }
    }
    out
}
pub(super) fn normalize_token(token: &str) -> String {
    token
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect()
}
pub(super) fn xml_visible_text(xml: &str) -> String {
    let mut out = String::new();
    let mut tag = false;
    for c in xml.chars() {
        match c {
            '<' => tag = true,
            '>' => tag = false,
            _ if !tag => out.push(c),
            _ => {}
        }
    }
    out
}

/// Extracts Word text while retaining paragraph and table-cell boundaries.
/// Structured XML parsing prevents document markup from being confused with
/// visible report text during local analysis.
pub(super) fn word_xml_visible_text(xml: &str) -> String {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut output = String::new();
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Text(text)) => {
                if let Ok(value) = text.decode() {
                    output.push_str(&value);
                }
            }
            Ok(Event::CData(text)) => {
                if let Ok(value) = text.decode() {
                    output.push_str(&value);
                }
            }
            Ok(Event::Empty(element)) if element.name().as_ref() == b"w:tab" => output.push('\t'),
            Ok(Event::End(element)) if matches!(element.name().as_ref(), b"w:p" | b"w:tr") => {
                output.push('\n')
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(_) => return xml_visible_text(xml),
        }
        buffer.clear();
    }
    output
}
pub(super) fn write_docx(
    input: &Path,
    output: &Path,
    values: &HashMap<String, Value>,
) -> Result<(), String> {
    let mut zip = ZipArchive::new(
        File::open(input).map_err(|_| "Не вдалося відкрити DOCX-шаблон.".to_string())?,
    )
    .map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?;
    let mut writer = ZipWriter::new(
        File::create(output).map_err(|_| "Не вдалося створити DOCX-файл.".to_string())?,
    );
    for i in 0..zip.len() {
        let mut e = zip
            .by_index(i)
            .map_err(|_| "Не вдалося прочитати DOCX.".to_string())?;
        let name = e.name().to_owned();
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        if e.is_dir() {
            writer
                .add_directory(name, options)
                .map_err(|_| "Не вдалося сформувати DOCX.".to_string())?;
            continue;
        }
        let mut bytes = Vec::new();
        e.read_to_end(&mut bytes)
            .map_err(|_| "Не вдалося прочитати DOCX.".to_string())?;
        writer
            .start_file(&name, options)
            .map_err(|_| "Не вдалося сформувати DOCX.".to_string())?;
        if name.ends_with(".xml") {
            let content = String::from_utf8_lossy(&bytes);
            writer
                .write_all(replace_variables(&content, values)?.as_bytes())
                .map_err(|_| "Не вдалося записати DOCX.".to_string())?
        } else {
            writer
                .write_all(&bytes)
                .map_err(|_| "Не вдалося записати DOCX.".to_string())?
        }
    }
    writer
        .finish()
        .map_err(|_| "Не вдалося завершити DOCX.".to_string())?;
    Ok(())
}
pub(super) fn replace_variables(
    xml: &str,
    values: &HashMap<String, Value>,
) -> Result<String, String> {
    let tokens = extract_variables(xml);
    let mut result = xml.to_string();
    for token in tokens {
        let canonical = normalize_token(&token);
        let parts = canonical.split(':').collect::<Vec<_>>();
        let value = values
            .get(parts[0])
            .ok_or_else(|| format!("Немає значення для «{{{{{token}}}}}»."))?;
        let replacement = escape_xml(&apply_modifiers(value, &parts[1..])?);
        result = replace_word_token(&result, &format!("{{{{{token}}}}}"), &replacement);
        result = style_replacement(&result, &replacement, &parts[1..]);
    }
    Ok(result)
}

pub(super) fn style_replacement(xml: &str, replacement: &str, modifiers: &[&str]) -> String {
    let mut properties = String::new();
    if modifiers.contains(&"жирним") {
        properties.push_str("<w:b/>");
    }
    if modifiers.contains(&"підкреслити") {
        properties.push_str("<w:u w:val=\"single\"/>");
    }
    if properties.is_empty() {
        return xml.to_string();
    }
    let Some(text_start) = xml.find(replacement) else {
        return xml.to_string();
    };
    let run_start = xml[..text_start]
        .rfind("<w:r>")
        .or_else(|| xml[..text_start].rfind("<w:r "));
    let Some(run_start) = run_start else {
        return xml.to_string();
    };
    let Some(tag_end_rel) = xml[run_start..].find('>') else {
        return xml.to_string();
    };
    let tag_end = run_start + tag_end_rel + 1;
    if xml[run_start..tag_end].contains("<w:rPr") {
        return xml.to_string();
    }
    format!(
        "{}<w:rPr>{}</w:rPr>{}",
        &xml[..tag_end],
        properties,
        &xml[tag_end..]
    )
}
pub(super) fn replace_word_token(xml: &str, token: &str, replacement: &str) -> String {
    replace_word_token_with(xml, token, replacement, false)
}
#[allow(dead_code)]
pub(super) fn replace_word_token_case_insensitive(
    xml: &str,
    token: &str,
    replacement: &str,
) -> String {
    replace_word_token_occurrence_case_insensitive(xml, token, replacement, None)
}
pub(super) fn replace_word_token_occurrence_case_insensitive(
    xml: &str,
    token: &str,
    replacement: &str,
    occurrence: Option<usize>,
) -> String {
    // Private-use characters never occur in a template token, therefore a
    // short value such as `а` cannot match the temporary replacement.
    let placeholder = "\u{E000}";
    let replaced = match occurrence {
        Some(index) => replace_word_token_once_with(xml, token, placeholder, true, index),
        None => replace_word_token_with(xml, token, placeholder, true),
    };
    let replaced = if replacement.starts_with(char::is_whitespace)
        || replacement.ends_with(char::is_whitespace)
    {
        preserve_word_text_spaces(&replaced, placeholder)
    } else {
        replaced
    };
    replaced.replace(placeholder, replacement)
}

pub(super) fn replace_word_token_once_with(
    xml: &str,
    token: &str,
    replacement: &str,
    case_insensitive: bool,
    occurrence: usize,
) -> String {
    let Some((nodes, sn, so, en, eo)) = token_location(xml, token, case_insensitive, occurrence)
    else {
        return xml.to_string();
    };
    replace_at_location(xml, nodes, sn, so, en, eo, replacement)
}

pub(super) fn preserve_word_text_spaces(xml: &str, marker: &str) -> String {
    let mut result = xml.to_string();
    let mut search_from = 0;
    while let Some(relative) = result[search_from..].find(marker) {
        let marker_start = search_from + relative;
        let Some(tag_start) = result[..marker_start].rfind("<w:t") else {
            break;
        };
        let Some(relative_tag_end) = result[tag_start..marker_start].find('>') else {
            break;
        };
        let tag_end = tag_start + relative_tag_end;
        if !result[tag_start..tag_end].contains("xml:space=") {
            result.insert_str(tag_end, " xml:space=\"preserve\"");
            search_from = marker_start + " xml:space=\"preserve\"".len() + marker.len();
        } else {
            search_from = marker_start + marker.len();
        }
    }
    result
}
pub(super) fn replace_word_token_with(
    xml: &str,
    token: &str,
    replacement: &str,
    case_insensitive: bool,
) -> String {
    let mut result = xml.to_string();
    while let Some((nodes, sn, so, en, eo)) = token_location(&result, token, case_insensitive, 0) {
        result = replace_at_location(&result, nodes, sn, so, en, eo, replacement);
    }
    result
}

pub(super) fn replace_at_location(
    xml: &str,
    nodes: Vec<(usize, usize)>,
    sn: usize,
    so: usize,
    en: usize,
    eo: usize,
    replacement: &str,
) -> String {
    let mut vals = nodes
        .iter()
        .map(|(s, e)| xml[*s..*e].to_string())
        .collect::<Vec<_>>();
    if sn == en {
        vals[sn].replace_range(so..eo, replacement)
    } else {
        vals[sn].replace_range(so.., replacement);
        for value in &mut vals[sn + 1..en] {
            value.clear()
        }
        vals[en].replace_range(..eo, "")
    }
    let mut rebuilt = String::new();
    let mut cursor = 0;
    for ((start, end), value) in nodes.iter().zip(vals) {
        rebuilt.push_str(&xml[cursor..*start]);
        rebuilt.push_str(&value);
        cursor = *end
    }
    rebuilt.push_str(&xml[cursor..]);
    rebuilt
}
#[allow(clippy::type_complexity)]
pub(super) fn token_location(
    xml: &str,
    token: &str,
    case_insensitive: bool,
    occurrence: usize,
) -> Option<(Vec<(usize, usize)>, usize, usize, usize, usize)> {
    let nodes = word_text_nodes(xml);
    let text = nodes.iter().map(|(s, e)| &xml[*s..*e]).collect::<String>();
    let start = find_whole_text_token_nth(&text, token, case_insensitive, occurrence)?;
    let end = start + token.len();
    let (mut cursor, mut sl, mut el) = (0, None, None);
    for (i, (s, e)) in nodes.iter().enumerate() {
        let len = e - s;
        if sl.is_none() && start < cursor + len {
            sl = Some((i, start - cursor))
        }
        if end > cursor && end <= cursor + len {
            el = Some((i, end - cursor));
            break;
        }
        cursor += len
    }
    let (sn, so) = sl?;
    let (en, eo) = el?;
    Some((nodes, sn, so, en, eo))
}

pub(super) fn find_whole_text_token_nth(
    text: &str,
    token: &str,
    case_insensitive: bool,
    occurrence: usize,
) -> Option<usize> {
    let haystack = if case_insensitive {
        text.to_lowercase()
    } else {
        text.into()
    };
    let needle = if case_insensitive {
        token.to_lowercase()
    } else {
        token.into()
    };
    let mut from = 0;
    let mut matched = 0;
    while let Some(relative) = haystack[from..].find(&needle) {
        let start = from + relative;
        let end = start + needle.len();
        let left = text[..start].chars().next_back();
        let right = text[end..].chars().next();
        let starts_with_word = token.chars().next().is_some_and(char::is_alphanumeric);
        let ends_with_word = token.chars().next_back().is_some_and(char::is_alphanumeric);
        if (!starts_with_word || !left.is_some_and(char::is_alphanumeric))
            && (!ends_with_word || !right.is_some_and(char::is_alphanumeric))
        {
            if matched == occurrence {
                return Some(start);
            }
            matched += 1;
        }
        from = end;
    }
    None
}
pub(super) fn word_text_nodes(xml: &str) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(rel) = xml[from..].find("<w:t") {
        let tag = from + rel;
        let Some(gt) = xml[tag..].find('>') else {
            break;
        };
        let start = tag + gt + 1;
        let Some(rel_end) = xml[start..].find("</w:t>") else {
            break;
        };
        let end = start + rel_end;
        out.push((start, end));
        from = end + 6
    }
    out
}
pub(super) fn sentence_case(v: &str) -> String {
    let mut c = v.trim().chars();
    c.next()
        .map(|f| f.to_lowercase().collect::<String>() + c.as_str())
        .unwrap_or_default()
}
pub(super) fn name_case(v: &str) -> String {
    v.split_whitespace()
        .map(|w| {
            w.split('-')
                .map(|p| {
                    let mut c = p.chars();
                    c.next()
                        .map(|f| {
                            f.to_uppercase().collect::<String>()
                                + &c.flat_map(char::to_lowercase).collect::<String>()
                        })
                        .unwrap_or_default()
                })
                .collect::<Vec<_>>()
                .join("-")
        })
        .collect::<Vec<_>>()
        .join(" ")
}
pub(super) fn escape_xml(v: &str) -> String {
    v.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
pub(super) fn safe_name(v: &str) -> String {
    v.chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect::<String>()
        .trim()
        .into()
}
