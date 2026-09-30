---
"@memberjunction/codegen-lib": minor
"@memberjunction/aiengine": minor
---

Moves the seven CodeGen AI prompts to current models, and makes AI model catalog ranks consistent within each model's version lineage. Metadata only, plus a new CI guard. (#4912)

- **CodeGen prompts** (Check Constraint Parser, Entity Description Generation, Entity Name Generation, Transitive Join Intelligence, Virtual Entity Field Decoration, Form Layout Generation, Smart Field Identification):
  - Gemini 3.5 Flash → **Gemini 3.8 Flash**, on the same Google and Vertex AI routes.
  - Gemini 3.1 Flash-Lite → **Gemini 3.5 Flash-Lite** (Form Layout Generation, Smart Field Identification). Google now comes before Vertex AI, matching Flash.
  - GPT 5.5 Instant → **GPT-6 Luna** on OpenAI. GPT 5.5 Instant only ever called `gpt-5.5`.
  - Claude Haiku 4.5 and GPT-OSS-120B are unchanged; they are still the newest in their families. The failover order is unchanged.
- **Review regenerated output.** CodeGen commits its AI output into each app: `Validate*()` methods parsed from CHECK constraints, entity and field descriptions, display names and form layouts. Apps that regenerate after upgrading may see different AI-written output and should review it before committing.
- **Catalog PowerRank fixes.** Within a lineage, a newer model no longer ranks below the model it replaces:
  - The GPT-5 generation (GPT 5, 5-mini, 5-nano) was ranked above its successors and now ranks 11, 10 and 8.
  - GPT 5.5 → 14, GPT 5.5 Instant → 14, GPT 5.5 Pro → 15, o4-mini → 8, Claude Sonnet 5 → 21, MiniMax-M3 → 21, Grok 4.3 → 22.
  - Prompts and agents that choose models by rank can pick a different model as a result.
- **`PriorVersionID` lineage.** Two links that pointed across tiers are corrected (Gemini 3.1 Flash-Lite, Qwen3.8-Flash). Three variants with no earlier version in the catalog are cleared (GLM-5.3-Flash, GLM 5V Turbo, Mercury Edit 2). Missing links are added for the GPT 5, GPT mini/nano, o-series mini and Gemini Flash lines.
- **New guard:** `.github/scripts/check-ai-model-ranks.mjs` (`pnpm run check:ai-model-ranks`, run in the Source guards CI job) fails when a model ranks below the prior version it names, or names a prior version that doesn't exist.
