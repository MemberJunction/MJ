---
"@memberjunction/ai": minor
"@memberjunction/ai-systemone": minor
"@memberjunction/ai-inception": minor
"@memberjunction/ai-cloudflare": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add two decision models, each with a driver for its vendor's own API. Both are unmeasured in MJ, and their probabilities are not calibrated.

- **SubQ Snap** (new vendor Subquadratic, PowerRank 43): `SubQDecision` in `@memberjunction/ai-systemone` speaks SubQ's System One API (`subq-snap-preview`, public preview). A 402 is `NoCredit`, and a 403 or 422 a `ModelError`.
- **Mercury Decide** (Inception Labs, PowerRank 44): `InceptionDecision` in `@memberjunction/ai-inception` speaks Inception's System One API (`mercury-decide`). A 402 is `NoCredit` and a 422 a `ModelError`. Also served through OpenRouter (`OpenRouterDecision`).

Shared in `@memberjunction/ai`:
- `BaseHostedSystemOneDecision`, the base of the fixed-endpoint System One drivers: endpoint precedence (constructor, credential, default), the vendor's error message, and the missing-key check.
- `ReadSystemOneErrorMessage` (the vendor's message from an error body), `RedactSecret`, and the protected `GetHTTPErrorType` hook (a status's error type, attached as a failover-eligible classification).

Changes to existing drivers:
- `SystemOneDecision` and `PerplexityDecision` error messages also read SubQ-style `detail` objects, and an empty `detail` falls through to `error`.
- Every `BaseSystemOneDecision` driver redacts the API key (for `CloudflareDecision`, also its token alone) from HTTP error messages, before any truncation and again after the vendor message is decoded; a key under 8 characters is left as is.
- `PerplexityDecision` now extends `BaseHostedSystemOneDecision`, with no change in behaviour.

**Default Decision.** Its bindings are unchanged, but every active Decision model joins its power-matched fallbacks, ordered by PowerRank distance from its target (57). Mercury Decide and SubQ Snap are the last. A fallback is tried only when one of its rows has a credential: an OpenRouter key (as for Jev), a credential bound to the Inception Labs or Subquadratic vendor, or a default `API Key` credential is enough. To keep a model out, set its row's `Status` to `Inactive`.
