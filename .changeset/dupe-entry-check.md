---
"@memberjunction/ai-vector-dupe": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/ng-base-forms": minor
---

Record forms now flag likely duplicates while a person enters a new record, for entities whose entity document uses the `Decision` or `DecisionThenPrompt` reasoning mode. The check only flags: it never blocks a save or merges, and it shows nothing if it misses its time budget.
