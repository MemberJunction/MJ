---
"@memberjunction/predictive-studio-core": minor
"@memberjunction/predictive-studio": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-conversations": patch
---

Predictive Studio — business-user experience + a deterministic prediction-builder agent

**`@memberjunction/predictive-studio-core`** — adds the **trust translator** (`deriveTrustVerdict`): turns a model's raw metrics into a plain-language Poor/Fair/Good/Excellent verdict + a `canAct` action gate. Shared by the UI (catalog badges + workspace gate) and the agent's publish gate, so a coin-flip / unmeasured model is fail-safe blocked (never silently acted on or published).

**`@memberjunction/predictive-studio`** — elevates the Model Development Agent into a domain-builder (Database-Designer pattern): a deterministic `PredictiveStudioPipelineBuilder` (pure code, no LLM) turns the agent's approved `ModelingPlanSpec` into a real `MJ: ML Training Pipeline`, trains it, and **publishes only if the trust verdict clears the bar**; a `PredictiveStudioPipelineBuilderAgent` code sub-agent wraps it and a `PredictiveStudioModelDevAgent` orchestrator forces approve→build deterministically. Covered by unit, in-process integration, and an AgentRunner-driven agent-loop test.

**`@memberjunction/ng-dashboards`** — a new business-user **Predictions** surface (the default Predictive Studio nav item): a catalog of published models reframed as plain-language predictions with trust badges (Poor/unmeasured blocked as "Needs an analyst"); a trust-gated workspace with a ranked at-risk list, plain-language drivers, and four actions (review / save scores / send to a list / export); and a "+ New prediction" docked Model Dev Agent co-pilot. Zero ML jargon — the analyst surfaces remain as Advanced.

**`@memberjunction/ng-conversations`** — fixes the realtime session widget's surface/Details panel not opening for a new user (or the agent): the on-demand "Details peek" no longer also requires the cross-session disclosure ratchet, so it opens at any level.
