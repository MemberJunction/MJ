# Design Brief — Predictive Studio, business-user ready

**Feature:** Make Predictive Studio usable by a non-technical business user, end-to-end.
**Phase:** 1 (Discover) — locked at the brief gate. The *how* is deliberately open; Phase 2 explores it.
**Branch:** `predictive-studio-ux`.

## Persona — "The Outcome Owner" (primary)
A non-technical **association staff member who owns a result** — the canonical example is a **Membership / Retention Director** accountable for the renewal number. They:
- Think in **outcomes and people** ("who won't renew, and what do I do about it"), not models, features, or metrics.
- Do **not** know — or want to know — AUC, one-hot encoding, leakage, as-of windows, or algorithm names.
- Are **time-poor** and **trust-sensitive**: they'll act on a tool only if it's honest about how much to rely on it.
- Are **not** the person who builds models. (An analyst persona still exists and keeps the Advanced builder.)

## Job-to-be-done
> *"Tell me which members are at risk of not renewing, how much I can trust that, and let me act on it — without needing a data scientist."*

The journey is **Ask → Trust → Act**, end-to-end:
1. **Ask** — express a business question in plain language ("Which members won't renew this year?") through an **embedded conversational agent** (the `@memberjunction/ng-conversations` chat widget the PS dashboard already hosts) — no pipeline, no form. The agent interprets the question, selects/assembles the right model, and orchestrates the rest. Results render as **rich visual artifacts**, not chat text.
2. **Trust** — get a **plain-language confidence verdict** (e.g. Poor / Fair / Good / Excellent + *why you can or can't rely on it*), never a raw `AUC 0.513`. A weak model is unmistakably flagged and **gated from being acted on**.
3. **Act** — do something with the answer. All four matter (user-confirmed):
   - **Ranked at-risk list** — who to focus on, sorted by risk, with the key drivers ("why this member").
   - **Write score to records** — persist the prediction onto member records for other apps/automation/staff.
   - **Push to list / outreach** — send the at-risk set to a saved list or hand off to a campaign.
   - **Report / export** — a shareable view or export for leadership.

## Current pain (what makes it "kinda techie" today)
- **Two products in one coat.** The primary surface is the **analyst builder** — a DAG of `select`/`onehot`/`embedding` nodes with a leakage guard, as-of strategy, single-feature-dominance threshold, and an algorithm picker. Opaque to a business user.
- **Dangerous trust gap.** Model quality is shown as `logistic_regression · holdout 0.513` with **no plain-language read**. `0.513` AUC is a coin flip, but nothing says so — a business user could schedule a junk model against real outreach budget and never know.
- **ML jargon throughout** — "Target Variable", "Problem Type: classification", predictions shown as `0.7883 · Active`.
- **No outcome framing.** Predictions surface as raw probability + class, not "who's at risk / why / what next".
- **No business front door.** Getting a prediction means building or operating a pipeline; there's no "ask a question" entry.

## Success criteria (what makes it *outstanding*, measurably)
1. A non-technical Outcome Owner gets from **question → trusted answer → an action** in one sitting — **no data scientist, no jargon**.
2. The user **always sees an honest, plain-language trust verdict before acting**, and a weak/unsafe model is **visibly flagged and blocked** from being operationalized.
3. **All four actions** are reachable from the prediction result **without leaving the flow**.
4. **Zero ML jargon** on the business surface (AUC, one-hot, leakage, algorithm names, as-of) — those live only in **Advanced**.
5. It **looks and behaves like native MJ Explorer** — chrome trio, design tokens, dark mode, responsive — indistinguishable in polish from the best surfaces in the app.

## Constraints
- **Experience layer, not new ML plumbing.** Reuse the existing engine: training, `FeatureAssemblyExecutor`, scoring (`MLModelInferenceProcessor`), Remote Ops (`CreateScoringProcess` et al.), Record Processes + scoring bindings, and the run history. The four "act" outcomes map to substrate that already exists (write-back = `OutputMapping`/binding; push-to-list = Lists; etc.).
- **The trust verdict must be derived from real metrics** (holdout AUC / accuracy / etc.) — *translate* into plain language, never fabricate.
- **Keep the analyst builder intact** as an Advanced mode (pipelines/DAG/leakage/as-of/algorithms unchanged); the business experience layers on top of the same engine.
- **Conversational Ask reuses `@memberjunction/ng-conversations`** — the embedded chat widget / `mj-conversation-chat-area` the PS dashboard already hosts, with its slots (agentPresence, messageRenderer, demonstrationSurface) + artifact rendering + agent context/client tools. The business "Act" results are **rich visual artifacts**, not chat prose.
- **MJ conventions:** `<mj-page-layout>`/`<mj-page-header>`/`<mj-page-body>` chrome, `--mj-*` tokens (no hardcoded colors), MJ UI components, `NotifyLoadComplete()`, agent context, reactive engines.

## Non-goals
- Not changing the ML engine, training, sidecar, or algorithms.
- Not removing or dumbing-down the analyst builder — it stays as **Advanced**.
- Not inventing a new prediction-storage mechanism (use existing write-back / run-history / materialization paths).
- Not sending outreach/campaigns ourselves beyond **handing off** to the existing Lists / Communication substrate.
- Not committing yet to *how* "Ask" works (catalog of published questions vs. guided wizard vs. agent-led) — Phase 2's three divergent mockups exist precisely to explore that fork.

## Open question the mockups will answer
The **"Ask" is conversational** — an embedded `ng-conversations` chat widget, decided. So the real fork the three Phase-2 mockups diverge on is **the relationship between the embedded chat and the visual "Act" surfaces** (the trust verdict, the ranked at-risk list, the four actions):
- **A · Chat-primary** — the conversation IS the surface; trust card / at-risk list / actions render **inline as artifacts** in the thread. (Risk: scanning/comparing long lists in a thread.)
- **B · Canvas + docked co-pilot** — a persistent visual workspace with the chat **docked alongside**, driving + narrating it; ask in chat → the canvas fills in. (Best for see-and-act; risk: two focal points.)
- **C · Guided + conversational hybrid** — a structured outcome→trust→act flow where each step is completable by **clicking or asking**. (Best for first-timers; risk: feels more form-like.)

All three feature the embedded chat widget and render results as rich artifacts; we pick after you see them.
