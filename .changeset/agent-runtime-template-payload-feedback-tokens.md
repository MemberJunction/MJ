---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/task-graph": patch
"@memberjunction/server": patch
"@memberjunction/ai-cli": patch
---

Three agent-runtime fixes found while building agents with a coding agent.

**A Flow agent's Prompt step templates read the payload the same way in both execution modes.** Under the task-graph dispatcher (the default for a top-level Flow run), `_CURRENT_PAYLOAD` and `flowContext` reached the template as JSON text: `{{ _CURRENT_PAYLOAD.field }}` rendered empty and `{{ _CURRENT_PAYLOAD | dump }}` double-encoded. In-run, they were bare objects, so `{{ _CURRENT_PAYLOAD }}` rendered `[object Object]`. Both modes now pass the value through the new `ToPromptTemplateValue` (`@memberjunction/ai-core-plus`): an object a template reads by field, which still prints as JSON when written whole, and which `| jsonparse` still accepts. A ForEach prompt body's loop bindings now reach the template as values too (`TaskPromptRunParams.TemplateParameters` is now `Record<string, unknown>`), so `{{ item.name }}` renders.

**A paused agent records its request.** When a root agent paused for the user (a Chat or Plan step), the `MJ: AI Agent Requests` row was saved before the step it points at had been inserted, so it could fail on the foreign key and the pause went unrecorded. The request now waits for the step's row. If the step could not be saved, the request is recorded without the link. A failed save now logs the reason (`LatestResult.CompleteMessage`).

**`mj ai audit agent-run` counts cached input.** A prompt run's `TokensPrompt` counts uncached input only; cache reads and writes are stored separately. The audit's totals used only the uncached count, so a cached prompt of several thousand tokens could show as 4. The audit now shows total input with its uncached, cache-read and cache-write parts, includes them in Total Tokens, and shows the run's recorded cost (which already prices each bucket) instead of a flat estimate when one exists. The storage convention is unchanged.
