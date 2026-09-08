//! Commands and queries for operational records.
mod bcs;
mod crews;
mod equipment;
mod incidents;
mod models;
mod positions;
mod staffing;
mod vehicles;

pub use bcs::*;
pub use crews::*;
pub use equipment::*;
pub use incidents::*;
pub use models::*;
pub use positions::*;
pub use staffing::*;
pub use vehicles::*;

fn busy() -> String {
    "База даних тимчасово зайнята.".into()
}
