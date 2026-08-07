# Personnel database and template language — architecture decision

## Reason

The application needs a stable source of personnel data for DOCX generation without binding the generator to one fixed set of fields.

## Decision

- SQLite is the sole source of truth for personnel.
- The `personnel` table stores approved initial fields in typed columns.
- `personnel_custom_fields` stores future approved fields without a generator rewrite.
- React accesses Tauri only through typed services. Feature hooks consume those services; UI components do not invoke Tauri commands.
- Template parsing and DOCX generation remain Rust responsibilities. The frontend only displays validation results.

## Template language contract

The language is documented in [Template language](../template-language.md). Its syntax is `{{path.to.value}}`: a one-person report uses `{{soldier.fieldName}}`; a report with two or more selected people uses only indexed access such as `{{soldiers[0].fieldName}}`. One run always creates one report. Changing this grammar requires an explicit migration plan.

## Affected modules

- `personnel`: CRUD and forms;
- `templates`: field reference and full validation;
- `report-generation`: quick validation and generation requests;
- `documentation`: in-app reference for the language.

## Migration and compatibility

This is the first structured personnel schema. Existing development `people` records are not treated as authoritative data. Production migration must copy mapped records only after a backup and must report any unmapped fields.

## Tests required

- Rust schema and seed-data tests;
- TypeScript mapping and service tests;
- component test for loading personnel and displaying field completeness;
- later: integration tests for template validation and DOCX output.
