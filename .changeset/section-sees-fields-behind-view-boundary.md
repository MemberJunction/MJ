---
"@memberjunction/ng-base-forms": patch
---

A form section now sees every `mj-form-field` rendered inside it, including fields declared in a widget component's own template, so the left rail badges that section when those fields are required-and-empty or fail a save.

`mj-collapsible-panel` derived a section's counts, and its claim on a failed save's field-named errors, from `@ContentChildren` alone. A content query stops at a component view boundary, so a section whose fields lived inside a projected widget saw none of them: no required-and-empty badge before the save, and no owner for the two field errors after it. The panel now also provides `FORM_SECTION_FIELD_HOST`; every `mj-form-field` injects it optionally and registers on construction, which follows the element injector across any number of view boundaries. A registered field counts only while its element is physically inside the panel, so a field created in an overlay that inherited the panel's injector is not counted against it.

Two smaller fixes from the same report:

- The expanded rail now shows failures no section owns on their own row. They were counted only on the collapsed spine, so an expanded rail could look clean over a form the server had just refused.
- `BaseFormComponent.SaveRecord` no longer logs `Could not save record: Record not found` on every refused save. That line sat after the `if (record)` block with no `else`, so a create that failed validation logged a message pointing at an ID or routing fault. The refusal is already reported through the toast and the fields; the console line now fires only when the form has no record to save, and says so.
