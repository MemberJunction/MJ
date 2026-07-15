# Parity Audit — Shipped Conversations UI vs. Hub Prototype

> Two code-verified sweeps (2026-07-14) of the shipped stack — `ng-conversations`,
> `ng-composer`, `ConversationsRuntime`, `ng-artifacts` — compared against the
> hub prototype's state inventory. Purpose: before adopting any redesign
> variation, know exactly what exists in production that the redesign does not
> yet account for. **A redesign that ships with less than today's product is a
> regression, however good it looks.**

## 1. The frame finding

The prototype is a **hub + organization + composer redesign**, not a full-app
redesign. Twelve major shipped surfaces live entirely outside its frame. Any
variation adopted as "the new shell" needs an explicit disposition per surface:
*(a) keep as-is behind the new skin, (b) redesign in a later pass, or (c) the
variation already restyles it.* None may be silently dropped:

| # | Shipped surface (not in prototype) | Scale |
|---|---|---|
| 1 | **Collections + Tasks workspace tabs** — Finder-style collections (grid/list, staging shelf, pagination, range-select, right-click menus, drag-move), tasks w/ Gantt + dependencies | Large |
| 2 | **Voice/realtime stack** — live overlay, whiteboard/media/remote-browser channels, delegation cards w/ cancel, session review + evidence playback, timeline card, voice/co-agent picker w/ record consent | Large |
| 3 | **Chat overlay mode** — floating bubble, drag/hide/restore, unread badge, 3-edge resize, workspace handoff | Medium |
| 4 | **Search** — Ctrl/Cmd+K panel, 6 scopes, date range, recent searches, highlighting | Medium |
| 5 | **Threads** — reply-in-thread slide panel (note: currently orphaned — no message action exposes it) | Small |
| 6 | **Agent run inspector** — gear → run links, steps, tokens, cost, associated tasks | Medium |
| 7 | **Ratings** — 1–10 pip dialog, comment, consent checkbox, reviewer-role grant side effect (atlas said "thumbs" — wrong) | Small |
| 8 | **Export modal** — MD/JSON/HTML/Text + per-format options | Small |
| 9 | **Artifact viewer depth** — plugin tabs (Code/Requirements), JSON+copy, Links tab, Analyze, live React component rendering, "Apply to my Form", usage tracking | Large |
| 10 | **Notifications** — priority-colored badges, pulse/NEW states on rows | Small |
| 11 | **Active agents / tasks panels** — floating, cancel-run, minimize-to-badge; tasks dropdown | Medium |
| 12 | **Integration contracts** — 6 host slots, cancelable before-events, deep-link query params, INotification/IActiveTask/ISessions adapters | Must-keep, invisible |

## 2. The dangerous quadrant

Features that exist in production **inside surfaces the prototype DOES model**,
that the prototype (and DESIGN-NOTES) currently drops. Each needs a keep /
redesign / consciously-regress call:

1. **Nested folders with full management UI.** ⚠ The biggest tension in this
   audit. DESIGN-NOTES says nesting is "deliberately undrawn pending the
   hierarchy review" — but the shipped June folders feature already HAS
   recursive trees, subfolder create, drag-drop reparenting (cycle-safe),
   descendant count badges, and delete-moves-contents-out. The redesign cannot
   ship flat projects without regressing live functionality. The hierarchy
   questions are no longer green-field — they're retrofit questions.
2. **Sidebar management set** — live filter box, group-by-folder/flat toggle,
   multi-select mode w/ bulk delete + partial-failure report, drag conversation
   → folder. Prototype has none of these.
3. **Rename is a dialog with Name + Description** (description is agent-read);
   prototype renames inline with no description on conversations.
4. **Folder modal richness** — 20 color swatches + custom picker, 20-icon grid,
   live preview. Prototype's picker: 6 icons / 5 colors (fine as sketch; noting).
5. **Composer: in-chip agent config presets** — @agent chips with 2+ presets get
   an embedded preset dropdown; selection survives serialization. Prototype's
   mode picker is composer-global only.
6. **Composer: @ mentions include human users**, paste-image-from-clipboard,
   drag-drop w/ highlight, per-file validation errors. Prototype: people-as-
   reference exists; paste/drop absent.
7. **Message actions set** — inline edit (w/ "(edited)" badge), delete-last-
   and-below, retry, live elapsed-time pill, collapsible headings, mention
   badges, actionable command chips, per-message artifact cards, submitted-form
   pills. Prototype models none of these micro-interactions.
8. **Header state chips** — pin count, artifact count, members, test-run
   indicator, "Shared by X" badge. Prototype header: breadcrumb + gauge + two
   buttons. (The quiet direction may WANT fewer chips — but that's a decision
   to make against this list, not in ignorance of it.)
9. **Auto-naming is real + guarded** (AI prompt, 30s timeout, background) and
   **drafts survive conversation switches** via cached composer instances —
   both match prototype behavior, good. But empty-state suggested prompts are
   4-random-of-20, richer than the prototype's 3 static.
10. **Voice affordances on the composer** — instant-call phone button + caret
    picker (co-agent choice persisted, record-consent). Prototype's mic is a
    pulse stub.

## 3. Semantics divergences (known, now code-confirmed)

- **Plan mode**: shipped = sticky per-conversation, `UserInfoEngine`-backed
  (cross-device), `pendingNew` claim for first message, approve auto-disables.
  Prototype = per-request draft state (canvas B5). This is THE D5 re-lock
  agenda item; the code sweep confirms the shipped semantics are deeper than
  the drift table implied (cross-device persistence).
- **Skill gating**: shipped /skill picker filters on user run-permission only —
  agent `AcceptsSkills` is enforced server-side with a warning toast, not
  client-filtered. Prototype doesn't model the warning path.
- **Agent routing precedence** (shipped): @mention → prior-agent continuity →
  conversation-pinned default → app default → Sage. Prototype: draft agent →
  default. The continuity + pinned-default steps are absent.

## 4. Freshness notes

- This branch **predates three merges** on `next` (07-08 → 07-10): live
  final-response streaming into bubbles (×2) and # typeahead ranking /
  Apply-to-my-Form fixes. Diff against `next` before any parity claims about
  streaming.
- **Atlas corrections** (update CONVERSATIONS-ATLAS.md): ratings are a 1–10
  pip dialog not thumbs; atlas omits bulk multi-select, group-by toggle,
  folder drag-drop, collections staging shelf/pagination/context menus,
  artifact "open source conversation", Analyze, rating consent + role grant,
  per-user mode presets, tasks grouping, remote-browser human takeover,
  evidence playback.
- Confirmed still true: no quote/fork, no context gauge, no memory UI, no
  temporary/incognito affordance, public link cosmetic, members modal stubbed.
- Shipped stubs the redesign could delete rather than restyle: like/comment
  reactions (display:none), jump-to-date, message save/share/export handlers,
  thread-panel entry point.

## 5. What this means for the Claude Design variation

1. **Judge the variation as a skin for the hub + chat + composer** — the
   surfaces the prototype models. It cannot be "the new app" until §1's twelve
   surfaces have dispositions.
2. **§2 items are the adoption checklist** — as the variation's visual system
   is ported onto the working prototype, each §2 feature needs a drawn answer
   in the new language (or a conscious regression note in DESIGN-NOTES).
3. **The nesting tension (§2.1) goes on the Amith review agenda** — it upgrades
   the six hierarchy questions from "deferred design" to "shipped behavior the
   redesign must not break."
