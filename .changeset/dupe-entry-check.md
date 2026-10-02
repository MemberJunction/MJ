---
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-base-forms": patch
---

Record forms now flag likely duplicates while a person enters a new record, for entities whose entity document has LLM reasoning enabled and uses the `Decision` or `DecisionThenPrompt` reasoning mode. The check only flags: it never blocks a save or merges, and it shows nothing if it misses its time budget. The server bounds each check with its own budget and stops it there, a form keeps at most one check in flight, and an API key needs both the `view:run` and `prompt:execute` scopes to run one. A user who cannot read the entity is never checked.
