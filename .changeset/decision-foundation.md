---
"@memberjunction/ai": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-vector-dupe": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/testing-engine": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/interactive-component-types": minor
"@memberjunction/react-linter": minor
"@memberjunction/react-runtime": minor
"@memberjunction/server": minor
---

Decision foundation:

- **Calibration is model metadata.** Platt fits move from four hard-coded tables (conversation routing, agent discovery, the memory note gate, duplicate detection) to `ModelConfiguration.Decision.Calibrations` on the `Jev` and `LLM Decision` AI models, keyed by use, question and exact resolved model, with identical values. `AIEngineBase`/`AIEngine` implement the new `DecisionCalibrationSource`; `FindDecisionCalibration(source, { Use, Question }, answeredBy)` replaces the table form. Breaking for direct callers: `InterpretRoutingAnswers`, `CalibratedContinuesProbability`, `CalibrateDiscoveryAnswers`, `DecisionDiscoveryFromResult` and `JudgeMemoryNotes` take a calibration source; `ROUTING_CONTINUES_CALIBRATION`, `DECISION_DISCOVERY_CALIBRATION`, `MEMORY_NOTE_DECISION_CALIBRATION` and `DUPLICATE_DECISION_CALIBRATION` are replaced by key constants.
- **`AIDecisionRunner` fits requests to the model.** A request over `MaxQuestionsPerCall` is split into several calls and merged instead of failing over; `MaxStateTokens` is now enforced (estimated); every decision call has a default 60 s timeout (`DEFAULT_DECISION_TIMEOUT_MS`).
- **Multimodal decisions.** `DecisionParams.Media` / `AIDecisionParams.Media` carry images, audio, video and PDFs; drivers declare `SupportedMediaTypes`, and the runner skips with failover the models that cannot read a request's media. `GeminiDecision` reads all four.
- **`LLMDecision` reports the chat model that answered** after a failover inside its chat prompt, so the right calibration is applied.
- **Shadow decisions.** `StartShadowDecision` runs a decision beside an existing path without changing its outcome and records the agreement on the decision's run (`RunName = 'Shadow: <use>'`, comparison JSON in `Comments`).
- **Fitting is one rig run.** `FitDecisionCalibrations` (testing-engine) fits Platt calibrations for any use, question and model from labelled points or labelled decision prompt runs, out of fold, with an optional prior shift to production's mix, and the `fit-decision-calibration` rig prints ready-to-paste `Calibrations` entries and a report.
- **Typed decisions in the browser and in interactive components.** `RunDecision` takes up to 1,000 questions (was 32; the character caps still bound a request), and interactive components get `utilities.ai.Decide` (optional on `SimpleAITools`), allowed by the component linter and documented in the component spec guide.
