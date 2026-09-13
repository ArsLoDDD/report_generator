use super::{busy, WorkshopDraft, WorkshopIngredient, WorkshopProduct};
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use std::collections::HashSet;

#[tauri::command]
pub fn list_workshop_products(
    state: tauri::State<AppState>,
) -> Result<Vec<WorkshopProduct>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db
        .connection
        .prepare("SELECT id,name,quantity,measurement_unit,notes,created_at FROM workshop_products ORDER BY id DESC")
        .map_err(|_| "Не вдалося прочитати вироби Цукерні.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати вироби Цукерні.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати вироби Цукерні.".to_string())?;
    rows.into_iter()
        .map(|(id, name, quantity, measurement_unit, notes, created_at)| {
            let mut ingredients_statement = db.connection.prepare(
                "SELECT wi.equipment_id,e.name,wi.quantity,wi.measurement_unit FROM workshop_ingredients wi JOIN equipment e ON e.id=wi.equipment_id WHERE wi.product_id=?1 ORDER BY e.name COLLATE NOCASE",
            ).map_err(|_| "Не вдалося прочитати склад виробу.".to_string())?;
            let ingredients = ingredients_statement
                .query_map([id], |row| {
                    Ok(WorkshopIngredient {
                        equipment_id: row.get(0)?,
                        equipment_name: row.get(1)?,
                        quantity: row.get(2)?,
                        measurement_unit: row.get(3)?,
                    })
                })
                .map_err(|_| "Не вдалося прочитати склад виробу.".to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| "Не вдалося прочитати склад виробу.".to_string())?;
            Ok(WorkshopProduct { id, name, quantity, measurement_unit, ingredients, notes, created_at })
        })
        .collect()
}

#[tauri::command]
pub fn create_workshop_product(
    state: tauri::State<AppState>,
    draft: WorkshopDraft,
) -> Result<(), String> {
    if draft.name.trim().is_empty() {
        return Err("Вкажіть назву виробу.".into());
    }
    if !draft.quantity.is_finite() || draft.quantity <= 0.0 {
        return Err("Кількість виробів повинна бути більшою за нуль.".into());
    }
    if draft.ingredients.is_empty() {
        return Err("Додайте хоча б один вибуховий матеріал.".into());
    }
    let mut ids = HashSet::new();
    if draft.ingredients.iter().any(|item| {
        !ids.insert(item.equipment_id) || !item.quantity.is_finite() || item.quantity <= 0.0
    }) {
        return Err("Перевірте складові та їх кількість.".into());
    }

    let mut db = state.0.lock().map_err(|_| busy())?;
    let transaction = db
        .connection
        .transaction()
        .map_err(|_| "Не вдалося почати облікову операцію.".to_string())?;
    for ingredient in &draft.ingredients {
        let source = transaction
            .query_row(
                "SELECT stock_quantity,measurement_unit FROM equipment WHERE id=?1 AND category='weapon_ammo' AND weapon_kind='component'",
                [ingredient.equipment_id],
                |row| Ok((row.get::<_, f64>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|_| "Не вдалося перевірити залишок складової.".to_string())?
            .ok_or_else(|| "Обраний вибуховий матеріал не знайдено.".to_string())?;
        if source.0 <= f64::EPSILON {
            return Err("Вибуховий матеріал із нульовим залишком використати не можна.".into());
        }
        if source.0 + f64::EPSILON < ingredient.quantity {
            return Err(format!(
                "Недостатньо складової №{} на обліку.",
                ingredient.equipment_id
            ));
        }
    }
    transaction
        .execute(
            "INSERT INTO workshop_products(name,quantity,measurement_unit,notes,created_at) VALUES(?1,?2,?3,?4,CASE WHEN trim(?5)='' THEN CURRENT_TIMESTAMP ELSE replace(?5,'T',' ') END)",
            params![draft.name.trim(), draft.quantity, draft.measurement_unit.trim(), draft.notes.trim(), draft.accounted_at.trim()],
        )
        .map_err(|_| "Не вдалося створити виріб.".to_string())?;
    let product_id = transaction.last_insert_rowid();
    for ingredient in &draft.ingredients {
        let unit: String = transaction
            .query_row(
                "SELECT measurement_unit FROM equipment WHERE id=?1",
                [ingredient.equipment_id],
                |row| row.get(0),
            )
            .map_err(|_| "Не вдалося прочитати одиницю складової.".to_string())?;
        transaction
            .execute(
                "UPDATE equipment SET stock_quantity=stock_quantity-?1 WHERE id=?2",
                params![ingredient.quantity, ingredient.equipment_id],
            )
            .map_err(|_| "Не вдалося списати складову з обліку.".to_string())?;
        transaction
            .execute(
                "INSERT INTO workshop_ingredients(product_id,equipment_id,quantity,measurement_unit) VALUES(?1,?2,?3,?4)",
                params![product_id, ingredient.equipment_id, ingredient.quantity, unit],
            )
            .map_err(|_| "Не вдалося зберегти склад виробу.".to_string())?;
    }
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити облікову операцію.".to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn workshop_schema_preserves_fractional_component_stock() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO equipment(category,name,weapon_kind,measurement_unit,stock_quantity) VALUES('weapon_ammo','Компонент','component','кг',0.2)", []).unwrap();
        let available: f64 = connection
            .query_row("SELECT stock_quantity FROM equipment", [], |row| row.get(0))
            .unwrap();
        assert!(available < 0.3);
    }
}
