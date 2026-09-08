use super::*;

pub(super) fn detect_gender<'a>(stored: &'a str, patronymic: &str) -> Option<&'a str> {
    if !stored.is_empty() {
        Some(stored)
    } else if patronymic.to_lowercase().ends_with("ич") {
        Some("чоловіча")
    } else if patronymic.to_lowercase().ends_with("на") {
        Some("жіноча")
    } else {
        None
    }
}

pub(super) fn apply_modifiers(value: &Value, mods: &[&str]) -> Result<String, String> {
    let mut text = value.text.clone();
    for m in mods {
        if registry()
            .modifiers
            .iter()
            .find(|x| x.id == *m)
            .is_some_and(|x| x.group == "case")
        {
            text = decline(&text, &value.kind, m, value.gender.as_deref())?
        } else {
            text = match *m {
                "великими" => text.to_uppercase(),
                "маленькими" => text.to_lowercase(),
                "з_великої" => capitalize_first(&text),
                _ => text,
            }
        }
    }
    // Модифікатор регістру застосовується до тексту посади, але не до коду
    // військової частини: «А5027» завжди лишається з великою «А».
    Ok(normalize_unit_codes(&text))
}
pub(super) fn decline(
    value: &str,
    kind: &str,
    case: &str,
    gender: Option<&str>,
) -> Result<String, String> {
    if case == "називний" {
        return Ok(value.into());
    }
    if kind == "position" {
        return Ok(value
            .split_once(',')
            .map(|(head, tail)| format!("{},{}", decline_position_head(head, case), tail))
            .unwrap_or_else(|| decline_position_head(value, case)));
    }
    let gender=gender.ok_or_else(||format!("Не вдалося визначити стать для відмінювання «{value}». Вкажіть стать у картці військовослужбовця або по батькові в параметрах документа."))?;
    if kind == "rank" {
        return Ok(decline_rank(value, case, gender));
    }
    Ok(value
        .split_whitespace()
        .map(|w| decline_word(w, case, gender))
        .collect::<Vec<_>>()
        .join(" "))
}
pub(super) fn decline_rank(value: &str, case: &str, gender: &str) -> String {
    let key = value.to_lowercase();
    let fixed: HashMap<&str, [&str; 7]> = [
        (
            "солдат",
            [
                "солдат",
                "солдата",
                "солдату",
                "солдата",
                "солдатом",
                "солдаті",
                "солдате",
            ],
        ),
        (
            "майор",
            [
                "майор",
                "майора",
                "майору",
                "майора",
                "майором",
                "майорі",
                "майоре",
            ],
        ),
        (
            "капітан",
            [
                "капітан",
                "капітана",
                "капітану",
                "капітана",
                "капітаном",
                "капітані",
                "капітане",
            ],
        ),
        (
            "сержант",
            [
                "сержант",
                "сержанта",
                "сержанту",
                "сержанта",
                "сержантом",
                "сержанті",
                "серджанте",
            ],
        ),
        (
            "лейтенант",
            [
                "лейтенант",
                "лейтенанта",
                "лейтенанту",
                "лейтенанта",
                "лейтенантом",
                "лейтенанті",
                "лейтенанте",
            ],
        ),
        (
            "старший лейтенант",
            [
                "старший лейтенант",
                "старшого лейтенанта",
                "старшому лейтенанту",
                "старшого лейтенанта",
                "старшим лейтенантом",
                "старшому лейтенанті",
                "старший лейтенанте",
            ],
        ),
        (
            "молодший сержант",
            [
                "молодший сержант",
                "молодшого сержанта",
                "молодшому сержанту",
                "молодшого сержанта",
                "молодшим сержантом",
                "молодшому сержанті",
                "молодший сержанте",
            ],
        ),
        (
            "старший сержант",
            [
                "старший сержант",
                "старшого сержанта",
                "старшому сержанту",
                "старшого сержанта",
                "старшим сержантом",
                "старшому сержанті",
                "старший сержанте",
            ],
        ),
        (
            "підполковник",
            [
                "підполковник",
                "підполковника",
                "підполковнику",
                "підполковника",
                "підполковником",
                "підполковнику",
                "підполковнику",
            ],
        ),
        (
            "полковник",
            [
                "полковник",
                "полковника",
                "полковнику",
                "полковника",
                "полковником",
                "полковнику",
                "полковнику",
            ],
        ),
    ]
    .into_iter()
    .collect();
    let cases = [
        "називний",
        "родовий",
        "давальний",
        "знахідний",
        "орудний",
        "місцевий",
        "кличний",
    ];
    if let (Some(forms), Some(i)) = (
        fixed.get(key.as_str()),
        cases.iter().position(|x| *x == case),
    ) {
        forms[i].into()
    } else {
        decline_phrase(value, case, gender)
    }
}
pub(super) fn decline_phrase(value: &str, case: &str, gender: &str) -> String {
    value
        .split_whitespace()
        .map(|w| decline_word(w, case, gender))
        .collect::<Vec<_>>()
        .join(" ")
}
pub(super) fn decline_position_head(value: &str, case: &str) -> String {
    let mut parts = value.splitn(2, char::is_whitespace);
    let head = parts.next().unwrap_or_default();
    let rest = parts.next().unwrap_or_default();
    let punctuation: String = head
        .chars()
        .rev()
        .take_while(|c| !c.is_alphanumeric())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    let lexical_head = head.strip_suffix(&punctuation).unwrap_or(head);
    let lower = lexical_head.to_lowercase();
    let changed = if let Some(forms) = position_forms(&lower) {
        let cases = [
            "називний",
            "родовий",
            "давальний",
            "знахідний",
            "орудний",
            "місцевий",
            "кличний",
        ];
        forms[cases.iter().position(|item| *item == case).unwrap_or(0)].to_string()
    } else if lower.ends_with("ець") {
        format!(
            "{}{}",
            &lower[..lower.len() - 6],
            if case == "орудний" {
                "цем"
            } else {
                "ця"
            }
        )
    } else if lower.ends_with("ий") && matches!(case, "родовий" | "знахідний") {
        format!("{}ого", &lower[..lower.len() - 4])
    } else {
        let suffix = match case {
            "родовий" | "знахідний" => "а",
            "давальний" => "у",
            "орудний" => "ом",
            "місцевий" => "і",
            "кличний" => "е",
            _ => "",
        };
        format!("{lower}{suffix}")
    };
    if rest.is_empty() {
        format!("{changed}{punctuation}")
    } else {
        format!("{changed}{punctuation} {rest}")
    }
}

pub(super) fn position_forms(value: &str) -> Option<[&'static str; 7]> {
    match value {
        "оператор" => Some([
            "оператор",
            "оператора",
            "оператору",
            "оператора",
            "оператором",
            "операторі",
            "операторе",
        ]),
        "командир" => Some([
            "командир",
            "командира",
            "командиру",
            "командира",
            "командиром",
            "командирі",
            "командире",
        ]),
        "начальник" => Some([
            "начальник",
            "начальника",
            "начальнику",
            "начальника",
            "начальником",
            "начальнику",
            "начальнику",
        ]),
        "заступник" => Some([
            "заступник",
            "заступника",
            "заступнику",
            "заступника",
            "заступником",
            "заступнику",
            "заступнику",
        ]),
        "стрілець" => Some([
            "стрілець",
            "стрільця",
            "стрільцю",
            "стрільця",
            "стрільцем",
            "стрільці",
            "стрільцю",
        ]),
        "помічник" => Some([
            "помічник",
            "помічника",
            "помічнику",
            "помічника",
            "помічником",
            "помічнику",
            "помічнику",
        ]),
        "водій" => Some([
            "водій",
            "водія",
            "водієві",
            "водія",
            "водієм",
            "водієві",
            "водію",
        ]),
        "механік" => Some([
            "механік",
            "механіка",
            "механіку",
            "механіка",
            "механіком",
            "механіку",
            "механіку",
        ]),
        _ => None,
    }
}
pub(super) fn decline_word(word: &str, case: &str, gender: &str) -> String {
    let upper = word == word.to_uppercase();
    let lower = word.to_lowercase();
    let stem = |n: usize| {
        lower
            .chars()
            .take(lower.chars().count().saturating_sub(n))
            .collect::<String>()
    };
    let result = if gender == "жіноча" && lower.ends_with('а') {
        let s = stem(1);
        match case {
            "родовий" => s + "и",
            "давальний" | "місцевий" => s + "і",
            "знахідний" => s + "у",
            "орудний" => s + "ою",
            "кличний" => s + "о",
            _ => lower,
        }
    } else if lower.ends_with("ий") {
        let s = stem(2);
        match case {
            "родовий" => s + "ого",
            "давальний" => s + "ому",
            "знахідний" => s + "ого",
            "орудний" => s + "им",
            "місцевий" => s + "ому",
            "кличний" => s + "ий",
            _ => lower,
        }
    } else {
        match case {
            "родовий" => lower + "а",
            "давальний" => lower + "у",
            "знахідний" => lower + "а",
            "орудний" => lower + "ом",
            "місцевий" => lower + "і",
            "кличний" => lower + "е",
            _ => lower,
        }
    };
    if upper {
        result.to_uppercase()
    } else {
        name_case(&result)
    }
}

pub(super) fn capitalize_first(value: &str) -> String {
    let lowered = value.to_lowercase();
    let mut chars = lowered.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
        .unwrap_or_default()
}
