---
"@memberjunction/core": minor
"@memberjunction/content-pipeline-base": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/record-set-processor-base": minor
"@memberjunction/record-set-processor": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Content pipeline: a Retry outcome now waits and tries again instead of failing. Until now every outcome but Complete and Skipped was committed as the stage's `Failed` status, which no stage selects again, so a record a stage asked to retry (a rate limit, a timeout, a stage out of its time budget) stayed failed for good. A Retry now leaves the status ready and sets a wait on the record: Content Items and Content Item Chunks gain `RetryCount` and `RetryAfter`, the wait doubles with each Retry in a row (`Options.Tuning.RetryBackoffBaseMs`, default one minute; `RetryBackoffMaxMs`, default one hour), and every pipeline Record Process's `ScopeFilter` skips the record until `RetryAfter` has passed. A Delete that cannot finish, which already stayed `Pending`, now waits the same way instead of being selected by every run.

Record Set Processing: a run can be stopped from the calling code. `RecordProcessExecutor.Run`/`RunByID` and `RecordSetProcessor.Process` take an optional `Signal` (an `AbortSignal`): the run starts no record after it fires and ends `Paused` without moving its resume cursor past the page it was on. Processors receive it as `RecordProcessorContext.Signal`, and the content pipeline hands it to each stage's `context.Signal` (with the stage budget), so a stage in flight can stop too; a record the run was stopped on is not committed, and stays ready.
