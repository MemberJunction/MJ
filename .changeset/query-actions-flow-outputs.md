---
"@memberjunction/core-actions": minor
---

Run Ad-hoc Query and Run Stored Query now publish their results as output parameters, so a Flow agent step can map them into its payload. Both actions declared outputs such as `Results` and `RowCount` but never set them: the rows went only into the Message and into extra fields on the returned object, which the action engine drops. As a result, a Flow step's `ActionOutputMapping` received `{}`.

On success, `Results` now holds the full, untrimmed rows as an array of objects; `DataFormat` and `ColumnMaxLength` still shape only the copy in the Message. Run Ad-hoc Query also sets `Columns`, `RowCount`, `ExecutionTimeMs`, `WasTruncated`, `ValidationWarnings` and, when one was produced, `Analysis`, and it follows `ReturnType` in the same way as its returned object. Run Stored Query also sets `RowCount`, `ExecutionTimeMs` and `QuerySQL`, plus two new outputs: `TotalRowCount`, the count ignoring `MaxRows`, and `WasTruncated`. A failed run sets no outputs and clears any output values left on a reused params array. The Message and the returned object are unchanged.
