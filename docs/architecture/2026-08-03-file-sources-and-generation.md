# File sources and report generation — architecture decision

## Reason

Templates and generated reports are documents, not database entities. Storing their copies in SQLite would create duplicate sources of truth and make file recovery harder.

## Decision

- DOCX templates are sourced only from the template folder or a file explicitly selected by the user.
- Generated DOCX files are sourced only from the `Reports/YYYY-MM-DD/<report-name>/` folder.
- SQLite stores personnel and approved future personnel fields only.
- The prototype `templates` and `reports` tables are not used by the current application and must not be used for new functionality. They may remain in an existing development database until an explicit, backed-up cleanup migration is approved.
- Each generation is atomic: the DOCX is written into a temporary sibling folder and that folder is renamed only after the document has been completed successfully.
- One generation run produces exactly one DOCX. Selected personnel use the same numbered v2 form for every count: `{{військовий_1_піб}}`, `{{військовий_2_піб}}`, and so on.

## Affected modules

- `report-generation`: template selection, quick validation, and generation request;
- `templates`: discovery and complete validation of files;
- `generated-reports`: file-based report list;
- `documentation`: visible contract for template authors.

## Migration and tests

No existing documents are moved. Legacy database tables are not dropped automatically. Tests cover variable-mode validation, XML replacement, and atomic creation of a DOCX output folder.
