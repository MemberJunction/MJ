---
"@memberjunction/ng-base-forms": patch
---

Form fields no longer paint an empty string as "required and empty" (#4359).

`MjFormFieldComponent.IsRequiredEmpty` counted `''` as empty, but `IsRequired` is derived from the column's nullability (`AllowsNull === false`) — and a NOT NULL string column accepts `''` in both SQL Server and `EntityField.Validate()`. So clearing a required text field painted the underline red and raised a section-indicator count for a value the save accepts without complaint: the form and the save disagreed about the same value. The getter now treats only `null` / `undefined` as empty, which is exactly what the save refuses.

**Behavior change**: a NOT NULL string field cleared to `''` in edit mode no longer shows the red required-empty underline and no longer counts toward a section's invalid-field badge. A field that is genuinely `null` — typically an untouched field on a new record — still does.

Requiring actual text is a separate, deliberate constraint (an `IsRequired`-style flag of the kind `ActionParam` / `TemplateParam` already carry, or a CHECK constraint), not something to infer from nullability. That flag does not exist for entity fields today and is tracked separately.
