---
"@memberjunction/global": minor
"@memberjunction/ai": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-xai": minor
"@memberjunction/ai-huggingface": minor
"@memberjunction/core-entities": minor
---

Add `ModelConfiguration` — a per-modality, strongly-typed JSON configuration bag on the AI model catalog — at three levels forming an inherit-with-override cascade: `AIModelType` < `AIModel` < `AIModelVendor`, resolved base-first with per-key deep merge. One interface (`IAIModelConfiguration`: `LLM` / `Realtime` / `Vision` / `Audio` sections) is shared by all three levels via MJ's JSONType mechanism, so CodeGen emits typed `ModelConfigurationObject` accessors on all three entities. This generalizes the scalar cascade those tables already carry (`SupportsPrefill` / `PrefillFallbackText`): new session/call-time capability knobs now land as typed properties in one bag instead of a column per knob. Existing capability columns are untouched. `AIEngine.GetEffectiveModelConfiguration(modelID, modelVendorID)` is the single canonical read path; the pure `ParseModelConfiguration` / `ResolveEffectiveModelConfiguration` live in `@memberjunction/ai`.

First consumer: realtime turn detection. `Realtime.TurnDetection` (`Mode: 'default' | 'serverVad' | 'semanticVad' | 'native'`, plus eagerness / threshold / silence tuning) flows catalog → session config bag → provider wire block on both realtime topologies, with precedence `profile default < ModelConfiguration cascade < realtime.session.turnDetection < runtime configOverridesJson`. Profiles declare `supportedTurnModes` and translate through the shared `MapNormalizedTurnDetection`; an unsupported mode is diagnostic-logged and falls back to the profile default, so a shared model catalog never rejects a session on any provider. Non-protocol drivers scrub the key. Turn detection was previously hardcoded per provider profile, so smarter models had no way to opt into their smarter turn modes.

Fixes a latent bug: a live `Reconfigure` (the meeting-mode auto-response flip) hardcoded `server_vad`, silently downgrading any session running a non-server-VAD turn mode. It now rebuilds the session's actual resolved mode, with meeting-mode floor control composed on top.

GPT Realtime 2.1 and 2.1-mini are seeded to `semanticVad` (eagerness `auto`) at the model level — the one behavior-affecting change here. Everything else is behavior-neutral while `ModelConfiguration` is `NULL`.
