---
"@memberjunction/ng-entity-viewer": minor
"@memberjunction/ng-ui-components": minor
---

Adds a Calendar view type to the entity viewer. It places a view's records on a day, week or month layout by a start date field and an optional end date field, both named in the view's config (`{ startFieldName, endFieldName, mode }`). A record with an end spans its days; one without sits on its start. SQL `date` fields stay on their stored day in every time zone. Weeks start on Monday. It is available for any entity with a date field and appears once the `Calendar` row in `MJ: View Types` is pushed.

`BuildCalendarWeeks` takes an optional `weekStartsOn` (0 = Sunday, the default and the datepicker's behaviour; 1 = Monday).
