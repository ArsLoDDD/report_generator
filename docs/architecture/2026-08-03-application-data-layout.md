# Application data layout — architecture decision

## Decision

At startup the application creates its complete working structure if any directory is absent:

```text
ReportGenerator/
├── База даних/особовий_склад.db
├── Шаблони/
├── Підписи/
├── Згенеровані рапорти/ДД.ММ.РРРР/
├── Резервні копії/
└── Налаштування/налаштування.json
```

`Templates`, `Reports`, signatures, backups, configuration and the personnel database remain separate sources of truth. The application never stores DOCX templates or generated DOCX files inside SQLite.

On Windows the working tree is created alongside the executable. On macOS the writable tree lives in the application-support location because an installed `.app` bundle is not writeable. The in-app settings expose these default directories.

## Security

Only files and folders inside `Згенеровані рапорти` may be opened through the application’s report-opening commands.
