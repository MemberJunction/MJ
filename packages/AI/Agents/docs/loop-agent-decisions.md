# Decision Models in Agents

A decision model answers typed questions (a probability, a choice from a list, a score) in one fast
call. Agents can use one in six places on their own. Each place has its own setting, and one master
switch sits above all of them.

## The master switch: `decisionsEnabled`

`decisionsEnabled` is a Loop agent-type prompt param. It defaults to `false`.

Unless it is `true`, an agent never asks a decision model on its own, whatever the other settings
say. This is a hard stop, not just a prompt change: the docs are left out of the prompt, and the
runtime refuses the call as well.

| Automatic use | Its own setting (default) | While `decisionsEnabled` is not `true` |
|---|---|---|
| Inline `decisions` | `includeDecisionsDocs` (`false`) | No docs and no `decisions` response field, even when `includeResponseTypeDefinition.decisions` is set to `true` explicitly. Any request the model sends anyway is skipped. |
| `finishIf` gates | `finishIfMode` (`'off'`) | Treated as `'off'`: no docs, no `finishIf` response field, and no gate is evaluated. |
| Decision discovery | `decisionDiscovery` (`false`) | Does not run. |
| Payload change check | `payloadFeedbackCheck` (`false`) | Does not run. |
| Catalog narrowing | `maxActionsInPrompt`, `maxSubAgentsInPrompt` (`-1`, off) | Does not run. The prompt describes every action, skill and sub-agent, as it did before narrowing existed. |
| Memory Manager note gate | run `data.enableDecisionGate` (`false`) | Does not run. Notes keep the self-reported confidence filter. |

With `decisionsEnabled: true`, each setting works as documented, and each is still off by default.
So turning a use on takes two settings: the switch, and the use's own setting.

### Setting it

Prompt params merge in three layers, lowest first:

1. The Loop agent type's default (`false`), from its `PromptParamsSchema`.
2. The agent's own `AgentTypePromptParams`.
3. The run's `ExecuteAgentParams.data.__agentTypePromptParams`.

Turn it on for an agent and pick the uses it needs:

```json
{
  "decisionsEnabled": true,
  "finishIfMode": "shadow",
  "decisionDiscovery": true
}
```

A run can turn it on or off for itself with `data.__agentTypePromptParams.decisionsEnabled`.

The Memory Manager is a Loop agent too. Its note gate needs `decisionsEnabled: true` in its own
`AgentTypePromptParams` or in the run's `__agentTypePromptParams`, as well as `enableDecisionGate`.

### What the switch does not cover

The switch governs only what an agent does on its own. Uses that someone placed explicitly do not
read it:

- a Flow agent's Decision step;
- a task graph's Decision step (`AIDecisionTaskRunner`);
- the Run Decision action, and `RunDecision` from a client;
- a Record Set Processor feature pipeline of the Decision type;
- duplicate detection's decision reasoning, the `DecisionReranker`, and the testing framework's
  decision judge.

These call `AgentDecisionService` or `AIDecisionRunner` directly, so the check is never made inside
the service. In code, `BaseAgent.DecisionsEnabled(promptParams)` is the one resolver, and each
automatic use calls it before it asks.

Client-side conversation routing (`EnableDecisionRouting` on the conversation components) is a
setting of the Angular chat UI, not of an agent, and is off by default. The switch does not affect it.

## The uses

### Inline `decisions`

With `includeDecisionsDocs: true`, the model is taught to send `decisions` on its turn: typed
questions about literal text or the payload, optionally once per item of a payload array
(`forEachItemIn`). They are answered on the same turn, recorded as `Decision` steps, and the answers
arrive on the next turn. The docs add about 1,200 tokens to every turn. `decisionsMaxRequests`,
`decisionsMaxItems` and `decisionsMaxCallsPerTurn` bound the calls one turn can make.

### `finishIf` gates

With `finishIfMode` set to `'shadow'` or `'on'`, the model can attach one to three yes/no questions
and a final message to an Actions step or a single Sub-Agent step. After the step runs, each
question is asked about its results, recorded as a `Finish check` step. In `'on'` a passing gate
ends the run with the message and no further LLM turn. In `'shadow'` it is only recorded.
`finishIfThreshold` (default `0.9`) is the probability each answer must reach.

### Decision discovery

With `decisionDiscovery: true`, before the first prompt of a conversation's opening request, one
decision asks which of the agents the user may run should handle it. A confident answer becomes a
`<suggested_agent>` system message. Follow-up turns and requests that @mention an agent are never
asked about.

### Payload change check

With `payloadFeedbackCheck: true`, each payload change the analyzer flags (a large truncation, a
removed key, a type change) becomes one question, "was this change intended?", all in one call. The
changes judged unintended are listed on the agent's next turn. Nothing is reverted automatically.

### Catalog narrowing

With `maxActionsInPrompt` or `maxSubAgentsInPrompt` set to a positive N, and more items than that,
one decision per run picks the N most useful for the opening request, and the prompt describes only
those. Every permitted item can still be used, and a failed decision shows them all.

### Memory Manager note gate

With `enableDecisionGate` on a Memory Manager run, the notes it extracts from a conversation are
judged by a decision model, against that conversation, instead of by the extraction model's own
confidence.

The agent's own uses ask with the prompt named by `decisionPromptName` (default `Default Decision`);
the Memory Manager's gate always uses `Default Decision`. Each call is recorded as a run step, and its
prompt run counts toward the run's cost and tokens.
