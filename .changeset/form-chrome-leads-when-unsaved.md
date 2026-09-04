---
"@memberjunction/ng-base-forms": minor
---

feat(ng-base-forms): a form contribution can declare `leadsWhenUnsaved` so a NEW record opens on it rather than on the first first-class group. An unsaved record already declines to restore a stored rail position; without this it falls through to the lead group, which is usually a summary — and a summary of a record with no data is a page of blanks the user must look past to find where typing starts. Opt-in per form: any form that declares nothing behaves exactly as before.
