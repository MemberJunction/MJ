---
"@memberjunction/ai-vertex": minor
"@memberjunction/aiengine": minor
"@memberjunction/ai": minor
"@memberjunction/core-entities": minor
---

Gemini 3.8 Live gets a Vertex AI (Gemini Enterprise) model-vendor row, its voices and one example avatar persona on Vertex AI, an avatar video price and a default Vertex AI token price. The AI configuration JSON type catches up with its `@memberjunction/ai` mirror, and `spCreateAIModelCost` lets a cost row omit the deprecated `PriceTypeID`.

- **Vertex AI row:** `GeminiEnterpriseRealtime`, API name `gemini-3.8-live`, the Google row's `ModelConfiguration.Realtime`, Priority 1 (Google's is 0). Realtime sessions select it only where `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` is set. Gemini 3.8 Live also gains a Video / Output modality row.
- **Voices and avatar on Vertex AI:** Puck, Charon, Kore, Fenrir and Aoede get Audio bindings on Vertex AI with the same voice names as on Google, and the new persona "Ben" pairs Google's "Ben" avatar preset (Video binding, `VendorSettings.Avatar.Kind` `preset`) with the Puck voice. With the existing model persona rows plus Ben's, Gemini 3.8 Live lists all six on Vertex AI; the Google listing is unchanged. The Vertex AI names are unverified until Vertex AI access, and each binding says so.
- **Avatar video price:** `ModelConfiguration.Realtime.Pricing.AvatarVideoOutput` on the Vertex AI row is $0.37152 per minute in USD ($1.00 per 1M tokens at 6,192 tokens per second; unverified until Vertex AI access). Nothing reads the price yet.
- **Token price:** a default cost row for Gemini 3.8 Live on Vertex AI mirrors Google's Developer API list price ($0.75 input and $4.50 output per 1M tokens, Realtime), to be checked against the Vertex AI price list. It leaves `PriceTypeID` to the database default.
- **AI configuration types:** `IAIConfiguration` now declares everything the `@memberjunction/ai` mirror does: `TurnDetection.Coverage`, `Reasoning.Level` (new in both, with `RealtimeReasoningEffort`), `Reasoning.IncludeThoughtSummaries`, `Tooling`, `RequestedTracks` (with a copy of the track descriptor types), `IdleSignal`, and the new `Pricing`. Members the mirror declares without `| null` lose it in the JSON type, so the generated `ModelConfigurationObject` / `PromptConfigurationObject` / `ConfigurationObject` types on the six AI entities match the mirror exactly. A Core test now fails when the two drift.
- **`spCreateAIModelCost`:** a migration drops the procedure so CodeGen regenerates it with `@PriceTypeID` optional, defaulting to the Tokens price type (the column default since 6.1). Cost rows can now omit the deprecated column, as its description asks.
