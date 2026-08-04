# User Routines in Conversations — Design Brief

**Feature:** Creating and living with User Routines inside the MJ Explorer conversations surface.
**Date:** 2026-07-02 · **Status:** Brief derived from Amith's spec; mockup review is the combined Phase 1–3 gate.

## Persona

**Primary:** the business user who already lives in MJ conversations — talks to Sage/Query Builder/Research Agent daily, doesn't think in cron expressions, thinks in "every morning" and "when something changes." **Secondary:** the power user/analyst who wants precise control (exact cron, windows, recipients, skills) — served *fully* by the dedicated Routines app (separate workstream); the conversations surface must not force their complexity onto the primary persona.

## Job to be done

1. **"Run this again for me every morning"** — turn the prompt/conversation I just had into a recurring routine in seconds, without leaving the thread.
2. **"Set up a watch"** — create a routine from scratch in-chat (scheduled digest or a Monitoring watch that only pings me on change).
3. **"What's running on my behalf, and what did it find?"** — glanceable list of my routines + recent run results, with a one-click path to the full run record; consume routine results as naturally as agent replies.

## Current pain

Nothing proactive exists for end users — every insight requires showing up and asking. System Scheduled Jobs are admin-only infrastructure. Competitors (ChatGPT Tasks, Gemini Scheduled Actions) set the expectation that a chat assistant can act on a schedule.

## Success criteria (outstanding, not acceptable)

- Turning a message into a routine takes **≤ 10 seconds and ≤ 3 decisions** for the default path (smart defaults everywhere; NL schedule phrases, not cron).
- Full schema power is *reachable* (window, recipients+order, skills pre-arm, notify condition, Monitoring) but **progressively disclosed** — never a 15-field wall.
- Run results feel native to conversations (not a separate inbox); OnChange watches are quiet until they matter.
- Zero new visual language: MJ tokens, existing conversations chrome, light+dark both flawless.

## Constraints

- Schema is fixed (see PR #3035): target Agent/Action/Prompt, cron+timezone, StartAt/EndAt, Scheduled|Monitoring, NotifyCondition, recipients (ordered, user-or-email), RequestedSkillIDs, NotificationTemplateID.
- Dispatcher runs ~1-minute cadence — "run now" = NextRunAt bump, honest about latency.
- Conversations chrome (sidebar / chat / composer) must remain the host; the deep-management Routines app exists separately for the power path.

## Non-goals

- Not redesigning the Routines *app* (separate deliverable in flight).
- No new notification infrastructure in the mockups beyond what ships (in-app + email).
- Action-target routines are supported by the substrate but are NOT surfaced in the chat creation flow (Agent/Prompt only there — Action routines belong to the app).

---

## Locked design decisions (Amith, 2026-07-02 — mockup review)

**Chosen direction: Option B — Command Center** (most consistent with existing MJ patterns), with these amendments:

1. **Placement**: NOT a right-panel button. Routines surface as a **new section at the very bottom of the conversations left sidebar** (below folders/pinning — deliberately at the bottom to avoid cluttering the primary nav). Clicking opens the full command-center experience (slide-in).
2. **Architecture**:
   - **`UserRoutineEngine`** — pure-metadata `BaseEngine` subclass in `MJCoreEntities`, **NOT auto-startup** (`@RegisterForStartup` omitted — loaded lazily via `Config()` only where used).
   - **`@memberjunction/ng-user-routines`** (packages/Angular/Generic): separate widgets — **My Routines list**, **New Routine editor**, **History** — plus a **composite** full command-center component, plus a **slide-in wrapper** built on the standard slide-in from `@memberjunction/ng-ui-components`. Rich consumer control surface: PascalCase `@Input()`s/`@Output()`s/public methods, **cancelable Before/After events** — following the `ng-conversations` event/slot/property patterns.
3. **ng-conversations consumption**: new bottom-left section consuming the generic widgets. **`ShowRoutines` (bubbled `@Input`, default true)** lets consumers disable the entire surface. Additionally, **permission gate**: if the current user lacks at least Read on `MJ: User Routines` (via `Metadata`/`EntityInfo.GetUserPermisions`), the section hides regardless of the prop — admin-disabled means invisible, not noisy.
4. **Iconography**: `fa-rotate` rejected (reads as "refresh"). Use a distinct Font Awesome mark (e.g. `fa-solid fa-business-time`) consistently across sidebar/app/forms.
5. **Agent identity**: routine rows/pickers show **the target agent's own `IconClass`** (generic robot only as fallback when the agent has none).
6. **Creation UX scope (v1)**: **Agent targets only** — no TargetType selector shown; `TargetType='Agent'` set implicitly. Agent selection via a **categorical tree picker** (from `@memberjunction/ng-trees`) grouped by agent category, showing agent icons. (Prompt/Action targets remain schema-supported and reachable via the Routines app/API.)
7. Run-now v1 semantics stay: `NextRunAt = now`, honest ~1-minute dispatcher latency messaging.
