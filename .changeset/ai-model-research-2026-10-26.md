---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

Weekly AI model research refresh (2026-10-26). Adds three models released in the research window to `metadata/ai-models/.ai-models.json`:

- **Kimi K3.1 Pro** (Moonshot AI, `kimi-k3.1-pro`, 2026-10-23) — $2/$10 per 1M tokens with $0.20 cached input, a one-third cut from Kimi K3; 1M-token context, flat pricing. Chained to Kimi K3 via `PriorVersionID`.
- **Kimi K3.1 Pro Highspeed** (Moonshot AI, `kimi-k3.1-pro-highspeed`, 2026-10-23) — the 2x-speed serving tier at $4/$20, modelled as its own record because it is a distinct API id, matching the existing Kimi K3 Fast convention.
- **MiniMax-M3.1-Flash** (MiniMax, `MiniMax-M3.1-Flash`, 2026-10-19) — $0.15/$0.60 with $0.015 cached input, 1M-token context with no long-context step-up.

No pricing changes, deprecations or new vendors this week. A first-party sweep of all 14 Anthropic cost rows against `platform.claude.com` found zero drift. Full findings, including items flagged for human review, are in `reports/ai-model-research/2026-10-26-weekly-report.md`.
