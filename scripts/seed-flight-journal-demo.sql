-- Ручне тестове наповнення журналу польотів.
-- Скрипт не викликається програмою, міграціями або збіркою.
-- Він бере всі екіпажі та БпЛА з наявних знімків плану й чітко
-- позначає записи як демонстраційні, а повторний запуск не створює дублікати.

PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

WITH recent_snapshots AS (
  SELECT id, plan_date, snapshot_json
  FROM flight_plan_snapshots
  ORDER BY date(plan_date) DESC, id DESC
  LIMIT 30
),
snapshot_entries AS (
  SELECT
    snapshot.id AS snapshot_id,
    snapshot.plan_date,
    entry.value AS entry_json,
    CAST(json_extract(entry.value, '$.crewId') AS INTEGER) AS snapshot_crew_id,
    ROW_NUMBER() OVER (
      PARTITION BY snapshot.id, CAST(json_extract(entry.value, '$.crewId') AS INTEGER)
      ORDER BY CAST(entry.key AS INTEGER)
    ) AS crew_stage_number
  FROM recent_snapshots snapshot
  JOIN json_each(snapshot.snapshot_json, '$.entries') entry
),
ranked_entries AS (
  SELECT
    snapshot_id,
    plan_date,
    entry_json,
    snapshot_crew_id
  FROM snapshot_entries
  WHERE crew_stage_number = 1
),
demo_entries AS (
  SELECT
    snapshot_id,
    plan_date,
    snapshot_crew_id,
    CAST(json_extract(entry_json, '$.positionId') AS INTEGER) AS snapshot_position_id,
    CAST(json_extract(uav.value, '$.equipmentId') AS INTEGER) AS snapshot_uav_id,
    COALESCE(json_extract(entry_json, '$.crewName'), '') AS crew_name,
    COALESCE(json_extract(entry_json, '$.positionName'), '') AS position_name,
    COALESCE(json_extract(entry_json, '$.battleOrder'), '') AS battle_order,
    COALESCE(json_extract(entry_json, '$.workStrip'), '') AS work_strip,
    COALESCE((SELECT json_extract(part.value, '$.name') FROM json_each(entry_json, '$.uavSnapshots') part WHERE json_extract(part.value, '$.equipmentId')=json_extract(uav.value, '$.equipmentId') LIMIT 1), '') AS uav_name,
    COALESCE((SELECT json_extract(part.value, '$.serialNumber') FROM json_each(entry_json, '$.uavSnapshots') part WHERE json_extract(part.value, '$.equipmentId')=json_extract(uav.value, '$.equipmentId') LIMIT 1), '') AS uav_serial,
    COALESCE(json_extract(entry_json, '$.crewUavType'), '') AS uav_type,
    COALESCE(json_extract(entry_json, '$.startTime'), '') AS sky_time,
    COALESCE(json_extract(entry_json, '$.endTime'), '') AS ground_time,
    COALESCE(json_extract(entry_json, '$.task'), '') AS mission,
    COALESCE(json_extract(entry_json, '$.payloadSelection.sourceType'), '') AS payload_source,
    CAST(json_extract(entry_json, '$.payloadSelection.sourceId') AS INTEGER) AS payload_id
  FROM ranked_entries
  JOIN json_each(entry_json, '$.uavSelections') uav
)
INSERT INTO flight_journal_entries (
  flight_date,
  sky_time,
  ground_time,
  crew_id,
  position_id,
  uav_id,
  snapshot_id,
  crew_name_snapshot,
  position_name_snapshot,
  battle_order_snapshot,
  work_strip_snapshot,
  uav_name_snapshot,
  uav_type_snapshot,
  uav_serial_snapshot,
  mission,
  payload_source,
  payload_id,
  payload_type_snapshot,
  payload_serial_snapshot,
  notes
)
SELECT
  demo.plan_date,
  demo.sky_time,
  demo.ground_time,
  CASE WHEN EXISTS(SELECT 1 FROM crews WHERE id=demo.snapshot_crew_id) THEN demo.snapshot_crew_id END,
  CASE WHEN EXISTS(SELECT 1 FROM positions WHERE id=demo.snapshot_position_id) THEN demo.snapshot_position_id END,
  CASE WHEN EXISTS(SELECT 1 FROM equipment WHERE id=demo.snapshot_uav_id) THEN demo.snapshot_uav_id END,
  demo.snapshot_id,
  demo.crew_name,
  demo.position_name,
  demo.battle_order,
  demo.work_strip,
  demo.uav_name,
  demo.uav_type,
  demo.uav_serial,
  demo.mission,
  demo.payload_source,
  demo.payload_id,
  CASE WHEN demo.payload_source='equipment' THEN COALESCE((SELECT name FROM equipment WHERE id=demo.payload_id), '')
       WHEN demo.payload_source='workshop' THEN COALESCE((SELECT name FROM workshop_products WHERE id=demo.payload_id), '')
       ELSE '' END,
  CASE WHEN demo.payload_source='equipment' THEN COALESCE((SELECT inventory_number FROM equipment WHERE id=demo.payload_id), '') ELSE '' END,
  '[DEV-SEED:flight-journal-v1] Демонстраційний запис — не є підтвердженим фактом польоту.'
FROM demo_entries demo
WHERE demo.crew_name <> ''
  AND demo.sky_time <> ''
  AND demo.ground_time <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM flight_journal_entries journal
    WHERE journal.snapshot_id=demo.snapshot_id
      AND journal.crew_name_snapshot=demo.crew_name
      AND journal.uav_serial_snapshot=demo.uav_serial
      AND journal.notes LIKE '[DEV-SEED:flight-journal-v1]%'
  );

COMMIT;

-- Для точкового очищення лише цих демонстраційних записів:
-- DELETE FROM flight_journal_entries WHERE notes LIKE '[DEV-SEED:flight-journal-v1]%';
