# Decision Models in Agents

A decision model answers typed questions (a probability, a choice from a list, a score) in one fast
call. Agents can use one in seven places on their own. Each place has its own setting, and one master
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
| Memory Manager note gate | run `data.enableDecisionGate` (`true`) | Does not run. Notes keep the self-reported confidence filter. |
| Memory Manager dedupe and contradictions | run `data.memoryDecisionMode` (`'Shadow'`) | Treated as `'Prompt'`: the LLM prompts answer and no decision is asked. |

With `decisionsEnabled: true`, each setting works as documented. The agent's own uses are still off
by default, so turning one on takes two settings: the switch, and the use's own setting. The Memory
Manager's two are the exception: both are on once its switch is, because both were measured or run
only beside the prompt they may replace (see below).

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

A run can turn it on or off with `data.__agentTypePromptParams.decisionsEnabled`. The sub-agents
the run starts inherit its `data`, so the override reaches them too.

The Memory Manager is a Loop agent too. Its decision uses read `decisionsEnabled` from its own
`AgentTypePromptParams` or the run's `__agentTypePromptParams`, and its metadata ships it `true`. A run
turns the note gate off with `data.enableDecisionGate: false`.

Two shipped agents set the switch in metadata (`metadata/agents`):

| Agent | `AgentTypePromptParams` | Why |
|---|---|---|
| Memory Manager | `decisionsEnabled: true` | The note gate was measured at 96.1% precision and 95.4% recall on Jev; the dedupe and contradiction decisions run in `Shadow`. |
| Sage | `decisionsEnabled: true`, `decisionDiscovery: true` | Discovery was measured at 95.3% precision for the agents it names; a model without a discovery calibration is unsure and adds nothing. |

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
setting of the Angular chat UI, not of an agent. The switch does not affect it.

The realtime turn moderator is not an agent run either. Its decision is set per room, on the Realtime
agent type's `turnTaking.moderator` block: `decisionMode` (`'Prompt'`, `'Shadow'` or `'Decision'`,
default `'Shadow'`) and `decisionPromptName` (default `Default Decision`). See
[Realtime turn moderator](#realtime-turn-moderator).

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

With the switch on, the notes a Memory Manager run extracts from a conversation are judged by a
decision model, against that conversation, instead of by the extraction model's own confidence. A
note answered by a model with no `memory-note-gate` calibration keeps the confidence filter.
`data.enableDecisionGate: false` turns the gate off for a run.

Every decision call, the Memory Manager's included, asks with the prompt named by
`decisionPromptName` (default `Default Decision`) and runs on the run's execution scope: its
configuration, runtime API keys and credential scope. Each gate call is recorded as a run step, and
its prompt run counts toward the run's cost and tokens.

### Memory Manager dedupe and contradictions

The Memory Manager makes three closed-set LLM calls besides the gate: whether a candidate note
duplicates its similar stored notes (`Memory Manager - Deduplicate Note`, also used when hardening a
provisional note), whether a candidate example duplicates stored examples (`… - Deduplicate
Example`), and whether two stored notes contradict each other (`… - Detect Contradictions`). Each
can be asked as one Likelihood instead (`memory-decision-uses.ts`), through `RunDecisionUse`, in the
run's `data.memoryDecisionMode`:

| Mode | What answers |
|---|---|
| `Prompt` | The LLM prompt only. |
| `Shadow` (default) | The LLM prompt. The decision runs beside it, in parallel, and its prompt run is tagged `Shadow: <use>` with the comparison in `Comments`: the prompt's verdict as the label, the raw and calibrated probabilities. |
| `Decision` | The decision, read in calibrated bands: at or above 0.7 yes, at or below 0.3 no, between them unsure. The prompt answers when the decision is unsure, fails, or the answering model has no calibration for the use. |

None of the three has a fit yet, so `Decision` mode behaves as `Prompt` plus one decision call until
one ships. The contradiction decision asks only whether the notes conflict: which note wins follows
the prompt's own stated rule (more than seven days newer, then higher importance, then higher access
count, a tie keeping both), applied in code. Every path fails as the prompt does: a dedupe failure
never adds a note, and a contradiction failure skips the pair.

### Realtime turn moderator

In a multi-agent voice room the moderator decides who speaks next with the `Realtime: Turn Moderator`
prompt, inside an 800 ms budget. It can also ask one Likelihood per roster agent (use
`realtime-turn-moderator`, question `speaks`), through `RunDecisionUse`, in the room's
`turnTaking.moderator.decisionMode`. In `Shadow` (the default) the prompt picks and the decision is
recorded beside it, adding no latency. In `Decision` the agents at or over a calibrated 0.6 speak,
most likely first, and the prompt answers when the answering model has no calibration. The
`onError` policy still applies when both fail or the budget runs out.

## Calibration

A decision model's raw probabilities are not calibrated, so the uses that act on a threshold
(discovery, the memory note gate, conversation routing, duplicate detection) map each answer through
a Platt calibration fitted on labelled data. A fit holds only for the exact model it was fitted on.

Fits are model metadata, not code. Each is an entry in the answering AI model's
`ModelConfiguration.Decision.Calibrations`:

```json
{ "Use": "agent-discovery", "Question": "agent", "ResolvedModel": "typesafe/jev-1.13-20260917", "A": 0.4412, "B": 0.4571, "FittedOn": "…" }
```

| Use | Questions | Fitted on |
|---|---|---|
| `agent-discovery` | `agent` (the Choice's confidence), `anyApplies` | Jev 1.13, LLM Decision on GPT-OSS-120B |
| `memory-note-gate` | `note` | Jev 1.13 |
| `conversation-routing` | `continues` | Jev 1.13, LLM Decision on GPT-OSS-120B |
| `duplicate-detection` | `duplicate` | Jev 1.13, LLM Decision on GPT-OSS-120B |
| `memory-note-dedupe`, `memory-example-dedupe` | `duplicate` | Not yet: `Shadow` runs collect the labels |
| `memory-contradiction` | `contradicts` | Not yet: `Shadow` runs collect the labels |
| `realtime-turn-moderator` | `speaks` | Not yet: `Shadow` runs collect the labels |

An answer from any other model, including Jev at another version or a decision model with no entry
for the use, is treated as unsure, and the use falls back as documented above. Fitting a new model,
or refitting after a version bump, is a metadata change: run the `fit-decision-calibration` rig in the
integration test suite over labelled runs and paste the entries it prints.
