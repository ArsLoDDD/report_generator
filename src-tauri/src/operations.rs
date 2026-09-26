//! Commands and queries for operational records.
mod bcs;
mod crews;
mod equipment;
mod flight_journal;
mod incidents;
mod models;
mod personnel_control;
mod position_work;
mod positions;
mod service_assets;
mod staffing;
mod vehicles;
mod workshop;

pub use bcs::*;
pub use crews::*;
pub use equipment::*;
pub use flight_journal::*;
pub use incidents::*;
pub use models::*;
pub use personnel_control::*;
pub use position_work::*;
pub use positions::*;
pub use service_assets::*;
pub use staffing::*;
pub use vehicles::*;
pub use workshop::*;

fn busy() -> String {
    "База даних тимчасово зайнята.".into()
}

const OPERATIONAL_ABSENCE_LOCATIONS: [&str; 7] = [
    "ВІДП",
    "ЛІК",
    "НАВЧ",
    "ВІДР",
    "Відкомандировані",
    "СЗЧ",
    "ПТЗ Новостав",
];

pub(crate) fn is_operationally_available(location: &str) -> bool {
    !OPERATIONAL_ABSENCE_LOCATIONS.contains(&location.trim())
}

pub(crate) fn is_protected_manual_control_origin(location: &str) -> bool {
    OPERATIONAL_ABSENCE_LOCATIONS.contains(&location.trim())
        || [
            "На позиції",
            "ЗБЗ",
            "ПБЗ",
            "ГШР",
            "Реко",
            "Облаштування",
            "Реко та облаштування",
            "Логістика на позиції",
        ]
        .contains(&location.trim())
}

#[cfg(test)]
mod operational_availability_tests {
    use super::{is_operationally_available, is_protected_manual_control_origin};

    #[test]
    fn absence_states_are_not_available_for_operational_tasks() {
        for location in [
            "ВІДП",
            "Відкомандировані",
            "СЗЧ",
            "ПТЗ Новостав",
            "НАВЧ",
            "ВІДР",
            "ЛІК",
        ] {
            assert!(!is_operationally_available(location), "{location}");
            assert!(is_protected_manual_control_origin(location), "{location}");
        }
        for location in ["", "ОХ", "ЗАБ", "На позиції", "ЗБЗ", "ПБЗ"] {
            assert!(is_operationally_available(location), "{location}");
        }
    }

    #[test]
    fn logistics_cannot_be_overwritten_by_manual_control() {
        assert!(is_protected_manual_control_origin("Логістика на позиції"));
        assert!(!is_protected_manual_control_origin("ОХ"));
        assert!(!is_protected_manual_control_origin("ЗАБ"));
        assert!(!is_protected_manual_control_origin(""));
    }
}
