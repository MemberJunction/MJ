---
"@memberjunction/ai-agents": minor
---

finishIf: a `finishIfMode` that is set but is not `off`, `shadow` or `on` (for example `"On"` or `"true"`) still turns the agent's gates off, but it now logs a warning naming the agent and the value it got. The warning is logged once per agent and value, not on every turn. A run request can set the value, so the warning shows at most its first 100 characters (and its length), and at most 1,000 agent and value pairs are remembered as reported, the least recently seen dropped first. Shadow mode after a sub-agent is now covered by a test.

Loop-agent decisions: decision requests held back until their step had run are now logged as skipped when the run is cancelled, or when an error is thrown out of the step loop, as well as when the step ends the run. Each held request is logged exactly once, and the log line says how the run ended. Nothing new is sent; this only makes the log complete.

Loop-agent decisions: one turn's decision requests now make at most `decisionsMaxCallsPerTurn` decision calls in total (default 100), counting every `forEachItemIn` item. Before, only the number of requests was capped (8), so one turn could send up to 800 calls before the run's cost guardrails, checked between steps, could stop them. The budget is handed out in request order before any call is made. A `forEachItemIn` request it cuts short asks its first items and reports the rest in `skippedCount`, and a request it leaves no calls for is not run and gets a failed result saying why, as a request over the request cap does. With a budget of 0, decision calls are off for the agent, and that result says so rather than inviting the agent to ask again next turn. `decisionsMaxCallsPerTurn` is declared in the Loop agent type's `PromptParamsSchema`.

Loop-agent decisions ship opt-in (`includeDecisionsDocs: true`, default `false`). Measured on the Prompt Eval corpus (68 cases, four models, 1,632 runs), the docs added about 1,200 prompt tokens to every turn, changed no decision, and no model wrote a `decisions` request. `includeDecisionsDocs` is declared in the Loop agent type's `PromptParamsSchema` with a default of `false`.
