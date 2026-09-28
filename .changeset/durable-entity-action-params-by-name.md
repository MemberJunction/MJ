---
"@memberjunction/actions-base": patch
"@memberjunction/actions": patch
"@memberjunction/task-graph": patch
"@memberjunction/server": patch
"@memberjunction/integration-test-suite": patch
---

Durable entity actions (`EntityAction.RunMode = 'Durable'`) now receive their declared parameters by name (#4794).

`BuildDurableDeferral` stored the redacted parameters in `Task.InputPayload` as a `LoggedParam[]` array, while `TaskGraphActionRunner` reads that payload back as a name → value object. Every released build with durable dispatch (v6.1.0 onward, including 6.1.4) hit the same failure: the dispatcher's `mergedPayload` only merges plain objects, so it silently dropped the array and the action received NONE of its params. Parameters named `0…n` would only appear if the array reached `TaskGraphActionRunner.buildParams` directly, bypassing that drop. Either way every durable binding ran without its inputs, e.g. `Common.LogActivity` failing with `TypeCode is required. | Title is required.`

- `@memberjunction/actions-base`: new `RedactParamsToRecord()` beside `RedactParamsToJSON()`. It applies the same redaction rules and returns `{ Name: Value }`, omitting suppressed parameters, which then arrive at the action as absent rather than as a redaction stub.
- `@memberjunction/actions`: `BuildDurableDeferral` submits that record.
- `@memberjunction/task-graph`: a task whose `InputPayload` is not a name → value object now **fails** with a message naming the task, instead of running with its input silently dropped.
- `@memberjunction/server`: round-trip regression test through `TaskGraphActionRunner`.
- `@memberjunction/integration-test-suite`: EA6 now rejects an array `RedactedParams` and checks a bound param arrives by name.

**Upgrade note:** durable tasks queued before this fix still carry array payloads. They now fail loudly (`Task <id> has an InputPayload that is an array; expected a name → value object…`) instead of running with no inputs. Re-trigger the source save if that work matters, or — from the Workflows run view — use the failed step's **Edit input & retry** control to replace the stored array with a name → value object and retry it in place.

A durable binding never receives a whole record: `Entity Object` / `Entity Object Data` bindings are always stripped from the durable payload. Pass a key (e.g. `Entity Field 'ID'`) and load the record in the action.
