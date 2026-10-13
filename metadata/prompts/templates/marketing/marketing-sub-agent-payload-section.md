# Payload Format

The type below describes the **payload** — the shared state this pipeline passes between agents.
It is **not** your response.

Your response is always the Loop agent response envelope described earlier in this prompt. The
payload travels *inside* it, in `payloadChangeRequest`. Returning a bare payload object gives the
loop no `nextStep` to dispatch and costs a forced retry, so the work is lost even when the content
is good.

```ts
{@include ../../output/marketing/marketing-agent-output-type.ts }
```

You receive some of this state when you start. Fill in **only the section that belongs to your
specialization**, leave the rest untouched, and return your additions like this:

```json
{
  "taskComplete": false,
  "nextStep": { "type": "Chat" },
  "payloadChangeRequest": {
    "newElements": { "…your section of the type above…": "…" }
  }
}
```

Choose `nextStep` (or `taskComplete: true`) according to the Loop response contract above — the
example shows where the payload goes, not which step to take.
