# Documentation feature

This feature contains two local help workspaces:

- `ProgramGuidePage` is the searchable user guide for the complete application workflow and the relationships between operational records.
- `DocumentationPage` is the variable constructor and template-language reference.

Guide content lives in `program-guide-content.ts`; keep every statement aligned with an implemented page, validation rule, or data flow. Planned features must be labelled as planned, not described as available.

`ProgramGuidePage` searches all query words across instructions and connection labels, expands common Ukrainian synonyms and typing variants, and exposes every topic as a labelled accordion region with hash navigation.
