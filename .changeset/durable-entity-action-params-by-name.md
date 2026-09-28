---
"@memberjunction/actions-base": patch
"@memberjunction/actions": patch
"@memberjunction/task-graph": patch
"@memberjunction/server": patch
---

Durable entity actions (`EntityAction.RunMode = 'Durable'`) now receive their declared parameters by name (#4794).

`BuildDurableDeferral` stored the redacted parameters in `Task.InputPayload` as a `LoggedParam[]` array, while `TaskGraphActionRunner` reads that payload back as a name → value object. On 6.1.4 the action received parameters named `0…n`; on later builds the dispatcher dropped the array and the action received none. Either way every durable binding ran without its inputs, e.g. `Common.LogActivity` failing with `TypeCode is required. | Title is required.`

- `@memberjunction/actions-base`: new `RedactParamsToRecord()` beside `RedactParamsToJSON()`. It applies the same redaction rules and returns `{ Name: Value }`, omitting suppressed parameters, which then arrive at the action as absent rather than as a redaction stub.
- `@memberjunction/actions`: `BuildDurableDeferral` submits that record.
- `@memberjunction/task-graph`: a task whose `InputPayload` is not a name → value object now **fails** with a message naming the task, instead of running with its input silently dropped.
- `@memberjunction/server`: round-trip regression test through `TaskGraphActionRunner`.

**Upgrade note:** durable tasks queued before this fix still carry array payloads. They now fail loudly (`Task <id> has an InputPayload that is an array; expected a name → value object…`) instead of running with no inputs. Re-trigger the source save if that work matters.

A durable binding never receives a whole record: `Entity Object` / `Entity Object Data` bindings are always stripped from the durable payload. Pass a key (e.g. `Entity Field 'ID'`) and load the record in the action.
