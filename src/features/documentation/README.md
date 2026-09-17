# Documentation feature

This feature contains the user guide and the reusable field picker:

- `ProgramGuidePage` is the searchable user guide for the complete application workflow and the relationships between operational records.
- `AutoFillFieldPicker` is embedded contextually in Templates and the separate Report Analyser. It is not a standalone navigation page.

Guide content lives in `program-guide-content.ts`; keep every statement aligned with an implemented page, validation rule, or data flow. Planned features must be labelled as planned, not described as available.

`ProgramGuidePage` searches all query words across instructions and connection labels, expands common Ukrainian synonyms and typing variants, and exposes every topic as a labelled accordion region with hash navigation.
