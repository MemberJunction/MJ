---
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-vertex": patch
---

The Gemini provider (and Vertex, which inherits it) stops sending `temperature`, `topP` and `topK` to the models that no longer honor them. Google has announced that upcoming Gemini models return 400 INVALID_ARGUMENT for these fields.

- **Sampling fields stop at Gemini 3.6.** Models before 3.6 still honor `temperature`, `topP` and `topK`, so they keep them unchanged, including the 0.5 `temperature` default. Gemini 3.6+ and Gemini ids with no version (such as `gemini-flash-latest`) get none of the three. A caller-supplied value is dropped for those models with one console warning per model and field per process. Google has ignored these values since Gemini 3.6 Flash, so output from those models does not change. The cutoff is read from the version in the model id, so a newly released model needs no code change. Non-Gemini models served by these drivers (Gemma on Vertex) are unaffected.
- **`topP` / `topK` now reach models before 3.6.** They were sent as `top_p` / `top_k`, which `@google/genai` silently drops, so they never took effect. They are now sent as `topP` / `topK`.
- **An explicit `temperature: 0` is sent as 0.** `params.temperature || 0.5` turned it into 0.5.
- **Removed the thinking configuration, which has not reached Google since November 2025.** The provider built a `thinkingConfig` (`thinkingBudget` on Gemini 2.5, `thinkingLevel` on Gemini 3) and set it on the chat session. `@google/genai` replaces the session config with the per-request config whenever a request passes one, and since November 2025 this provider always passes one, so the thinking config was not sent. Since then Gemini has run at each model's default thinking. `effortLevel` was mapped only after that point, so it has never had an effect. This change removes that code, the private `getThinkingBudget` and `supportsThinking` methods, and the `-3` through `-7` model-name check. What goes out on the wire does not change. Making `effortLevel` work on Gemini is separate follow-up work.
