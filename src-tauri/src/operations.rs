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
pub use staffing::*;
pub use vehicles::*;
pub use workshop::*;

fn busy() -> String {
    "База даних тимчасово зайнята.".into()
}
