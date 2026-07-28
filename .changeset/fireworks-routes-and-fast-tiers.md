---
"@memberjunction/ai": minor
---

Add Fireworks.ai inference routes for **Kimi K3** and **GLM 5.2**, and register the two fast-tier serving paths — **Kimi K3 Fast** and **Claude Opus 5 Fast** — as their own catalog entries.

Fireworks stood up a hosted serverless endpoint for Kimi K3 on the day its open weights dropped, but that week's research pass classified the drop as a self-host event rather than a vendor event, so no route was added. GLM 5.2 had the same gap for a duller reason: `GLM 4.6` and `GLM 4.7` both carry Fireworks rows and 5.2 was skipped. Claude Opus 5's fast mode was described in prose on the Opus 5 entry but never modeled, so nothing in the catalog could route to it.

- **Kimi K3 → Fireworks.ai** (`accounts/fireworks/models/kimi-k3`, `FireworksLLM`) — `$3.00`/`$15.00` per 1M with `$0.30` cached input, 1,048,576 input / 131,072 output. Vendor-parity with Moonshot direct: Moonshot's early-access license bars third-party hosts from undercutting its own API, so Fireworks competes on US-hosted infrastructure and zero data retention rather than price. Priority tier (`$3.75`/`$18.75`) is not modeled.
- **GLM 5.2 → Fireworks.ai** (`accounts/fireworks/models/glm-5p2`, `FireworksLLM`) — `$1.40`/`$4.40` per 1M with `$0.14` cached input, 1M input / 131,072 output. Live day-zero on Fireworks, vendor-parity with Z.AI direct.
- **Kimi K3 Fast** (`accounts/fireworks/routers/kimi-k3-fast`) — `$4.50`/`$22.50` per 1M with `$0.45` cached input. Identical weights to standard Kimi K3 at ~2× generated-token throughput; the premium buys latency, not capability. No Priority variant exists for the Fast tier.
- **Claude Opus 5 Fast** (`claude-opus-5-fast` on Anthropic direct, `anthropic/claude-opus-5-fast` on OpenRouter) — `$10`/`$50` per 1M, exactly 2× standard Opus 5 for ~2.5× output throughput.

Fast tiers are modeled as separate models rather than extra vendor rows on the base model because `MJ: AI Model Costs` rows key on `(ModelID, VendorID, ProcessingType)` — a second Fireworks realtime cost row on Kimi K3 would be ambiguous about which price applies to which route. This follows the existing `MiniMax-M2.5-highspeed` precedent, including its rank convention (same `PowerRank`, `SpeedRank` +2, `CostRank` +1). It also matches how the providers expose them: both are distinct endpoints selected by model ID, not a per-request flag. On Fireworks the fast path is a **router**, not a model — `accounts/fireworks/routers/…`, not `.../models/…`.

Three notes carried in the entries themselves for whoever reads this later:

- **`Claude Opus 5 Fast` is not available everywhere Opus 5 is.** Fast mode is a research preview on the Anthropic first-party API only — not on Amazon Bedrock, Google Vertex AI, or Microsoft Foundry, and not supported by the Batch API. There is deliberately no Bedrock vendor row and no batch cost row. Route batch and cloud-hosted workloads to standard `Claude Opus 5`.
- **`Claude Opus 5 Fast` leaves `CacheReadPricePerUnit` null on purpose.** Anthropic publishes `$10`/`$50` but no separate fast-mode cache-read rate, and it is not safe to assume 2× the standard `$0.50`/1M. Verify before letting cache economics drive routing.
- **Neither new model sets `PriorVersionID`.** That column means "previous version in a lineage chain"; a fast tier is the same weights on a different serving path, not a successor. Populating it would assert that Fast supersedes Standard, so anything walking the chain for the newest model in a family would recommend a 1.5–2× more expensive route as the upgrade.

Prices were verified against Fireworks' own serverless pricing documentation and Anthropic's pricing page rather than aggregator sites, which disagreed on the fast-tier figures.

Delivered as declarative metadata only (`.ai-models.json`: 2 models + 7 vendor rows + 5 cost rows, CLI-`uuidgen` primaryKeys, no sync blocks) — the consolidated metadata-sync migration is generated at release time by the build engineer's `mj sync push`, per the release workflow in `metadata/CLAUDE.md`.
