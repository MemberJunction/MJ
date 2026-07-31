# Explorer's Chat surface has no scoped conversation search (T098)

**Owner:** `@memberjunction/ng-conversations` + `@memberjunction/ng-explorer-core`
**Found by:** regression test `T098 - Chat Global Search Panel`
**Severity:** Medium — a shipped, fully-built component is unreachable in the product's only chat surface
**Status:** ⛔ Open — needs a product decision before any code is written

## Symptom

T098 asks the agent to open the Chat application and reveal a conversation-scoped
search panel: a search input placeholder reading *"Search conversations, messages,
collections, artifacts…"* plus six scope filter buttons (All / Conversations /
Messages / Collections / Artifacts / Tasks).

The agent never finds it, on any run. Not a perception failure — the panel is
genuinely not in the DOM. It burns its step budget hunting for a control that the
Explorer chat surface does not render.

## What actually exists

The panel is real, complete, and matches T098's expectations exactly:

- [`search-panel.component.html`](../packages/Angular/Generic/conversations/src/lib/components/search/search-panel.component.html)
  — has the exact placeholder string and all six scope filter buttons.
- It is rendered by
  [`conversation-workspace.component.html`](../packages/Angular/Generic/conversations/src/lib/components/workspace/conversation-workspace.component.html)
  (lines 159–165), gated on `isSearchPanelOpen`.
- It is opened two ways: the `mjSearchShortcut` directive (**Ctrl/Cmd + K**), and
  `(searchTriggered)` from `mj-conversation-navigation` (the magnifying-glass
  button, line 44 of that template).

## Root cause

**Explorer never mounts `mj-conversation-workspace`.** It composes its own chat
chrome instead:

```
mj-chat-conversations-resource
  ├── mj-conversation-list
  └── mj-conversation-chat-area
```

`mj-conversation-workspace`, `mj-search-panel`, and `mj-conversation-navigation`
are all absent from Explorer's rendered tree. The search panel, its keyboard
shortcut, and its trigger button all live inside the workspace shell that only
the standalone conversations app uses.

So this is not a bug in the panel. It is a **surface gap**: two chat chromes
exist, and the feature was only ever wired into one of them.

## The decision needed

### Option A — wire the panel into Explorer's chat

Add `<mj-search-panel>` plus a trigger into `mj-chat-conversations-resource`.

**Blocker to resolve first:** `mjSearchShortcut` binds **Ctrl/Cmd + K**, and
Explorer's shell already claims that chord for global search
([`shell.component.ts`](../packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts),
`OnGlobalKeydown`). Two handlers on the same chord is exactly the class of silent
collision that produced the T153 defect. Wiring this up therefore requires either
a different chord or a visible affordance (a search button in the chat header)
— which is a UX decision, not a mechanical one.

### Option B — retire or retarget the test

T098 was written against the standalone workspace, not Explorer. Explorer
deliberately has its own chat chrome and *does* render `mj-search-overlay`.
Either mark T098 Inactive, or rewrite its goal against the overlay Explorer
actually ships.

## Recommendation

**Option B.** Explorer's separate chat chrome looks intentional, and adding a
keyboard chord or header button purely to satisfy a test is the wrong reason to
change product UI. If scoped conversation search *is* wanted in Explorer, that
should be scoped as its own feature with a deliberate affordance — not
back-derived from a regression test.

Either way, one thing is worth fixing independently: `mj-search-panel` is fully
built and reachable from only one of the two chat surfaces. That asymmetry should
be a conscious choice recorded somewhere, not an accident of which shell got the
feature first.
