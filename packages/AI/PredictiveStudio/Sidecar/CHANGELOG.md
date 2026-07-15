# @memberjunction/predictive-studio-sidecar

## 5.48.0

### Patch Changes

- @memberjunction/predictive-studio-core@5.48.0

## 5.47.0

### Minor Changes

- 46a06ac: Predictive Studio phase 2: per-record prediction contributions, as-of scoring fix, Studio UX overhaul.
  - **Per-record prediction contributions (P1-5)**: sidecar `/predict` returns the signed top feature drivers behind each row's prediction for linear models (`coef_ · transformed value` — exact and cheap; tree/ensemble models return none and callers fall back to global feature importance). Typed end-to-end via the new `PredictionContribution` in the shared sidecar contract.
  - **Fix — as-of column now covered by the anti-skew hydration guard**: `AsOfStrategy` `column` mode reads its cutoff date off each record, but the required-columns set only tracked feature columns + target, so a scoring scope's narrow projection that dropped the date column failed every record at `resolveAsOfDate` (live repro: 0/6747, circuit breaker). The as-of column is now hydrated and hard-asserted exactly like a feature column; two regression tests added.
  - **Studio UX**: purged all `//` comments from PS SCSS (this package embeds raw SCSS, so `//` comments reach the browser as invalid CSS and silently eat the next rule — root cause of the pipeline-pill layout breakage); Training Pipelines and Model Registry columns now scroll independently via fill-mode content hosts; Models door gains the missing `[Flex]` page body; hero card flattened to standard surface tokens; Predictions door gains business-predictions/at-risk view-models, agent context, and copilot view-models.
  - **Docs**: `plans/predictive-studio-guardrails.md` records 8 field-tested guardrail gaps (G1–G8) with proposed fixes; G8 (the as-of hydration gap) ships fixed here.

### Patch Changes

- Updated dependencies [46a06ac]
  - @memberjunction/predictive-studio-core@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/predictive-studio-core@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/predictive-studio-core@5.45.1

## 5.45.0

### Patch Changes

- @memberjunction/predictive-studio-core@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [18b5bf0]
  - @memberjunction/predictive-studio-core@5.44.0
