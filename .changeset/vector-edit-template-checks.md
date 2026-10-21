---
"@memberjunction/ng-dashboards": patch
---

Vectors tab: the edit panel's Save now runs the sensitive-field and field-cap checks on an edited template (an untouched template saves as before), refuses an emptied template, and reports an error instead of "Entity document updated" when the template text was not written. The sensitive-field check now reads every identifier in a `{{ … }}` or `{% … %}` tag, so a field inside an expression or a `{% set %}` alias is caught.
