"""
The Block-4 component catalog — the standalone twin of the future MJ: ML Components
registry (A6.9.1). ~24 entries with typed ports; `filter_catalog` does the
progressive-disclosure filtering (only situation-compatible entries reach the prompt).

Port vocabulary matches the drafted `port-types.ts` (23 types). Target specs mirror
the study's targetSpec axis: plain | duration+event | series | treatment+outcome | none.
S3's structurally-forced DEFER lives here: the Uplift template REQUIRES a
treatment+outcome targetSpec that the More Cheese schema cannot fill.
"""
from __future__ import annotations

# entry: name, kind, task, consumes(ports), target_spec, emits(ports), blurb,
#        sockets (templates only): [(socket_name, required_port, min, max)]
CATALOG: list[dict] = [
    # ---- classifiers (features:tabular -> probability/class-label) ----
    dict(name="XGBoost Classifier", kind="Model", task="classification",
         consumes=["features:tabular"], target_spec="plain",
         emits=["probability", "class-label"], fi=True,
         blurb="Gradient-boosted trees; the strong tabular default. Scale-invariant, handles interactions."),
    dict(name="LightGBM Classifier", kind="Model", task="classification",
         consumes=["features:tabular"], target_spec="plain",
         emits=["probability", "class-label"], fi=True,
         blurb="Fast gradient boosting; comparable to XGBoost."),
    dict(name="Random Forest Classifier", kind="Model", task="classification",
         consumes=["features:tabular"], target_spec="plain",
         emits=["probability", "class-label"], fi=True,
         blurb="Bagged trees; robust, minimal tuning."),
    dict(name="Logistic Regression", kind="Model", task="classification",
         consumes=["features:tabular"], target_spec="plain",
         emits=["probability", "class-label", "coefficients"], fi=True,
         blurb="Linear, interpretable coefficients; needs scaling; strong when the signal is additive."),
    dict(name="MLP Classifier", kind="Model", task="classification",
         consumes=["features:tabular"], target_spec="plain",
         emits=["probability", "class-label"], fi=False,
         blurb="Small neural net; needs scaling and more data; rarely first choice on small tabular."),
    dict(name="Dummy Classifier", kind="Model", task="classification",
         consumes=["features:tabular"], target_spec="plain",
         emits=["probability", "class-label"], fi=False,
         blurb="The leaderboard floor: predicts the base rate. Any real model must beat it."),
    # ---- regressors ----
    dict(name="Ridge Regression", kind="Model", task="regression",
         consumes=["features:tabular"], target_spec="plain",
         emits=["score", "coefficients"], fi=True,
         blurb="Regularized linear regression; interpretable; needs scaling."),
    dict(name="XGBoost Regressor", kind="Model", task="regression",
         consumes=["features:tabular"], target_spec="plain",
         emits=["score"], fi=True,
         blurb="Gradient-boosted regression; strong tabular default."),
    # ---- survival ----
    dict(name="Cox Proportional Hazards", kind="Model", task="survival",
         consumes=["features:tabular"], target_spec="duration+event",
         emits=["hazard", "survival-curve", "coefficients"], fi=True,
         blurb="Answers WHEN: time-to-event with censoring handled natively; per-feature hazard ratios."),
    dict(name="Weibull AFT", kind="Model", task="survival",
         consumes=["features:tabular"], target_spec="duration+event",
         emits=["survival-curve", "coefficients"], fi=True,
         blurb="Accelerated-failure-time; parametric survival with interpretable time ratios."),
    dict(name="Kaplan-Meier", kind="Model", task="survival",
         consumes=[], target_spec="duration+event",
         emits=["survival-curve"], fi=False,
         blurb="Covariate-free survival curve; the survival floor / population baseline."),
    # ---- unsupervised ----
    dict(name="KMeans", kind="Model", task="clustering",
         consumes=["features:tabular"], target_spec="none",
         emits=["cluster-id"], fi=False,
         blurb="Hard clusters; needs scaling; k chosen by silhouette."),
    dict(name="Gaussian Mixture", kind="Model", task="clustering",
         consumes=["features:tabular"], target_spec="none",
         emits=["soft-assignment", "cluster-id"], fi=False,
         blurb="Soft cluster memberships; elliptical clusters."),
    dict(name="HMM (Gaussian)", kind="Model", task="sequence-state",
         consumes=["features:sequence"], target_spec="none",
         emits=["latent-state", "state-sequence", "transition-matrix"], fi=False,
         blurb="Hidden regimes over a member's activity cadence; emits the state a member is IN."),
    # ---- forecasting ----
    dict(name="ETS (Exponential Smoothing)", kind="Model", task="forecasting",
         consumes=["series"], target_spec="series",
         emits=["forecast-series"], fi=False,
         blurb="Trend+seasonal smoothing; strong small-data forecaster. Time-ordered validation REQUIRED."),
    dict(name="ARIMA", kind="Model", task="forecasting",
         consumes=["series"], target_spec="series",
         emits=["forecast-series"], fi=False,
         blurb="Autoregressive forecaster; time-ordered validation REQUIRED."),
    dict(name="Seasonal Naive", kind="Model", task="forecasting",
         consumes=["series"], target_spec="series",
         emits=["forecast-series"], fi=False, reusable_only=True,
         blurb="Repeats last season; the forecasting floor every forecaster must beat."),
    # ---- calibration ----
    dict(name="Isotonic Calibrator", kind="Calibration", task="classification",
         consumes=["probability"], target_spec="plain",
         emits=["probability"], fi=False,
         blurb="Monotone recalibration; fit on a split the base model never fit on (CV form preferred)."),
    dict(name="Platt Calibrator", kind="Calibration", task="classification",
         consumes=["probability"], target_spec="plain",
         emits=["probability"], fi=False,
         blurb="Sigmoid recalibration; low-data-safe."),
    # ---- transformations ----
    dict(name="Score Banding", kind="Transformation", task="classification",
         consumes=["probability"], target_spec="none",
         emits=["class-label"], fi=False, reusable_only=True,
         blurb="Maps probabilities to named tiers (e.g. Hot/Warm/Cooling); an untrainable, reusable band-set."),
    # ---- templates (fillable holes) ----
    dict(name="Calibrator Template", kind="Template", task="classification",
         consumes=[], target_spec="plain", emits=["probability"], fi=False,
         sockets=[("model", "probability", 1, 1)],
         blurb="Calibrator(model __): wraps any probability-emitting model with post-hoc calibration."),
    dict(name="Cluster-then-Classify", kind="Template", task="classification",
         consumes=[], target_spec="plain", emits=["probability"], fi=False,
         sockets=[("cluster", "cluster-id", 1, 1), ("classifier", "probability", 1, 1)],
         blurb="Composes a clusterer's segment feature into a downstream classifier (via the cluster-id adapter)."),
    dict(name="Uplift T-Learner", kind="Template", task="uplift",
         consumes=[], target_spec="treatment+outcome", emits=["score"], fi=False,
         sockets=[("treated_model", "probability", 1, 1), ("control_model", "probability", 1, 1)],
         blurb="Who is MOVABLE, not who is at risk. REQUIRES a randomized/observed treatment column "
               "plus outcomes under both conditions — cannot run without treatment data."),
    dict(name="Bagging Template", kind="Template", task="classification",
         consumes=[], target_spec="plain", emits=["probability"], fi=False,
         sockets=[("model", "probability", 1, 10)],
         blurb="Bagging(model __ xN): variance reduction over any probability model."),
]

ADAPTERS: list[dict] = [
    dict(name="cluster-id -> features:tabular", from_port="cluster-id",
         to_port="features:tabular", strategy="one-hot encode the cluster id as feature columns"),
    dict(name="latent-state -> features:tabular", from_port="latent-state",
         to_port="features:tabular", strategy="append state posterior / most-likely state as feature columns"),
    dict(name="probability -> features:tabular", from_port="probability",
         to_port="features:tabular", strategy="append the upstream probability as a feature column"),
]

_TASK_COMPAT: dict[str, set[str]] = {
    # situation family -> catalog tasks worth SHOWING (progressive disclosure keeps it tight
    # but honest: templates + structure extractors appear where composition is plausible)
    "classification": {"classification", "clustering", "sequence-state"},
    "survival": {"survival", "classification"},   # GBT-window is a *visible* wrong-tool option
    "uplift": {"uplift", "classification"},       # tempting classifiers visible; template's targetSpec says no
    "forecasting": {"forecasting", "regression"},
    "clustering": {"clustering", "sequence-state"},
    "regression": {"regression", "classification"},
}


def filter_catalog(situation_family: str) -> tuple[list[dict], list[dict]]:
    """Progressive disclosure: entries whose task is plausibly relevant + all adapters
    bridging any shown emit->consume pair."""
    tasks = _TASK_COMPAT.get(situation_family, {situation_family})
    entries = [c for c in CATALOG if c["task"] in tasks]
    shown_ports = {p for c in entries for p in c["emits"] + c["consumes"]}
    adapters = [a for a in ADAPTERS
                if a["from_port"] in shown_ports or a["to_port"] in shown_ports]
    return entries, adapters


def render_entry(c: dict) -> str:
    sockets = ""
    if c.get("sockets"):
        socks = ", ".join(f"{n} __ (requires {p}, {lo}..{hi})" for n, p, lo, hi in c["sockets"])
        sockets = f" | sockets: {socks}"
    reuse = " | reusable-only (untrainable)" if c.get("reusable_only") else ""
    return (f"- {c['name']} [{c['kind']}/{c['task']}] "
            f"consumes: {c['consumes'] or '—'} target: {c['target_spec']} "
            f"emits: {c['emits']}{sockets}{reuse} — {c['blurb']}")
