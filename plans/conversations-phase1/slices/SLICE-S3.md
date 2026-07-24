# SLICE-S3 — Front Door (F0/F0x/F1) · spec (2026-07-23)

> Reviewed-before-code per IMPLEMENTATION-PLAN §2b. Direct commits to `conversations-shell`
> after Matt's in-browser review. Replaces the frame's `frontdoor` placeholder — the landing
> surface (D-S2, one-way door: composer first, then EXACTLY three earned sections).

## 1. Ledger rows

Discharges (MOCKUP): F1 canonical landing (hero + Needs you / Continue / Ran overnight) ·
F0 first-run (starters + seedling foot; teaching line already shipped in S1's sidebar) ·
F0x variant (project dots/labels hidden — flows from ShowProjects input) · loading + error
states w/ Retry. Carries: D-S2's "exactly three sections" lock · quiet-dot rule.

## 2. Mockup references

`functional-mockup-src/app.js`: `renderFrontDoor` (677) — hero (time-of-day greeting +
first-name, sub line, composer), first-run branch (STARTERS 618 + seedling foot), loading
skeleton + error-with-Retry branches · `fdNeedsYou` (626) · `fdCard` (646) · `fdRan` (656,
capped at 3) · `fdSect` (672 — section label + right-side action link). Template CSS:
`.qh-page.fd`, `.fd-title/.fd-sub`, `.fd-need` rows, `.fd-cards`/`.fd-card`, `.qh-sect`/
`.qh-label`, `.fr-sug`, `.fd-skel`, `.fd-err`.

## 3. Component + data (client-first, real queries)

**`mj-shell-front-door`** (standalone, `components/shell/shell-front-door.component.*`).
Inputs: `Provider`, `EnvironmentId`, `CurrentUser`, `ShowProjects`. Outputs:
`ConversationSelected`, `ViewRequested(ShellView)` (All chats → / Routines →),
`ComposerSubmitted({text, attachments})`.

- **Hero composer** = `mj-conversation-empty-state` (the verified send-to-create seam):
  greeting/sub via its inputs (time-of-day + `CurrentUser.FirstName`), starters as
  `SuggestedPrompts` in first-run; `messageSent` → frame creates the conversation via the
  existing **pendingMessage contract** (frame: view=chat + isNewConversation +
  `[pendingMessage]`/`[pendingAttachments]` into chat-area — BASELINE §B auto-send path).
  Layout-only CSS constrains it to hero position (no full-pane centering).
- **Needs you** (renders only when non-empty): two real sources —
  1. `MJ: AI Agent Requests`, `Status='Requested'`, unexpired, current user's — "Review" opens
     the linked conversation when one exists, else emits the host navigation used by the
     notifications chain (field names verified at build).
  2. `MJ: AI Agent Runs`, `Status='Failed'`, last 7 days, with a ConversationID in the user's
     scope — "Open" lands in the thread (retry lives in-thread; Front Door doesn't grow a
     retry side-channel in v1).
  Both via `RunView.FromMetadataProvider(ProviderToUse)`, `ResultType:'simple'` + narrow
  `Fields`. Provisional-memory-notes items: EXCLUDED (P1.6, Amith's lane).
- **Continue**: top 4 from `ConversationEngine` recents (cards: project dot + name · relative
  time · title · description; quiet dot via NotificationService). "All chats →" →
  `ViewRequested('chats')`.
- **Ran overnight**: `MJ: User Routine Runs` (current user's routines, last 48h, newest
  first, cap 3) — routine name + relative time + status; "Open result" opens the run's linked
  conversation when present, else `ViewRequested('routines')`. Completed-workflow items from
  the mockup: OMITTED in v1 (task graphs lost top-level presence per D-S6; revisit with S4's
  Runs section).
- **States**: loading skeleton while the two RunViews are in flight (engine recents render
  immediately); error branch with Retry re-running the queries. Sections render only when
  they have content — the calm contract.

## 4. Frame changes

`frontdoor` placeholder entry removed; view renders the component; `ComposerSubmitted` →
new-conversation-with-pending-message flow; `ViewRequested` → `OnViewSelected`.

## 5. Exclusions (slots reserved)

"Since you were last here" line + unread anything beyond the quiet dot (D-S9, §E) ·
provisional-notes review items (P1.6) · workflow/task rows in Ran overnight (D-S6; S4 Runs) ·
temporary-chat chip on the hero composer (P1.6 incognito).

## 6. Test plan + review checklist

- Unit: greeting bucket by hour · needs-you assembly from faked query rows (request + failed
  run mapping, empty → section hidden) · continue selection (top-4, has-messages filter
  dropped — engine recents used as-is, documented) · ran-overnight cap + ordering · first-run
  detection (zero conversations in scope). Suite stays green.
- Gates: build, CSS token + button checks.
- Matt's walk: landing with real data (three sections, spacing, cards) · click-throughs
  (Review/Open/card/All chats/Routines/Open result) · composer send creates conversation and
  auto-sends · first-run persona (needs an empty account or temporary filter — else review
  starters via the empty-state props in dark/light) · loading + error (dev-tools offline for
  error) · F0x variant · dark.

## As-built notes + review-round changes (Matt in-browser review, 2026-07-23/24)

- Faithful to spec: hero (greeting/sub/real composer via mj-message-input emptyStateMode),
  Needs-you (agent requests + failed runs over the wire), Continue (engine recents, 4 cards),
  Ran overnight (routine runs, cap 3), loading/error/first-run states, exclusions held.
- **Data-model fix**: `MJ: User Routine Runs` has NO UserID — ownership scopes through the
  routine; query chain = my routines first, then runs by RoutineID IN (...).
- **Two send-path bugs found+fixed via review** ("should chat work from front door yet?"):
  (1) Front Door sends had no delivery target — chat-area's pendingMessage contract requires
  an EXISTING pinned conversation; the frame now CREATES the conversation (same
  engine.CreateConversation call the product empty state uses) then delivers pinned.
  (2) The frame dropped chat-area's conversationCreated round-trip (pendingMessage), so
  empty-state first-sends would have been eaten; now round-tripped per contract.
- **Review ratifications (Matt)**: Needs-you capped at 3 w/ inline "All (N) →"/"Show less"
  expand (query caps raised to 15) · **New conversation lands on the FRONT DOOR** (consolidates
  the mockup's separate T0 new-chat surface; chat empty state remains as embedder surface +
  send-failure fallback) · hero composer elevation = drop-shadow ONLY (ng-composer's
  .message-input-box-container is the ONE box of chrome; first attempt double-boxed) ·
  **token-normalization pass across all four shell CSS files** (spacing/type/radius/shadow →
  --mj-* tokens; sanctioned exception: 11px micro-labels below the token scale, commented;
  policy header in composed-shell.component.css; visual shifts: 38→36px sections, 26→24px
  title, rows 12.5→12, leads 13.5→14) · **`.mj-input--sm` added to ng-ui-components**
  (32px variant height-matched to mjButton sm, documented) + applied to both shell filters +
  seg stretched to 32px — toolbar height alignment · InputDialogComponent: standard 20px
  dialog inset + 16px inter-field spacing (service-opened dialog bodies ship zero padding by
  design; content owns its inset).
- Scroll fix: child-surface sizing moved to PARENT-scoped rules in composed-shell.css
  (second observed partial-:host-application case; parent content-scoped rules always match —
  documented as the package pattern).
- Verification: builds clean (ng-conversations + ui-components) · 901/901 tests (5 new
  front-door pure-logic tests) · CSS gates 0 violations (4 files) · live probes: mount,
  sections w/ real data (7 needs-you items), send-to-create E2E w/ agent reply, needs-you
  expand/collapse, scroll, no-param regression. PENDING dev-server-restart verification:
  toolbar-height alignment, dialog padding, dialog field spacing (all in dist, unverified
  in-browser at commit time).
