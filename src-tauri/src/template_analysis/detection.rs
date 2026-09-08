use super::*;

#[cfg(test)]
pub(crate) fn detected_document_proposals(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
) {
    detected_document_proposals_for_edition(proposals, text, false);
}

pub(crate) fn detected_document_proposals_for_edition(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
    is_simple_edition: bool,
) {
    detected_registry_document_proposals(proposals, text);
    let words = text.split_whitespace().collect::<Vec<_>>();
    let mut parameter_counters = HashMap::new();
    let mut unit_index = 0;
    let mut detected_units = Vec::new();
    for (index, raw) in words.iter().enumerate() {
        let value = raw.trim_matches(|character: char| {
            matches!(character, ',' | ';' | ':' | '.' | '(' | ')' | '«' | '»')
        });
        let digits = value
            .chars()
            .filter(|character| character.is_ascii_digit())
            .count();
        let separators = value
            .chars()
            .filter(|character| matches!(character, '.' | '/'))
            .count();
        let context = words[index.saturating_sub(8)..=index]
            .join(" ")
            .to_lowercase();
        if digits == 8 && separators == 2 {
            let contextual_base = contextual_parameter_base(&context, true);
            let base = contextual_base.unwrap_or("дата_рапорту");
            let token = next_parameter_token(&mut parameter_counters, base);
            let label = analysis_document_fields()
                .iter()
                .find(|field| field.id == base)
                .map(|field| field.name.as_str())
                .unwrap_or("Дата в документі");
            template_analysis_value_with_confidence(
                proposals,
                text,
                value,
                &token,
                label,
                "Параметри документа",
                if contextual_base.is_some() {
                    "high"
                } else {
                    "medium"
                },
                if contextual_base.is_some() {
                    "Тип дати визначено зі слів поруч із нею."
                } else {
                    "Значення схоже на дату, але її призначення не визначене з контексту."
                },
            );
        }
        if value.starts_with('№') && value.len() > 1 {
            let contextual_base = contextual_parameter_base(&context, false);
            let base = contextual_base.unwrap_or("номер_документа");
            let token = next_parameter_token(&mut parameter_counters, base);
            let label = analysis_document_fields()
                .iter()
                .find(|field| field.id == base)
                .map(|field| field.name.as_str())
                .unwrap_or("Номер документа");
            template_analysis_value_with_confidence(
                proposals,
                text,
                value,
                &token,
                label,
                "Параметри документа",
                if contextual_base.is_some() {
                    "high"
                } else {
                    "medium"
                },
                if contextual_base.is_some() {
                    "Тип номера визначено зі слів поруч із ним."
                } else {
                    "Знайдено номер документа без достатнього контексту для точного типу."
                },
            );
        }
        let normalized = value.trim_matches(|character: char| !character.is_alphanumeric());
        let compact_unit = if normalized.chars().count() == 5
            && matches!(normalized.chars().next(), Some('А' | 'а' | 'A' | 'a'))
            && normalized
                .chars()
                .skip(1)
                .all(|character| character.is_ascii_digit())
        {
            Some((
                normalized.to_string(),
                normalized.chars().skip(1).collect::<String>(),
            ))
        } else if matches!(normalized, "А" | "а" | "A" | "a") {
            words.get(index + 1).and_then(|next| {
                let digits = next.trim_matches(|character: char| !character.is_ascii_digit());
                (digits.len() == 4 && digits.chars().all(|character| character.is_ascii_digit()))
                    .then(|| (format!("{normalized} {digits}"), digits.to_string()))
            })
        } else {
            None
        };
        if let Some((unit, digits)) = compact_unit {
            let key = format!("А{digits}");
            if detected_units
                .iter()
                .any(|existing: &String| existing == &key)
            {
                continue;
            }
            detected_units.push(key);
            unit_index += 1;
            let token = format!("військова_частина_{unit_index}");
            template_analysis_value(
                proposals,
                text,
                &unit,
                &token,
                &format!("Військова частина {unit_index}"),
                "Параметри документа",
            );
        }
    }
    for (marker, token, label) in [
        ("екіпаж ", "назва_екіпажу_1", "Назва екіпажу в документі"),
        ("позиція ", "назва_позиції_1", "Назва позиції"),
        ("позиції ", "назва_позиції_1", "Назва позиції"),
    ] {
        if let Some(value) = document_phrase_after(text, marker) {
            template_analysis_value_with_confidence(
                proposals,
                text,
                &value,
                token,
                label,
                "Параметри документа",
                "high",
                "Значення знайдено безпосередньо після однозначного маркера.",
            );
        }
    }
    for marker in ["н.п.", "н. п.", "м.", "с.", "смт."] {
        if let Some(value) = document_settlement_after(text, marker) {
            template_analysis_value(
                proposals,
                text,
                &value,
                "населений_пункт_1",
                "Населений пункт",
                "Параметри документа",
            );
        }
    }
    detected_document_person_proposals(proposals, text, is_simple_edition);
}

pub(crate) fn document_settlement_after(text: &str, marker: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let start = lower.find(marker)? + marker.len();
    let words = text[start..]
        .trim_start_matches(|character: char| character.is_whitespace() || character == '.')
        .split_whitespace()
        .map(|word| {
            word.trim_matches(|character: char| {
                !character.is_alphabetic() && character != '-' && character != '\''
            })
        })
        .take_while(|word| {
            !matches!(
                word.to_lowercase().as_str(),
                "в" | "у" | "на" | "смузі" | "районі" | "та" | "з"
            )
        })
        .take(4)
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();
    (!words.is_empty()).then(|| words.join(" "))
}

/// Finds a name written in the report itself. This is intentionally separate
/// from the personnel database: a historical report may contain a person who
/// was renamed, removed, or has not yet been entered into the application.
pub(crate) fn detected_document_person_proposals(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
    is_simple_edition: bool,
) {
    let words = text
        .split_whitespace()
        .filter_map(|word| {
            let value = word
                .trim_matches(|character: char| !character.is_alphabetic() && character != '\'');
            (value.chars().count() >= 2).then(|| value.to_string())
        })
        .collect::<Vec<_>>();
    let ranks = [
        "солдат",
        "старший солдат",
        "матрос",
        "сержант",
        "молодший сержант",
        "старший сержант",
        "штаб-сержант",
        "головний сержант",
        "молодший лейтенант",
        "лейтенант",
        "старший лейтенант",
        "капітан",
        "майор",
        "підполковник",
        "полковник",
        "генерал",
    ];
    for (index, triple) in words.windows(3).enumerate() {
        let first = &triple[0];
        let second = &triple[1];
        let third = &triple[2];
        let first_title = first.chars().next().is_some_and(char::is_uppercase)
            && !first.chars().skip(1).any(char::is_uppercase);
        let second_title = second.chars().next().is_some_and(char::is_uppercase)
            && !second.chars().skip(1).any(char::is_uppercase);
        let third_title = third.chars().next().is_some_and(char::is_uppercase)
            && !third.chars().skip(1).any(char::is_uppercase);
        let first_upper = first.chars().any(char::is_alphabetic)
            && first
                .chars()
                .filter(|character| character.is_alphabetic())
                .all(char::is_uppercase);
        let third_upper = third.chars().any(char::is_alphabetic)
            && third
                .chars()
                .filter(|character| character.is_alphabetic())
                .all(char::is_uppercase);
        let before = words[index.saturating_sub(3)..index]
            .join(" ")
            .to_lowercase();
        // Several ranks end with another rank ("молодший сержант" →
        // "сержант"). Always retain the longest complete phrase.
        let Some(rank) = ranks
            .iter()
            .filter(|rank| before.ends_with(**rank))
            .max_by_key(|rank| rank.chars().count())
        else {
            continue;
        };
        let (given_name, patronymic, surname, full_name) =
            if first_title && second_title && third_upper {
                (
                    first.as_str(),
                    second.as_str(),
                    third.as_str(),
                    format!("{first} {second} {third}"),
                )
            } else if first_upper && second_title && third_title {
                (
                    second.as_str(),
                    third.as_str(),
                    first.as_str(),
                    format!("{first} {second} {third}"),
                )
            } else {
                continue;
            };
        let (
            full_name_token,
            surname_token,
            given_name_token,
            patronymic_token,
            rank_token,
            position_token,
            category,
            reason,
        ) = if is_simple_edition {
            (
                "піб_військовий_1",
                "прізвище_військовий_1",
                "імя_військовий_1",
                "по_батькові_військовий_1",
                "звання_військовий_1",
                "посада_військовий_1",
                "Параметри документа",
                "ПІБ визначено у документі, але не знайдено в особовому складі.",
            )
        } else {
            (
                "військовий_1_піб",
                "військовий_1_прізвище",
                "військовий_1_імя",
                "військовий_1_по_батькові",
                "військовий_1_звання",
                "військовий_1_посада",
                "Військовослужбовець",
                "ПІБ визначено за структурою тексту, але запис не прив’язаний до бази даних.",
            )
        };
        template_analysis_value_with_confidence(
            proposals,
            text,
            &full_name,
            full_name_token,
            "ПІБ, знайдений у документі",
            category,
            "medium",
            reason,
        );
        template_analysis_value_with_confidence(
            proposals,
            text,
            surname,
            surname_token,
            "Прізвище, знайдене у документі",
            category,
            "medium",
            reason,
        );
        template_analysis_value_with_confidence(
            proposals,
            text,
            given_name,
            given_name_token,
            "Ім’я, знайдене у документі",
            category,
            "medium",
            reason,
        );
        template_analysis_value_with_confidence(
            proposals,
            text,
            patronymic,
            patronymic_token,
            "По батькові, знайдене у документі",
            category,
            "medium",
            reason,
        );
        template_analysis_value_with_confidence(
            proposals,
            text,
            rank,
            rank_token,
            "Звання військовослужбовця, знайдене у документі",
            category,
            "medium",
            reason,
        );
        if let Some(position) = document_signature_position(text, &full_name, rank) {
            template_analysis_value_with_confidence(
                proposals,
                text,
                &position,
                position_token,
                "Посада військовослужбовця, знайдена у документі",
                category,
                "medium",
                reason,
            );
        }
    }
}

pub(crate) fn document_signature_position(
    text: &str,
    name_in_document: &str,
    rank: &str,
) -> Option<String> {
    let name_offset = text.to_lowercase().find(&name_in_document.to_lowercase())?;
    let before_name = &text[..name_offset];
    let mut lines = before_name
        .lines()
        .rev()
        .map(str::trim)
        .filter(|line| !line.is_empty());
    let last_line = lines.next()?;
    // A DOCX signature block is often a single paragraph: "Посада звання ПІБ".
    // In that case take the text before the rank, rather than the whole paragraph.
    let position = if !rank.trim().is_empty() && last_line.eq_ignore_ascii_case(rank.trim()) {
        lines.next()?
    } else if !rank.trim().is_empty() {
        last_line
            .to_lowercase()
            .rfind(&rank.trim().to_lowercase())
            .map(|rank_offset| last_line[..rank_offset].trim())
            .unwrap_or(last_line)
    } else {
        last_line
    };
    let position = position.trim_matches(|character: char| character == ',' || character == ';');
    let normalized = position.to_lowercase();
    let word_count = position.split_whitespace().count();
    // A position must come from a compact signature block. If Word did not
    // preserve the signature separation, the preceding report sentence must
    // never be offered as a "position".
    let looks_like_report_sentence = position.contains(['.', '!', '?'])
        || word_count > 14
        || [
            "дійсним",
            "доповідаю",
            "прошу",
            "відповідно",
            "згідно",
            "у зв’язку",
        ]
        .iter()
        .any(|marker| normalized.contains(marker));
    (position.chars().count() >= 8 && !looks_like_report_sentence).then(|| position.to_string())
}

#[derive(Clone)]
pub(crate) struct SignerNameParts {
    surname: String,
    given_name: String,
    patronymic: Option<String>,
    full_name: String,
}

pub(crate) fn is_uppercase_word(value: &str) -> bool {
    value.chars().any(char::is_alphabetic)
        && value
            .chars()
            .filter(|character| character.is_alphabetic())
            .all(char::is_uppercase)
}

pub(crate) fn signer_name_parts(full_name: &str) -> Option<SignerNameParts> {
    let parts = full_name
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    if !(2..=3).contains(&parts.len()) {
        return None;
    }
    let surname_index = parts
        .iter()
        .position(|part| is_uppercase_word(part))
        .unwrap_or(0);
    let (surname, given_name, patronymic) = match (parts.len(), surname_index) {
        (3, 2) => (parts[2].clone(), parts[0].clone(), Some(parts[1].clone())),
        (3, _) => (parts[0].clone(), parts[1].clone(), Some(parts[2].clone())),
        (2, 0) => (parts[0].clone(), parts[1].clone(), None),
        (2, _) => (parts[1].clone(), parts[0].clone(), None),
        _ => return None,
    };
    Some(SignerNameParts {
        surname,
        given_name,
        patronymic,
        full_name: parts.join(" "),
    })
}

pub(crate) struct SignerNameInDocument {
    full_name: String,
    surname: String,
    given_name: String,
    patronymic: Option<String>,
    has_full_name: bool,
}

pub(crate) fn normalized_name(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphabetic())
        .map(
            |character| match character.to_lowercase().next().unwrap_or(character) {
                // Ukrainian documents sometimes use the orthographic variants і/и
                // in a personal name. The original document spelling is retained
                // in the replacement; this normalization is only for recognition.
                'і' => 'и',
                character => character,
            },
        )
        .collect()
}

pub(crate) fn name_edit_distance(left: &str, right: &str) -> usize {
    let left = left.chars().collect::<Vec<_>>();
    let right = right.chars().collect::<Vec<_>>();
    let mut row = (0..=right.len()).collect::<Vec<_>>();
    for (left_index, left_character) in left.iter().enumerate() {
        let mut next = vec![left_index + 1];
        for (right_index, right_character) in right.iter().enumerate() {
            next.push(std::cmp::min(
                std::cmp::min(next[right_index] + 1, row[right_index + 1] + 1),
                row[right_index] + usize::from(left_character != right_character),
            ));
        }
        row = next;
    }
    row[right.len()]
}

pub(crate) fn similar_name(left: &str, right: &str) -> bool {
    let left = normalized_name(left);
    let right = normalized_name(right);
    left == right
        || (left.chars().count() >= 4
            && right.chars().count() >= 4
            && name_edit_distance(&left, &right) <= 1)
}

pub(crate) fn signer_name_in_document(
    text: &str,
    name: &SignerNameParts,
) -> Option<SignerNameInDocument> {
    if name.patronymic.is_some() && whole_text_match_count(text, &name.full_name) > 0 {
        return Some(SignerNameInDocument {
            full_name: name.full_name.clone(),
            surname: name.surname.clone(),
            given_name: name.given_name.clone(),
            patronymic: name.patronymic.clone(),
            has_full_name: true,
        });
    }
    let words = text
        .split_whitespace()
        .map(|word| {
            word.trim_matches(|character: char| !character.is_alphabetic() && character != '\'')
        })
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();
    for pair in words.windows(2) {
        if similar_name(pair[1], &name.surname) && similar_name(pair[0], &name.given_name) {
            return Some(SignerNameInDocument {
                full_name: format!("{} {}", pair[0], pair[1]),
                surname: pair[1].to_string(),
                given_name: pair[0].to_string(),
                patronymic: None,
                has_full_name: false,
            });
        }
        if similar_name(pair[0], &name.surname) && similar_name(pair[1], &name.given_name) {
            return Some(SignerNameInDocument {
                full_name: format!("{} {}", pair[0], pair[1]),
                surname: pair[0].to_string(),
                given_name: pair[1].to_string(),
                patronymic: None,
                has_full_name: false,
            });
        }
    }
    None
}

pub(crate) fn detected_signer_block_proposals(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
    role: &settings::SignerRole,
) {
    let signer = &role.signer;
    let Some(name_parts) = signer_name_parts(&signer.full_name) else {
        return;
    };
    let Some(name_in_document) = signer_name_in_document(text, &name_parts) else {
        return;
    };
    let category = format!("Підписант: {}", role.name);
    if name_in_document.has_full_name {
        template_analysis_value(
            proposals,
            text,
            &name_in_document.full_name,
            &format!("{}_піб", role.id),
            &format!("ПІБ: {}", role.name),
            &category,
        );
    }
    template_analysis_value(
        proposals,
        text,
        &name_in_document.surname,
        &format!("{}_прізвище", role.id),
        &format!("Прізвище: {}", role.name),
        &category,
    );
    template_analysis_value(
        proposals,
        text,
        &name_in_document.given_name,
        &format!("{}_імя", role.id),
        &format!("Ім’я: {}", role.name),
        &category,
    );
    if name_in_document.has_full_name {
        if let Some(patronymic) = &name_in_document.patronymic {
            template_analysis_value(
                proposals,
                text,
                patronymic,
                &format!("{}_по_батькові", role.id),
                &format!("По батькові: {}", role.name),
                &category,
            );
        }
    }
    if signer.rank.chars().count() >= 4 {
        template_analysis_value(
            proposals,
            text,
            &signer.rank,
            &format!("{}_звання", role.id),
            &format!("Звання: {}", role.name),
            &category,
        );
    }
    if let Some(position) =
        document_signature_position(text, &name_in_document.full_name, &signer.rank)
    {
        template_analysis_value(
            proposals,
            text,
            &position,
            &format!("{}_посада", role.id),
            &format!("Посада у блоці підпису: {}", role.name),
            &category,
        );
    }
}

pub(crate) fn document_phrase_after(text: &str, marker: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let start = lower.find(marker)? + marker.len();
    let remaining = text[start..]
        .trim_start_matches(|character: char| character.is_whitespace() || character == ':');
    let quoted = [("«", "»"), ("\"", "\""), ("“", "”")]
        .iter()
        .find_map(|(opening, closing)| {
            remaining.strip_prefix(opening).and_then(|after_opening| {
                after_opening
                    .find(closing)
                    .map(|end| after_opening[..end].trim().to_string())
            })
        });
    let value = quoted.unwrap_or_else(|| {
        remaining
            .chars()
            .take_while(|character| !matches!(character, ',' | ';' | '\n' | '\r'))
            .take(90)
            .collect::<String>()
    });
    let value = value.trim_matches(|character: char| {
        character.is_whitespace() || matches!(character, ':' | '«' | '»' | '.')
    });
    (value.chars().count() >= 2).then(|| value.to_string())
}
