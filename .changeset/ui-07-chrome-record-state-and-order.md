---
"@memberjunction/ng-base-forms": patch
---

Form rail membership by record state and populated-first related sections. A `BaseFormPanel` registration can set `visibleWhen: 'always' | 'saved' | 'new'`; a contribution that does not apply to the record's state is dropped before the rail is worked out and is not mounted, and the form re-resolves on first save. A form can opt in to populated-first related sections (`PopulatedRelatedSectionsFirst`, off by default, left-nav only): once the counts load, related sections with no rows gather into one "No records" rail item after the others, decided once per record.
