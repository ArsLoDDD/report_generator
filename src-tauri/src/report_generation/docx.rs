use super::*;
use std::{
    io::Seek,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_DOCX_FILE_SIZE: u64 = 128 * 1024 * 1024;
const MAX_DOCX_ENTRIES: usize = 4_096;
const MAX_DOCX_ENTRY_SIZE: u64 = 128 * 1024 * 1024;
const MAX_DOCX_UNCOMPRESSED_SIZE: u64 = 512 * 1024 * 1024;
const MAX_COMPRESSION_RATIO: u64 = 500;

static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn is_supported_word_story(name: &str) -> bool {
    name == "word/document.xml"
        || name == "word/footnotes.xml"
        || name == "word/endnotes.xml"
        || (name.starts_with("word/header") && name.ends_with(".xml"))
        || (name.starts_with("word/footer") && name.ends_with(".xml"))
}

fn is_unsafe_archive_name(name: &str) -> bool {
    name.starts_with('/')
        || name.starts_with('\\')
        || name.contains('\\')
        || name.split('/').any(|part| part == "..")
}

fn is_active_docx_part(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with("vbaproject.bin")
        || lower.starts_with("word/activex/")
        || lower.starts_with("word/embeddings/")
        || lower.ends_with("attachedtemplate.bin")
}

fn validate_docx_path(path: &Path) -> Result<(), String> {
    let metadata = fs::metadata(path)
        .map_err(|_| "Не вдалося прочитати властивості DOCX-файлу.".to_string())?;
    if metadata.len() > MAX_DOCX_FILE_SIZE {
        return Err(format!(
            "DOCX завеликий: дозволено не більше {} МБ.",
            MAX_DOCX_FILE_SIZE / 1024 / 1024
        ));
    }
    Ok(())
}

fn validate_docx_archive<R: Read + Seek>(zip: &mut ZipArchive<R>) -> Result<(), String> {
    if zip.len() > MAX_DOCX_ENTRIES {
        return Err("DOCX містить забагато внутрішніх файлів.".into());
    }
    let mut total = 0_u64;
    let mut has_document = false;
    for index in 0..zip.len() {
        let entry = zip
            .by_index(index)
            .map_err(|_| "Не вдалося перевірити структуру DOCX.".to_string())?;
        let name = entry.name();
        if is_unsafe_archive_name(name) {
            return Err("DOCX містить небезпечний шлях усередині архіву.".into());
        }
        if is_active_docx_part(name) {
            return Err(format!(
                "DOCX містить активне або вбудоване вкладення «{name}». Видаліть макроси, ActiveX чи OLE-вкладення перед використанням."
            ));
        }
        has_document |= name == "word/document.xml";
        let size = entry.size();
        if size > MAX_DOCX_ENTRY_SIZE {
            return Err(format!("Внутрішній файл DOCX «{name}» завеликий."));
        }
        total = total.saturating_add(size);
        if total > MAX_DOCX_UNCOMPRESSED_SIZE {
            return Err("Розпакований вміст DOCX перевищує безпечний ліміт.".into());
        }
        let compressed = entry.compressed_size();
        if compressed > 0 && size / compressed.max(1) > MAX_COMPRESSION_RATIO {
            return Err(format!(
                "DOCX містить підозріло сильно стиснений файл «{name}»."
            ));
        }
    }
    if !has_document {
        return Err("У DOCX не знайдено основний текст документа.".into());
    }
    Ok(())
}

fn unique_partial_path(output: &Path) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    output.with_file_name(format!(
        ".{}.partial-{}-{timestamp}-{sequence}",
        output
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("document.docx"),
        std::process::id()
    ))
}

pub(super) fn read_variables(path: &Path) -> Result<Vec<String>, String> {
    validate_docx_path(path)?;
    let file = File::open(path)
        .map_err(|_| "Не вдалося відкрити шаблон. Перевірте шлях і доступ.".to_string())?;
    let mut zip =
        ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?;
    validate_docx_archive(&mut zip)?;
    let mut out = Vec::new();
    for i in 0..zip.len() {
        let mut e = zip
            .by_index(i)
            .map_err(|_| "Не вдалося прочитати DOCX.".to_string())?;
        if !is_supported_word_story(e.name()) {
            continue;
        }
        let mut s = String::new();
        e.read_to_string(&mut s)
            .map_err(|_| format!("Не вдалося прочитати текстову частину «{}».", e.name()))?;
        out.extend(extract_variables_checked(&s)?);
    }
    out.sort();
    out.dedup();
    Ok(out)
}

/// Text used by the local template analyser. It reads only the XML stored in
/// the selected DOCX file and never sends the document anywhere.
pub fn read_docx_text(path: &Path) -> Result<String, String> {
    validate_docx_path(path)?;
    let file = File::open(path)
        .map_err(|_| "Не вдалося відкрити DOCX-файл. Перевірте шлях і доступ.".to_string())?;
    let mut zip =
        ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-документом.".to_string())?;
    validate_docx_archive(&mut zip)?;
    let mut text = String::new();
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|_| "Не вдалося прочитати DOCX-документ.".to_string())?;
        if !is_supported_word_story(entry.name()) {
            continue;
        }
        let mut xml = String::new();
        entry
            .read_to_string(&mut xml)
            .map_err(|_| format!("Не вдалося прочитати текстову частину «{}».", entry.name()))?;
        text.push_str(&word_xml_visible_text(&xml));
        text.push('\n');
    }
    Ok(text)
}

/// Reads the body paragraphs that are visible in Word together with the most
/// important paragraph layout properties. This stays local and is solely for
/// the analyser preview; DOCX generation still preserves the original XML.
pub fn read_docx_paragraphs(path: &Path) -> Result<Vec<DocxParagraphPreview>, String> {
    validate_docx_path(path)?;
    let file = File::open(path)
        .map_err(|_| "Не вдалося відкрити DOCX-файл. Перевірте шлях і доступ.".to_string())?;
    let mut zip =
        ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-документом.".to_string())?;
    validate_docx_archive(&mut zip)?;
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
    if output.exists() {
        return Err("Файл шаблону з такою назвою вже існує.".into());
    }
    let temporary_output = unique_partial_path(output);
    let result = create_template_archive(input, &temporary_output, replacements).and_then(|_| {
        verify_docx_xml(&temporary_output, false)?;
        File::options()
            .write(true)
            .open(&temporary_output)
            .and_then(|file| file.sync_all())
            .map_err(|_| "Не вдалося завершити запис DOCX-шаблону на диск.".to_string())?;
        fs::hard_link(&temporary_output, output).map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "Файл шаблону з такою назвою вже існує.".to_string()
            } else {
                "Не вдалося безпечно зберегти створений DOCX-шаблон.".to_string()
            }
        })?;
        let _ = fs::remove_file(&temporary_output);
        Ok(())
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
    validate_docx_path(input)?;
    let mut zip = ZipArchive::new(
        File::open(input).map_err(|_| "Не вдалося відкрити вихідний DOCX-файл.".to_string())?,
    )
    .map_err(|_| "Файл не є коректним DOCX-документом.".to_string())?;
    validate_docx_archive(&mut zip)?;
    let mut writer = ZipWriter::new(
        File::options()
            .write(true)
            .create_new(true)
            .open(output)
            .map_err(|_| "Не вдалося створити новий DOCX-шаблон.".to_string())?,
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
        if is_supported_word_story(&name) {
            let mut xml = String::from_utf8_lossy(&bytes).into_owned();
            // A full name must be replaced before its surname; otherwise the
            // shorter replacement destroys the longer source text first.
            for (value, replacement, occurrence) in replacements {
                if !value.is_empty() {
                    let replacement = escape_xml(replacement)
                        .replace("\r\n", "\n")
                        .replace('\r', "\n")
                        .replace('\n', "</w:t><w:br/><w:t>");
                    xml = replace_word_token_occurrence_case_insensitive(
                        &xml,
                        value,
                        &replacement,
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
    let output_file = writer
        .finish()
        .map_err(|_| "Не вдалося завершити створення DOCX-шаблону.".to_string())?;
    output_file
        .sync_all()
        .map_err(|_| "Не вдалося синхронізувати створений DOCX-шаблон.".to_string())?;
    Ok(())
}
fn extract_variables_checked(xml: &str) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let segments = word_text_segments(xml);
    if segments.is_empty() {
        extract_variables_from_text(&xml_visible_text(xml), &mut out)?;
    } else {
        for nodes in segments {
            let text = nodes
                .iter()
                .map(|(start, end)| &xml[*start..*end])
                .collect::<String>();
            extract_variables_from_text(&text, &mut out)?;
        }
    }
    Ok(out)
}

fn extract_variables_from_text(text: &str, out: &mut Vec<String>) -> Result<(), String> {
    let mut rest = text;
    loop {
        let opening = rest.find("{{");
        let closing = rest.find("}}");
        if closing.is_some_and(|end| opening.is_none_or(|start| end < start)) {
            return Err("У шаблоні знайдено закривальні дужки «}}» без початку змінної.".into());
        }
        let Some(start) = opening else {
            break;
        };
        let after = &rest[start + 2..];
        if let Some(end) = after.find("}}") {
            if after[..end].contains("{{") {
                return Err("У шаблоні знайдено вкладені подвійні дужки змінної.".into());
            }
            out.push(after[..end].into());
            rest = &after[end + 2..]
        } else {
            return Err("У шаблоні знайдено незакриту змінну «{{…».".into());
        }
    }
    if rest.contains("}}") {
        return Err("У шаблоні знайдено закривальні дужки «}}» без початку змінної.".into());
    }
    Ok(())
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
    validate_docx_path(input)?;
    let mut zip = ZipArchive::new(
        File::open(input).map_err(|_| "Не вдалося відкрити DOCX-шаблон.".to_string())?,
    )
    .map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?;
    validate_docx_archive(&mut zip)?;
    let mut writer = ZipWriter::new(
        File::options()
            .write(true)
            .create_new(true)
            .open(output)
            .map_err(|_| {
                "Не вдалося створити DOCX-файл без перезапису наявних даних.".to_string()
            })?,
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
        if is_supported_word_story(&name) {
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
    let output_file = writer
        .finish()
        .map_err(|_| "Не вдалося завершити DOCX.".to_string())?;
    output_file
        .sync_all()
        .map_err(|_| "Не вдалося синхронізувати створений DOCX.".to_string())?;
    Ok(())
}

fn verify_docx_xml(path: &Path, require_resolved_tokens: bool) -> Result<(), String> {
    validate_docx_path(path)?;
    let mut archive = ZipArchive::new(
        File::open(path).map_err(|_| "Не вдалося повторно відкрити створений DOCX.".to_string())?,
    )
    .map_err(|_| "Створений DOCX має пошкоджену ZIP-структуру.".to_string())?;
    validate_docx_archive(&mut archive)?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|_| "Не вдалося перевірити вміст створеного DOCX.".to_string())?;
        if !entry.name().ends_with(".xml") {
            continue;
        }
        let name = entry.name().to_string();
        let mut contents = Vec::new();
        entry
            .read_to_end(&mut contents)
            .map_err(|_| "Створений DOCX записано не повністю.".to_string())?;
        let mut xml_reader = Reader::from_reader(contents.as_slice());
        xml_reader.config_mut().trim_text(false);
        let mut buffer = Vec::new();
        loop {
            match xml_reader.read_event_into(&mut buffer) {
                Ok(Event::Eof) => break,
                Ok(_) => buffer.clear(),
                Err(_) => {
                    return Err(format!(
                        "Створений DOCX містить пошкоджений XML у «{name}»."
                    ))
                }
            }
        }
        if require_resolved_tokens && is_supported_word_story(&name) {
            let xml = String::from_utf8_lossy(&contents);
            let unresolved = extract_variables_checked(&xml)?;
            if !unresolved.is_empty() {
                return Err(format!(
                    "У створеному DOCX залишилися незаповнені змінні: {}.",
                    unresolved
                        .iter()
                        .map(|value| format!("{{{{{value}}}}}"))
                        .collect::<Vec<_>>()
                        .join(", ")
                ));
            }
        }
    }
    Ok(())
}

pub(super) fn verify_generated_docx(path: &Path) -> Result<(), String> {
    verify_docx_xml(path, true)
}
pub(super) fn replace_variables(
    xml: &str,
    values: &HashMap<String, Value>,
) -> Result<String, String> {
    let tokens = extract_variables_checked(xml)?;
    let mut result = xml.to_string();
    for token in tokens {
        let canonical = normalize_token(&token);
        let parts = canonical.split(':').collect::<Vec<_>>();
        let value = values
            .get(parts[0])
            .ok_or_else(|| format!("Немає значення для «{{{{{token}}}}}»."))?;
        let replacement = escape_xml(&apply_modifiers(value, &parts[1..])?)
            .replace("\r\n", "\n")
            .replace('\r', "\n")
            .replace('\n', "</w:t><w:br/><w:t>");
        result = replace_word_token_styled(
            &result,
            &format!("{{{{{token}}}}}"),
            &replacement,
            &parts[1..],
        );
    }
    Ok(result)
}

fn style_properties(modifiers: &[&str]) -> String {
    let mut properties = String::new();
    if modifiers.contains(&"жирним") {
        properties.push_str("<w:b/>");
    }
    if modifiers.contains(&"підкреслити") {
        properties.push_str("<w:u w:val=\"single\"/>");
    }
    properties
}

fn unique_marker(xml: &str, sequence: usize) -> String {
    let mut salt = sequence;
    loop {
        let marker = format!("__RAPORTGEN_TOKEN_{salt}_{}__", std::process::id());
        if !xml.contains(&marker) {
            return marker;
        }
        salt += 1;
    }
}

fn merge_style_at_marker(xml: &str, marker: &str, modifiers: &[&str]) -> String {
    let properties = style_properties(modifiers);
    if properties.is_empty() {
        return xml.to_string();
    }
    let Some(marker_start) = xml.find(marker) else {
        return xml.to_string();
    };
    let Some(run_start) = xml[..marker_start]
        .rfind("<w:r>")
        .or_else(|| xml[..marker_start].rfind("<w:r "))
    else {
        return xml.to_string();
    };
    let Some(open_end_relative) = xml[run_start..].find('>') else {
        return xml.to_string();
    };
    let open_end = run_start + open_end_relative + 1;
    let Some(run_end_relative) = xml[marker_start..].find("</w:r>") else {
        return xml.to_string();
    };
    let run_end = marker_start + run_end_relative;
    let run_body = &xml[open_end..run_end];
    if let Some(rpr_start_relative) = run_body.find("<w:rPr") {
        let rpr_start = open_end + rpr_start_relative;
        let Some(rpr_end_relative) = xml[rpr_start..marker_start].find("</w:rPr>") else {
            return xml.to_string();
        };
        let rpr_end = rpr_start + rpr_end_relative;
        let existing = &xml[rpr_start..rpr_end];
        let mut missing = String::new();
        if modifiers.contains(&"жирним") && !existing.contains("<w:b") {
            missing.push_str("<w:b/>");
        }
        if modifiers.contains(&"підкреслити") && !existing.contains("<w:u") {
            missing.push_str("<w:u w:val=\"single\"/>");
        }
        if missing.is_empty() {
            return xml.to_string();
        }
        return format!("{}{}{}", &xml[..rpr_end], missing, &xml[rpr_end..]);
    }
    format!(
        "{}<w:rPr>{}</w:rPr>{}",
        &xml[..open_end],
        properties,
        &xml[open_end..]
    )
}

fn replace_word_token_styled(
    xml: &str,
    token: &str,
    replacement: &str,
    modifiers: &[&str],
) -> String {
    let mut result = xml.to_string();
    let mut sequence = 0;
    while let Some((nodes, sn, so, en, eo)) = token_location(&result, token, false, 0) {
        let marker = unique_marker(&result, sequence);
        result = replace_at_location(&result, nodes, sn, so, en, eo, &marker);
        if replacement.starts_with(char::is_whitespace)
            || replacement.ends_with(char::is_whitespace)
        {
            result = preserve_word_text_spaces(&result, &marker);
        }
        result = merge_style_at_marker(&result, &marker, modifiers);
        result = result.replacen(&marker, replacement, 1);
        sequence += 1;
    }
    result
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
    // The marker is generated per document and checked for absence, so a
    // legitimate private-use glyph in the source can never be overwritten.
    let placeholder = unique_marker(xml, occurrence.unwrap_or_default());
    let replaced = match occurrence {
        Some(index) => replace_word_token_once_with(xml, token, &placeholder, true, index),
        None => replace_word_token_with(xml, token, &placeholder, true),
    };
    let replaced = if replacement.starts_with(char::is_whitespace)
        || replacement.ends_with(char::is_whitespace)
    {
        preserve_word_text_spaces(&replaced, &placeholder)
    } else {
        replaced
    };
    replaced.replace(&placeholder, replacement)
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
    let mut remaining = occurrence;
    for nodes in word_text_segments(xml) {
        let text = nodes.iter().map(|(s, e)| &xml[*s..*e]).collect::<String>();
        let mut local_occurrence = 0;
        while let Some(start) =
            find_whole_text_token_nth(&text, token, case_insensitive, local_occurrence)
        {
            if remaining > 0 {
                remaining -= 1;
                local_occurrence += 1;
                continue;
            }
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
            return Some((nodes, sn, so, en, eo));
        }
    }
    None
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
    word_text_nodes_with_offset(xml, 0)
}

fn word_text_nodes_with_offset(xml: &str, offset: usize) -> Vec<(usize, usize)> {
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
        out.push((offset + start, offset + end));
        from = end + 6
    }
    out
}

fn word_text_segments(xml: &str) -> Vec<Vec<(usize, usize)>> {
    let mut segments = Vec::new();
    let mut from = 0;
    while let Some(relative_start) = xml[from..].find("<w:p") {
        let paragraph_start = from + relative_start;
        let Some(open_end_relative) = xml[paragraph_start..].find('>') else {
            break;
        };
        let open_end = paragraph_start + open_end_relative + 1;
        let Some(close_relative) = xml[open_end..].find("</w:p>") else {
            break;
        };
        let paragraph_end = open_end + close_relative + "</w:p>".len();
        let nodes =
            word_text_nodes_with_offset(&xml[paragraph_start..paragraph_end], paragraph_start);
        if !nodes.is_empty() {
            segments.push(nodes);
        }
        from = paragraph_end;
    }
    if segments.is_empty() {
        let nodes = word_text_nodes(xml);
        if !nodes.is_empty() {
            segments.push(nodes);
        }
    }
    segments
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
