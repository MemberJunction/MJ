---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

AI model metadata refresh — week of 2026-09-07

Weekly AI model/vendor research pass over `metadata/ai-models/` and `metadata/ai-vendors/`. Four new
models, one new vendor, one rate card resolved, one retirement recorded.

**New models**

- **Claude Fable 5.1** (Anthropic, 2026-09-01) — `claude-fable-5-1`, 1M context / 128K output,
  $10/$50 per 1M unchanged from Fable 5, but cache reads cut 75% to $0.25/1M. Anthropic direct,
  Amazon Bedrock and OpenRouter routes.
- **GPT-6 Astra** (OpenAI, 2026-09-03) — `gpt-6-astra`, 1.05M context / 128K output, $10/$50 at the
  short-context tier. Requests above 272K input tokens are rebilled entirely at $20/$75; that second
  tier is documented in the cost record's Comments rather than given its own row. OpenAI direct plus
  a Microsoft Foundry/Azure route (Limited Access Program). No Bedrock or OpenRouter row — neither
  was serving it at the time of research.
- **Gemini 3.8 Flash** (Google, 2026-09-02) — `gemini-3.8-flash`, 1M context / 64K output, holding
  3.7 Flash's $0.75/$3.75 introductory rate through 2026-12-31 before stepping to $1.50/$7.50.
  Google, Vertex AI and OpenRouter routes.
- **Muse Spark 1.3** (Meta, 2026-09-02) — 1,048,576-token context, $1.25/$4.25 Standard tier.

**New vendor**

- **Meta**, credential type `API Key`, added as a Model Developer only. Muse Spark 1.3 reaches
  inference through OpenRouter (`meta/muse-spark-1.3`, `OpenRouterLLM`), so no new driver class is
  required. The cheaper Contributor tier is intentionally not recorded — it grants Meta training
  rights over submitted data.

**Pricing**

- **GLM 5.3** gains a Z.AI Inference Provider row (`glm-5.3`, 1M context / 128K output) and its
  first cost record at $1.40/$4.40 per 1M with $0.26/1M cached input, resolving the "pricing TBD"
  placeholder left when the model was added on 2026-08-24.

**Deprecation**

- **Claude Opus 4.1** was retired on the Anthropic API on 2026-08-05. Its Anthropic Inference
  Provider row moves to `Inactive` and its Anthropic cost row to `Expired` with
  `EndedAt: 2026-08-05`. The Model Developer row stays `Active`, and the Amazon Bedrock and
  OpenRouter rows are untouched — those platforms set their own retirement schedules and still serve
  the model.

The full report, including everything flagged for human review rather than applied, is in
`reports/ai-model-research/2026-09-07-weekly-report.md`.
