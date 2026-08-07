# Application data layout — architecture decision

## Decision

At startup the application creates its complete working structure if any directory is absent:

```text
ReportGenerator/
├── особовий_склад.db
├── Шаблони/
├── Підписи/
├── Згенеровані рапорти/ДД.ММ.РРРР/
├── Резервні копії/
└── Налаштування/налаштування.json
```

`Templates`, `Reports`, signatures, backups, configuration and the personnel database remain separate sources of truth. The application never stores DOCX templates or generated DOCX files inside SQLite.

On Windows the working tree is created alongside the executable. On macOS the writable tree lives in the application-support location because an installed `.app` bundle is not writeable. The in-app settings expose these default directories.

> Updated on 04.08.2026: the database file now lives directly in the application root. Existing files from `База даних/особовий_склад.db` are migrated automatically according to `2026-08-04-personnel-crud-and-database-location.md`.

## Security

Only files and folders inside `Згенеровані рапорти` may be opened through the application’s report-opening commands.
