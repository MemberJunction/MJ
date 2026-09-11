# @memberjunction/predictive-studio-sidecar

## 6.1.0-edge.6

### Patch Changes

- aba12ff: Predictive Studio sidecar: model artifacts are deserialized through a restricted unpickler.

  joblib is pickle underneath, and pickle resolves and calls importable callables while loading, so a crafted artifact submitted to `/predict` (or written to wherever artifacts are stored) could execute code in the sidecar process (CWE-502, CodeQL py/unsafe-deserialization). The loader now resolves only an exact list of the globals the sidecar's own estimators need (scikit-learn, NumPy, XGBoost and LightGBM classes plus a few reconstructors; nothing that takes a path, URL or code string), routes the element pickle of object-dtype arrays through the same restricted loader (joblib's array wrapper otherwise used a bare `pickle.load` that bypassed the guard), and reports every refusal or malformed payload as a client error (400) instead of a 500. Existing stored artifacts, including compressed ones, load unchanged.
  - @memberjunction/predictive-studio-core@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- @memberjunction/predictive-studio-core@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- @memberjunction/predictive-studio-core@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- @memberjunction/predictive-studio-core@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- @memberjunction/predictive-studio-core@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/predictive-studio-core@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/predictive-studio-core@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/predictive-studio-core@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/predictive-studio-core@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [dd04a24]
  - @memberjunction/predictive-studio-core@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [b52ffa8]
  - @memberjunction/predictive-studio-core@5.49.0

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
