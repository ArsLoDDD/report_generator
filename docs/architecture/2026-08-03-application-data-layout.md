# Application data layout — architecture decision

## Decision

At startup the application creates its complete working structure if any directory is absent:

```text
ReportGenerator/
├── Database/personnel.db
├── Templates/
├── Signatures/
├── Reports/YYYY-MM-DD/<назва рапорту YYYY-MM-DD HH-MM-SS>/
├── DB_Backups/
└── Config/settings.json
```

`Templates`, `Reports`, signatures, backups, configuration and the personnel database remain separate sources of truth. The application never stores DOCX templates or generated DOCX files inside SQLite.

On macOS the writable logical `ReportGenerator` folder lives in the application-support location because an installed `.app` bundle is not writeable. On a portable Windows build the same tree can live beside the executable. The in-app settings expose these default directories.

## Compatibility

If the earlier `reports.db` is found before `Database/personnel.db` exists, it is copied to the new database location before opening. No existing database is deleted automatically.

## Security

Only files and folders inside `Reports` may be opened through the application’s report-opening commands.
