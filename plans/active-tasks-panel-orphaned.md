# `mj-active-tasks-panel` is declared, exported, and rendered nowhere (T099 §3)

**Owner:** `@memberjunction/ng-conversations`
**Found by:** regression test `T099 - Conversation Agent Process Panel` (section 3)
**Severity:** Low — dead code, no user-visible breakage
**Status:** ⛔ Open — needs a keep-or-delete decision

## Symptom

T099 §3 asked the agent to open an "active tasks" panel listing in-flight agent
work. No such panel appears in the Chat UI, so the section could never pass. I
have already removed §3 from the test goal, so **the test side is settled** — this
issue is only about what to do with the component.

## What exists

`ActiveTasksPanelComponent` is a complete, compiled, exported Angular component:

- **Declared** in
  [`conversations.module.ts`](../packages/Angular/Generic/conversations/src/lib/conversations.module.ts)
  (line 157)
- **Exported** from
  [`public-api.ts`](../packages/Angular/Generic/conversations/src/public-api.ts)
  (line 81)
- **Rendered in zero templates, repo-wide.** A full sweep for `mj-active-tasks-panel`
  finds no usage in any `.html` or inline template, in this package or any consumer.

It ships in the bundle of every app that imports `ConversationsModule` and can
never be instantiated.

## Why it is worth a decision rather than a silent delete

Two readings, and they lead to opposite actions:

1. **Unshipped work.** The component was built for a feature (surfacing in-flight
   agent runs in the chat chrome) that was never wired up. If that feature is still
   wanted, the fix is to mount it — and T099 §3 was describing real intent, not
   inventing a control.
2. **Superseded.** Agent-run visibility may since have been covered elsewhere
   (agent-run detail views, the conversation process panel T099 §1–2 *does* test).
   In that case this is dead weight and should go.

Only someone with the feature history can say which. Per the repo convention for
pre-existing dead code, I flagged it instead of deleting it.

## Options

| | Action | Cost |
|---|---|---|
| **A** | Mount `<mj-active-tasks-panel>` in the chat chrome and restore T099 §3 | Real feature work + a UX decision on where the panel lives |
| **B** | Delete the component, its declaration, and its export | Small, mechanical; removes bundle weight |
| **C** | Leave as-is | Zero, but the orphan stays and will be re-discovered later |

## Recommendation

**Option B**, unless someone recognizes this as intended-but-unfinished work. It
is the smallest change, and an exported component that nothing can render is a
liability: it reads as public API, so an external consumer could reasonably mount
it and hit whatever wiring was never finished.

If B is chosen, check whether `ActiveTasksPanelComponent` has supporting services
or types that also become orphaned — those should go in the same change, and
nothing beyond them (no adjacent cleanup).
