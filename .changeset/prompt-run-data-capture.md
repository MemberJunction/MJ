---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/templates": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/integration-test-suite": minor
---

Prompt runs store less template data in `AIPromptRun.Messages` (#5526). `Messages` always holds the messages the model received. The template inputs (`data`, `templateData`) are stored per a capture mode: `None` (default: top-level keys and byte sizes only), `Referenced` (only keys the prompt's templates read) or `Full`. Set it per prompt with the new `AIPrompt.TemplateDataCapture` column, per call with `AIPromptParams.TemplateDataCapture`, or per server with `aiPromptRuns.templateDataCapture` in mj.config.cjs. `_CURRENT_PAYLOAD` is never stored; agent-run steps hold the payload. New `TemplateEngineServer.GetReferencedVariables()` lists the variables a template reads.

**API note:** clients that read `data` or `templateData` out of `AIPromptRun.Messages` get less than before.

- The capture mode comes from the call, then the prompt, then the server default. The most specific prompt wins: the run's child prompts come before its main prompt. So for a Loop or Harness agent, a value on the agent's own prompt beats a value on the agent-type system prompt.
- In `None` mode (the default), `Messages` holds no `data` or `templateData`, only the `dataShape` sizes. `ParseMessagesData().inputData` and `GetDataContext()` return null.
- In `Referenced` mode, clients find only the keys that the templates read.
- `data` never holds `_CURRENT_PAYLOAD`, in any mode, `Full` included.
- `ParseMessagesData()` now also returns `dataCapture`, `dataShape` and `dataCaptureNote`.
- If the capture step fails, the run still saves, with `dataCapture: 'None'`, a fixed `dataCaptureNote` and no template data.
- The `GetReferencedVariables()` result has `ParseFailed: true` when a template does not parse.
