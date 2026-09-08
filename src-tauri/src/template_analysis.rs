use super::*;

mod commands;
mod detection;

pub(crate) use commands::*;
pub(crate) use detection::*;

pub(crate) fn ordered_analysis_replacements(
    items: Vec<TemplateAnalysisReplacement>,
) -> Vec<(String, String, Option<usize>)> {
    let (mut detected, manual): (Vec<_>, Vec<_>) = items
        .into_iter()
        .partition(|item| item.replacement.is_none());
    detected.sort_by_key(|right| std::cmp::Reverse(right.value.chars().count()));
    detected
        .into_iter()
        .chain(manual)
        .map(|item| {
            let replacement = item
                .replacement
                .unwrap_or_else(|| format!("{{{{{}}}}}", item.token));
            (item.value, replacement, item.occurrence)
        })
        .collect()
}

pub const DATABASE_FILE_NAME: &str = "особовий_склад.db";
pub const LEGACY_DATABASE_DIRECTORY_NAME: &str = "База даних";
pub const TEMPLATES_DIRECTORY_NAME: &str = "Шаблони";
pub const REPORTS_DIRECTORY_NAME: &str = "Згенеровані рапорти";
pub const BACKUPS_DIRECTORY_NAME: &str = "Резервні копії";
pub const CUSTOM_VARIABLES_FILE_NAME: &str = "custom_variables.json";

pub(crate) fn template_analysis_value(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
    value: &str,
    token: &str,
    label: &str,
    category: &str,
) {
    template_analysis_value_with_confidence(
        proposals,
        text,
        value,
        token,
        label,
        category,
        "high",
        "Точний збіг із даними програми.",
    );
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn template_analysis_value_with_confidence(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
    value: &str,
    token: &str,
    label: &str,
    category: &str,
    confidence: &str,
    reason: &str,
) {
    let value = value.trim();
    let occurrences = whole_text_match_count(text, value);
    if value.is_empty()
        || occurrences == 0
        || proposals
            .iter()
            .any(|item| item.value == value && item.token == token)
    {
        return;
    }
    proposals.push(TemplateAnalysisProposal {
        value: value.into(),
        token: token.into(),
        label: label.into(),
        category: category.into(),
        occurrences: occurrences as u32,
        confidence: confidence.into(),
        auto_select: confidence == "high" && occurrences == 1,
        reason: if occurrences > 1 {
            format!(
                "{reason} Значення повторюється {occurrences} рази, тому потрібне підтвердження."
            )
        } else {
            reason.into()
        },
        alternatives: analysis_alternatives(token),
    });
}

pub(crate) fn analysis_alternatives(token: &str) -> Vec<TemplateAnalysisAlternative> {
    let values: &[(&str, &str)] = match token {
        "назва_екіпажу_1" => &[
            ("екіпаж_1_назва", "Назва обраного екіпажу"),
            ("військовий_1_екіпаж", "Екіпаж обраного військовослужбовця"),
        ],
        "екіпаж_1_назва" => &[
            ("назва_екіпажу_1", "Довільна назва екіпажу в документі"),
            ("військовий_1_екіпаж", "Екіпаж обраного військовослужбовця"),
        ],
        "назва_позиції_1" => &[
            ("позиція_1_назва", "Назва обраної позиції"),
            ("екіпаж_1_позиція", "Позиція обраного екіпажу"),
        ],
        "населений_пункт_1" => {
            &[("екіпаж_1_район_розвідки", "Район розвідки обраного екіпажу")]
        }
        "екіпаж_1_позиція" => &[
            ("позиція_1_назва", "Назва обраної позиції"),
            ("назва_позиції_1", "Текстовий параметр документа"),
        ],
        "позиція_1_назва" => &[
            ("екіпаж_1_позиція", "Позиція обраного екіпажу"),
            ("назва_позиції_1", "Текстовий параметр документа"),
        ],
        _ => &[],
    };
    values
        .iter()
        .map(|(token, label)| TemplateAnalysisAlternative {
            token: (*token).into(),
            label: (*label).into(),
        })
        .collect()
}

/// Counts only complete values. It deliberately does not treat `Арсен` as a
/// match inside `Арсеній`, nor any other shorter value inside a longer word.
pub(crate) fn whole_text_match_count(text: &str, value: &str) -> usize {
    let value = value.trim();
    if value.is_empty() {
        return 0;
    }
    let haystack = text.to_lowercase();
    let needle = value.to_lowercase();
    let mut count = 0;
    let mut from = 0;
    while let Some(relative) = haystack[from..].find(&needle) {
        let start = from + relative;
        let end = start + needle.len();
        let left = haystack[..start].chars().next_back();
        let right = haystack[end..].chars().next();
        let starts_with_word = needle.chars().next().is_some_and(char::is_alphanumeric);
        let ends_with_word = needle
            .chars()
            .next_back()
            .is_some_and(char::is_alphanumeric);
        if (!starts_with_word || !left.is_some_and(char::is_alphanumeric))
            && (!ends_with_word || !right.is_some_and(char::is_alphanumeric))
        {
            count += 1;
        }
        from = end;
    }
    count
}

pub(crate) fn explicit_field_value(text: &str, field_name: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let marker = field_name.to_lowercase();
    let mut offset = 0;
    while let Some(relative) = lower[offset..].find(&marker) {
        let end = offset + relative + marker.len();
        let following = &text[end..];
        let trimmed = following.trim_start_matches(char::is_whitespace);
        let Some(rest) = trimmed
            .strip_prefix(':')
            .or_else(|| trimmed.strip_prefix('—'))
            .or_else(|| trimmed.strip_prefix('-'))
            .or_else(|| trimmed.strip_prefix('№'))
        else {
            offset = end;
            continue;
        };
        let prefix = if trimmed.starts_with('№') {
            "№"
        } else {
            ""
        };
        let value = rest
            .trim_start()
            .chars()
            .take_while(|character| !matches!(character, '\n' | '\r' | ';'))
            .take(180)
            .collect::<String>();
        let value = format!("{prefix}{}", value.trim().trim_end_matches('.'));
        if value.chars().count() >= 1 {
            return Some(value);
        }
        offset = end;
    }
    None
}

pub(crate) fn detected_registry_document_proposals(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
) {
    for field in analysis_document_fields() {
        let Some(value) = explicit_field_value(text, &field.name) else {
            continue;
        };
        template_analysis_value_with_confidence(
            proposals,
            text,
            &value,
            &format!("{}_1", field.id),
            &field.name,
            "Параметри документа",
            "high",
            "Значення знайдено біля явної назви поля з єдиного реєстру мови шаблонів.",
        );
    }
}

pub(crate) fn confidence_score(value: &str) -> u8 {
    match value {
        "high" => 2,
        "medium" => 1,
        _ => 0,
    }
}

pub(crate) fn proposal_priority(proposal: &TemplateAnalysisProposal) -> u8 {
    confidence_score(&proposal.confidence) * 10
        + u8::from(proposal.category == "Параметри документа")
}

pub(crate) fn consolidate_analysis_proposals(proposals: &mut Vec<TemplateAnalysisProposal>) {
    let mut consolidated: Vec<TemplateAnalysisProposal> = Vec::new();
    for mut proposal in proposals.drain(..) {
        if let Some(index) = consolidated
            .iter()
            .position(|item| item.value.eq_ignore_ascii_case(&proposal.value))
        {
            if consolidated[index].token == proposal.token {
                continue;
            }
            if proposal_priority(&proposal) > proposal_priority(&consolidated[index]) {
                std::mem::swap(&mut consolidated[index], &mut proposal);
            }
            let alternative = TemplateAnalysisAlternative {
                token: proposal.token,
                label: proposal.label,
            };
            if consolidated[index].token != alternative.token
                && !consolidated[index]
                    .alternatives
                    .iter()
                    .any(|item| item.token == alternative.token)
            {
                consolidated[index].alternatives.push(alternative);
            }
            consolidated[index].auto_select = false;
            consolidated[index].reason =
                "Для цього фрагмента можливі різні змінні. Перевірте потрібний варіант.".into();
        } else {
            consolidated.push(proposal);
        }
    }

    let full_names = consolidated
        .iter()
        .filter(|proposal| proposal.token.ends_with("_піб"))
        .map(|proposal| (proposal.value.to_lowercase(), proposal.occurrences))
        .collect::<Vec<_>>();
    consolidated.retain(|proposal| {
        if !(proposal.token.ends_with("_прізвище")
            || proposal.token.ends_with("_імя")
            || proposal.token.ends_with("_по_батькові"))
        {
            return true;
        }
        !full_names.iter().any(|(full_name, occurrences)| {
            full_name.contains(&proposal.value.to_lowercase())
                && proposal.occurrences <= *occurrences
        })
    });
    *proposals = consolidated;
}

pub(crate) fn contextual_parameter_base(context: &str, is_date: bool) -> Option<&'static str> {
    let has = |fragment: &str| context.contains(fragment);
    if is_date {
        if has("втрат") {
            return Some("дата_втрати");
        }
        if has("знищ") {
            return Some("дата_знищення");
        }
        if has("передач") {
            return Some("дата_передачі");
        }
        if has("прийман") || has("прийня") {
            return Some("дата_приймання");
        }
        if has("прибут") {
            return Some("дата_прибуття");
        }
        if has("вибут") {
            return Some("дата_вибуття");
        }
        if has("повернен") || has("повернут") {
            return Some("дата_повернення");
        }
        if has("розпоряджен") {
            return Some("дата_розпорядження");
        }
        if has("наказ") {
            return Some("дата_наказу");
        }
        if has("рапорт") {
            return Some("дата_рапорту");
        }
        return None;
    }
    if (has("бойов") && has("розпоряджен")) || has("бр№") || has("бр №") {
        return Some("номер_бойового_розпорядження");
    }
    if has("бойов") && has("наказ") {
        return Some("номер_бойового_наказу");
    }
    for (fragment, token) in [
        ("розпоряджен", "номер_розпорядження"),
        ("наказ", "номер_наказу"),
        ("рапорт", "номер_рапорту"),
        ("доручен", "номер_доручення"),
        ("акт", "номер_акта"),
        ("накладн", "номер_накладної"),
        ("заявк", "номер_заявки"),
        ("телеграм", "номер_телеграми"),
        ("повідомлен", "номер_повідомлення"),
        ("довідк", "номер_довідки"),
        ("протокол", "номер_протоколу"),
    ] {
        if has(fragment) {
            return Some(token);
        }
    }
    None
}

pub(crate) fn next_parameter_token(counters: &mut HashMap<String, usize>, base: &str) -> String {
    let count = counters.entry(base.into()).or_default();
    *count += 1;
    format!("{base}_{count}")
}
