PRAGMA foreign_keys = ON;
BEGIN;

INSERT OR IGNORE INTO crews (name, platoon, unit_type, company_name, battle_order, sector, official_strength, status, uav_name, uav_type, functional_duties, current_location, notes)
VALUES
  ('ТЕСТ — Сокіл-1', '1 взвод', 'Екіпаж', 'Рота БпАК', 'БРО-1', 'Північ', 4, 'Бойове чергування', 'Лелека-100', 'Розвідувальний', 'Повітряна розвідка', 'Основна позиція', 'Контрольний екіпаж'),
  ('ТЕСТ — Сокіл-2', '1 взвод', 'Екіпаж', 'Рота БпАК', 'БРО-1', 'Північ', 4, 'Резерв', 'DJI Mavic 3', 'Коптер', 'Спостереження', 'ППД', 'Контрольний екіпаж'),
  ('ТЕСТ — Буревій-1', '2 взвод', 'Екіпаж', 'Рота БпАК', 'БРО-2', 'Центр', 5, 'Бойове чергування', 'Vampire', 'Ударний', 'Ураження цілей', 'Основна позиція', 'Контрольний екіпаж'),
  ('ТЕСТ — Буревій-2', '2 взвод', 'Екіпаж', 'Рота БпАК', 'БРО-2', 'Центр', 4, 'Відновлення', 'FPV', 'Ударний', 'Підготовка екіпажу', 'ППД', 'Контрольний екіпаж'),
  ('ТЕСТ — Обрій-1', '3 взвод', 'Екіпаж', 'Окремий взвод розвідки', 'БРО-3', 'Південь', 3, 'Формується', 'Autel EVO II', 'Коптер', 'Розвідка маршрутів', 'Резервна позиція', 'Контрольний екіпаж');

UPDATE crews SET company_name='Рота БпАК', unit_type='Екіпаж', battle_order='БРО-1', sector='Північ', official_strength=4,
  status='Бойове чергування', uav_name='Лелека-100', uav_type='Розвідувальний', functional_duties='Повітряна розвідка', current_location='Основна позиція'
WHERE name='Пуків';

INSERT OR IGNORE INTO crew_members (crew_id, personnel_id, joined_at)
SELECT c.id, p.id, '2026-08-01 08:00:00'
FROM crews c JOIN personnel p ON p.id BETWEEN 1 AND 4
WHERE c.name='Пуків';
INSERT OR IGNORE INTO crew_members (crew_id, personnel_id, joined_at)
SELECT c.id, p.id, '2026-08-02 08:00:00'
FROM crews c JOIN personnel p ON p.id BETWEEN 5 AND 8
WHERE c.name='ТЕСТ — Сокіл-1';
INSERT OR IGNORE INTO crew_members (crew_id, personnel_id, joined_at)
SELECT c.id, p.id, '2026-08-03 08:00:00'
FROM crews c JOIN personnel p ON p.id BETWEEN 9 AND 12
WHERE c.name='ТЕСТ — Сокіл-2';
INSERT OR IGNORE INTO crew_members (crew_id, personnel_id, joined_at)
SELECT c.id, p.id, '2026-08-04 08:00:00'
FROM crews c JOIN personnel p ON p.id BETWEEN 13 AND 17
WHERE c.name='ТЕСТ — Буревій-1';
INSERT OR IGNORE INTO crew_members (crew_id, personnel_id, joined_at)
SELECT c.id, p.id, '2026-08-05 08:00:00'
FROM crews c JOIN personnel p ON p.id BETWEEN 18 AND 20
WHERE c.name='ТЕСТ — Буревій-2';
INSERT OR IGNORE INTO crew_members (crew_id, personnel_id, joined_at)
SELECT c.id, p.id, '2026-08-06 08:00:00'
FROM crews c JOIN personnel p ON p.id BETWEEN 21 AND 23
WHERE c.name='ТЕСТ — Обрій-1';

UPDATE personnel
SET functional_duties = CASE id % 4 WHEN 0 THEN 'Командир екіпажу' WHEN 1 THEN 'Зовнішній пілот' WHEN 2 THEN 'Оператор корисного навантаження' ELSE 'Водій-механік' END,
    current_location = CASE id % 3 WHEN 0 THEN 'ППД' WHEN 1 THEN 'Бойова позиція' ELSE 'Резерв' END,
    bcs_status = CASE id % 4 WHEN 0 THEN 'На бойовому чергуванні' WHEN 1 THEN 'У резерві' WHEN 2 THEN 'На підготовці' ELSE 'У ППД' END,
    bcs_notes = CASE WHEN id % 5 = 0 THEN 'Потребує уточнення спорядження' ELSE '' END
WHERE id BETWEEN 1 AND 24;

INSERT OR IGNORE INTO vehicles (name, registration_number, status, personnel_id, crew_id, notes)
VALUES
  ('ТЕСТ — Mitsubishi L200', 'TEST AA 1001', 'Справний', 1, (SELECT id FROM crews WHERE name='Пуків'), 'Контрольний автомобіль'),
  ('ТЕСТ — HMMWV', 'TEST AA 1002', 'Ремонтується', 1, (SELECT id FROM crews WHERE name='ТЕСТ — Сокіл-1'), 'Контрольний автомобіль'),
  ('ТЕСТ — Ford Ranger', 'TEST AA 1003', 'Потребує ремонту', NULL, (SELECT id FROM crews WHERE name='ТЕСТ — Буревій-1'), 'Контрольний автомобіль'),
  ('ТЕСТ — Renault Duster', 'TEST AA 1004', 'Несправний', NULL, NULL, 'Контрольний автомобіль без екіпажу');

INSERT INTO equipment (category, name, inventory_number, status, crew_id, personnel_id, notes)
SELECT source.category, source.name, source.inventory_number, source.status, c.id, source.personnel_id, 'Контрольний запис'
FROM (
  SELECT 'generator' category, 'ТЕСТ — Генератор Honda EU22i' name, 'TEST-GEN-001' inventory_number, 'Справний' status, 'Пуків' crew_name, NULL personnel_id
  UNION ALL SELECT 'generator','ТЕСТ — Генератор Könner KS 3000','TEST-GEN-002','Потребує ремонту','ТЕСТ — Буревій-1',NULL
  UNION ALL SELECT 'uav','ТЕСТ — Лелека-100','TEST-UAV-001','Справний','Пуків',NULL
  UNION ALL SELECT 'uav','ТЕСТ — DJI Mavic 3','TEST-UAV-002','Справний','ТЕСТ — Сокіл-2',NULL
  UNION ALL SELECT 'uav','ТЕСТ — Vampire','TEST-UAV-003','Ремонтується','ТЕСТ — Буревій-1',NULL
  UNION ALL SELECT 'communications','ТЕСТ — Motorola DP4801e','TEST-COM-001','Справний','ТЕСТ — Сокіл-1',NULL
  UNION ALL SELECT 'communications','ТЕСТ — Starlink','TEST-COM-002','Справний','ТЕСТ — Буревій-1',NULL
  UNION ALL SELECT 'weapon_ammo','ТЕСТ — АК-74','TEST-WPN-001','Справний','Пуків',1
  UNION ALL SELECT 'weapon_ammo','ТЕСТ — Боєкомплект 5,45','TEST-AMMO-001','На обліку','ТЕСТ — Сокіл-1',5
) source
LEFT JOIN crews c ON c.name=source.crew_name
WHERE NOT EXISTS (SELECT 1 FROM equipment e WHERE e.inventory_number=source.inventory_number);

INSERT OR IGNORE INTO positions (name, position_type, strip_name, locality, battle_order, sector, condition, size, mgrs, suitable_uav_text, is_active, crew_id, notes)
VALUES
  ('ТЕСТ — СІЛЬПО', 'Основна', 'Смуга Альфа', 'с. Тестове', 'БРО-1', 'Північ', 'Готова', '30×20 м', '36U XA 12000 45000', 'Лелека-100, DJI Mavic 3', 1, (SELECT id FROM crews WHERE name='Пуків'), 'Замаскована, укриття готове'),
  ('ТЕСТ — МАЯК', 'Основна', 'Смуга Браво', 'с. Прикладне', 'БРО-2', 'Центр', 'Обмежено готова', '25×15 м', '36U XA 23000 56000', 'Vampire, FPV', 1, (SELECT id FROM crews WHERE name='ТЕСТ — Буревій-1'), 'Потрібне додаткове укриття'),
  ('ТЕСТ — ЛІС', 'Запасна', 'Смуга Альфа', 'с. Тестове', 'БРО-1', 'Північ', 'Готова', '20×15 м', '36U XA 14000 47000', 'Коптери', 0, NULL, 'Запасний майданчик'),
  ('ТЕСТ — БАЛКА', 'Запасна', 'Смуга Чарлі', 'с. Умовне', 'БРО-3', 'Південь', 'Законсервована', '18×12 м', '36U XA 34000 67000', 'FPV', 0, NULL, 'Потребує перевірки під’їзду'),
  ('ТЕСТ — СХИЛ', 'В облаштуванні', 'Смуга Браво', 'с. Прикладне', 'БРО-2', 'Центр', 'Облаштовується', '35×25 м', '36U XA 25000 58000', 'Ударні БпЛА', 0, NULL, 'Готовність 60%'),
  ('ТЕСТ — ПОЛЕ', 'В облаштуванні', 'Смуга Чарлі', 'с. Умовне', 'БРО-3', 'Південь', 'Розвідка місця', '40×30 м', '36U XA 36000 69000', 'Розвідувальні БпЛА', 0, NULL, 'Потрібне інженерне обстеження');

UPDATE crews
SET position_name=(SELECT p.name FROM positions p WHERE p.crew_id=crews.id AND p.is_active=1 LIMIT 1),
    reconnaissance_area=(SELECT p.locality FROM positions p WHERE p.crew_id=crews.id AND p.is_active=1 LIMIT 1)
WHERE EXISTS (SELECT 1 FROM positions p WHERE p.crew_id=crews.id AND p.is_active=1);

INSERT OR IGNORE INTO position_uavs (position_id, equipment_id)
SELECT p.id, e.id FROM positions p JOIN equipment e ON e.inventory_number='TEST-UAV-001' WHERE p.name='ТЕСТ — СІЛЬПО';
INSERT OR IGNORE INTO position_uavs (position_id, equipment_id)
SELECT p.id, e.id FROM positions p JOIN equipment e ON e.inventory_number='TEST-UAV-003' WHERE p.name='ТЕСТ — МАЯК';

INSERT INTO incidents (incident_type, occurred_at, crew_id, equipment_id, position_name, reconnaissance_area, crew_snapshot, description)
SELECT 'Втрата БпЛА', '2026-08-12 21:40', c.id, e.id, 'ТЕСТ — МАЯК', 'с. Прикладне', 'ТЕСТ — Буревій-1', 'Втрачено зв’язок під час виконання завдання'
FROM crews c JOIN equipment e ON e.inventory_number='TEST-UAV-003'
WHERE c.name='ТЕСТ — Буревій-1' AND NOT EXISTS (SELECT 1 FROM incidents WHERE description='Втрачено зв’язок під час виконання завдання');
INSERT INTO incidents (incident_type, occurred_at, crew_id, equipment_id, position_name, reconnaissance_area, crew_snapshot, description)
SELECT 'Технічна несправність', '2026-08-13 09:15', c.id, e.id, 'ТЕСТ — СІЛЬПО', 'с. Тестове', 'Пуків', 'Відмова генератора, роботу відновлено резервним засобом'
FROM crews c JOIN equipment e ON e.inventory_number='TEST-GEN-001'
WHERE c.name='Пуків' AND NOT EXISTS (SELECT 1 FROM incidents WHERE description='Відмова генератора, роботу відновлено резервним засобом');

COMMIT;
