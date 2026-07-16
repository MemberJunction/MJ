# V6 — Calibration Deficit + Fix (WS-1 quantification)

**Verdict: PASS** — with a design refinement Phase 0 caught before build.

## Hypothesis
Shipped-class models (esp. gradient-boosted trees) emit materially miscalibrated scores; a simple post-hoc step fixes it cheaply — so calibration is both necessary and worthwhile as workstream #1.

## Method
Planted-probability classification (`gen_classification`, 5,000 rows × 5 seeds) where each row's true P(y=1) is known. Train XGBoost + LogisticRegression; measure Expected Calibration Error (10-bin) + Brier on the locked holdout, three ways:
- **raw** — model's native scores
- **isotonic (slice)** — isotonic fit on a single 25% held-out calibration slice (the naive approach)
- **isotonic (cv)** — `CalibratedClassifierCV`, 5-fold (the proper method WS-1 would ship)

The holdout is never seen by any calibrator (referee tripwire enforced).

## Result (mean over 5 seeds, `results/referee_audit.jsonl`)

| model | raw ECE | slice ECE | cv ECE | AUC | cv cut |
|---|---|---|---|---|---|
| xgboost | **0.062** | 0.041 | **0.023** | 0.814 | **63%** |
| logistic | 0.024 | 0.037 | 0.028 | 0.842 | −21% |

PASS bar: GBT raw ECE ≥ 0.05 (observed **0.062**) and proper calibration cuts ≥ 50% (observed **63%**).

## Three findings
1. **GBT scores are miscalibrated** — a raw "0.8" from XGBoost is not an 80% probability. Confirmed, and it matters because uplift, revenue-at-risk, and budget decisions all treat the score as a probability.
2. **Naive single-slice calibration is unreliable** — it only partially fixed GBT (0.062→0.041) and actively *worsened* the already-well-calibrated logistic model (0.024→0.037). Blindly calibrating everything is a mistake.
3. **Cross-validated calibration is the method** — it cut GBT ECE 63% and, critically, should be **gated ("helps-or-skip"): measure ECE on a validation fold and only apply calibration if it improves**, so it never hurts an already-calibrated model.

Throughout, **AUC is essentially unchanged** — calibration alters what the number *means*, not the model's ranking skill. That's the whole point: same discrimination, honest probabilities.

## What it does for the plan
Validates WS-1 (calibration-first) with real numbers, and **sharpens its design before a line is written**: ship `CalibratedClassifierCV`-style CV calibration as a component, with a helps-or-skip gate driven by a validation-fold ECE check — not a blind single-slice isotonic. Exactly the kind of correction Tier 0 exists to make cheaply.

## Reproduce
`./run.sh v6_calibration` — deterministic (seeds 21–25). Raw records in `results/v6_calibration.result.json`.
