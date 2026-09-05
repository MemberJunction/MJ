"""Does composing actually EARN its complexity? Measured — and the answer here is no.

The Architect is told to reach for `compose` only when a single family plainly cannot express what
the problem needs, and it has never chosen `compose` on any live run. This was written to find out
whether that is the guidance working or the Architect being timid, by BUILDING a problem with
deliberately mixed structure and measuring whether a stack beats every single family on it.

Two constructions were measured, on identical splits and seeds:

| Structure | linear | forest | stack |
|---|---|---|---|
| smooth trend + ASYMMETRIC threshold corners | 0.7000 | 0.6384 | 0.6909 |
| smooth trend + PURE exclusive-or | 0.5343 | 0.8834 | 0.8835 |

The first was a flawed construction and is recorded because the flaw is instructive: asymmetric
corners leave `spend` and `contact` with marginal effects, so the linear model borrowed the
interaction sideways and beat the stack outright.

The second is clean — a symmetric XOR has no marginal effect at all, so the linear model is at
chance (0.534) while the forest reads it easily (0.883). And the stack **ties** the forest to four
decimal places. That is the finding:

> **A tree ensemble already spans both smooth and interaction structure, so stacking it with a
> linear model adds a view the forest did not need.** Composition earns its complexity when families
> have genuinely NON-OVERLAPPING capability, and random-forest-versus-logistic is not that pair —
> one is close to a superset of the other.

Which means the Architect choosing `commit` and `defer` and never `compose` on this model pool is
**correct behaviour, empirically**, not timidity. The missing ingredient is not a better prompt; it
is families with complementary blind spots (a sequence model beside a tabular one, a frozen
component that already knows a sub-problem), or a structure whose value is variance reduction rather
than combining views.

The tests below therefore assert what is TRUE — the families diverge sharply, and the stack does not
beat the better one — so this stays a regression test on a real property rather than an aspiration.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SEED = 11
N_ROWS = 1200


def _mixed_structure_data(seed: int = SEED, n: int = N_ROWS) -> Tuple[List[str], List[list]]:
    """A target that needs BOTH a smooth trend and a threshold interaction to predict well."""
    rng = np.random.default_rng(seed)
    tenure = rng.uniform(0, 1, n)          # smooth, monotonic contribution
    spend = rng.uniform(0, 1, n)           # half of the interaction
    contact = rng.uniform(0, 1, n)         # the other half
    noise_a = rng.uniform(0, 1, n)
    noise_b = rng.uniform(0, 1, n)

    # Smooth part: more tenure, more likely to renew. A linear model reads this directly.
    smooth = 1.6 * tenure

    # Threshold part: a PURE exclusive-or. Agreement (both high or both low) helps; disagreement
    # hurts, by the same amount. That symmetry is deliberate — it leaves spend and contact with no
    # marginal effect at all, so a linear model cannot borrow any of this signal through main
    # effects. An earlier asymmetric version let the linear model see the interaction sideways,
    # which is exactly why it beat the stack.
    agree = (spend > 0.5) == (contact > 0.5)
    interaction = np.where(agree, 2.2, -2.2)

    logit = smooth + interaction - 0.9
    prob = 1.0 / (1.0 + np.exp(-logit))
    label = rng.uniform(0, 1, n) < prob

    columns = ["tenure", "spend", "contact", "noise_a", "noise_b", "label"]
    rows = [
        [float(tenure[i]), float(spend[i]), float(contact[i]), float(noise_a[i]), float(noise_b[i]),
         "renew" if label[i] else "lapse"]
        for i in range(n)
    ]
    return columns, rows


def _train(graph: Dict | None, root_driver: str, hyperparameters: Dict | None = None) -> Dict[str, float]:
    """Train one architecture on the SAME data and split, and return its locked-holdout metrics."""
    columns, rows = _mixed_structure_data()
    feature_cols = [c for c in columns if c != "label"]
    body = {
        "algorithm": root_driver,
        "problem_type": "classification",
        "hyperparameters": hyperparameters or {},
        # One split, one seed, one holdout for every architecture — otherwise the comparison is noise.
        "validation": {"strategy": "train_test_split", "test_size": 0.25, "holdout_size": 0.25, "random_state": SEED},
        "feature_schema": [{"Name": c, "Kind": "numeric"} for c in feature_cols],
        "preprocessing": [{"op": "standardize", "cols": feature_cols}],
        "target": "label",
        "data": {"columns": columns, "rows": rows},
    }
    if graph is not None:
        body["component_graph"] = graph
    response = client.post("/train", json=body)
    assert response.status_code == 200, response.text
    payload = response.json()
    # The honest number: the slice the fit never saw.
    return payload.get("holdout_metrics") or payload["metrics"]


STACK = {
    "driver": "stacking",
    "hyperparameters": {"cv": 4},
    "children": [
        {"driver": "logistic_regression", "slot": "estimators", "hyperparameters": {"max_iter": 400}},
        {"driver": "random_forest", "slot": "estimators", "hyperparameters": {"n_estimators": 60, "random_state": SEED}},
        {"driver": "logistic_regression", "slot": "final_estimator", "hyperparameters": {"max_iter": 400}},
    ],
}


def test_stacking_two_overlapping_families_does_not_beat_the_better_one() -> None:
    """The measured reason the Architect is right not to compose here.

    A stack is a bet that two families see different things. When one family already spans the
    other's structure, the meta-learner has nothing to arbitrate and the composition costs
    explainability for no gain. Asserted as a near-tie rather than an inequality, because the point
    is that the stack neither helps NOR hurts — it is simply not the answer to this problem.
    """
    linear = _train(None, "logistic_regression", {"max_iter": 400})
    forest = _train(None, "random_forest", {"n_estimators": 60, "random_state": SEED})
    stacked = _train(STACK, "stacking")

    print(
        f"\n  holdout AUC — linear {linear['auc']:.4f} · forest {forest['auc']:.4f} · stack {stacked['auc']:.4f}"
    )

    # The forest genuinely reads this structure; the linear model genuinely cannot.
    assert forest["auc"] > 0.8, "a forest should read a pure XOR easily"
    assert linear["auc"] < 0.6, "a linear model cannot express a symmetric XOR — it has no marginal effect to use"

    # And the stack buys nothing over the family that already saw everything.
    assert stacked["auc"] <= forest["auc"] + 0.01, (
        "stacking a family onto one that already spans the structure should not beat it — if this "
        "starts failing, the model pool has gained genuinely complementary families and the "
        "Architect's compose guidance should be revisited"
    )


def test_the_two_families_are_genuinely_different_here() -> None:
    """The premise behind the stack: they disagree, and each sees something the other does not.

    If both families scored the same, stacking them would be ceremony — a meta-learner combining two
    views of the same thing. This is what makes the composition a real answer rather than a habit.
    """
    linear = _train(None, "logistic_regression", {"max_iter": 400})
    forest = _train(None, "random_forest", {"n_estimators": 60, "random_state": SEED})

    assert abs(linear["auc"] - forest["auc"]) > 0.2, (
        "the families should read this data very differently — which is what makes the stack's "
        "failure to improve on the better one the interesting result rather than a null one"
    )
