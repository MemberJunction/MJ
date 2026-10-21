# tests/test_scoring.py — P5 scoring primitives (brief tests first, then extra checks against sklearn/statsmodels).
from __future__ import annotations
import numpy as np
from truthsuite.refpipe.scoring import bootstrap_ci, log_loss_score, durbin_watson

def test_bootstrap_ci_contains_point() -> None:
    rng = np.random.default_rng(0); y = rng.integers(0, 2, 500); p = np.clip(rng.random(500), 0.01, 0.99)
    lo, hi = bootstrap_ci(y, p, log_loss_score, n=200, seed=0)
    assert lo <= log_loss_score(y, p) <= hi

def test_durbin_watson_white_noise_near_2() -> None:
    rng = np.random.default_rng(1)
    assert 1.8 < durbin_watson(rng.normal(size=2000)) < 2.2


def test_deviances_match_sklearn() -> None:
    from sklearn.metrics import mean_poisson_deviance, mean_tweedie_deviance, log_loss
    from truthsuite.refpipe.scoring import poisson_deviance, tweedie_deviance
    rng = np.random.default_rng(2)
    y = rng.poisson(2.0, 400).astype(float); mu = rng.uniform(0.5, 4.0, 400)
    assert abs(poisson_deviance(y, mu) - mean_poisson_deviance(y, mu)) < 1e-9
    assert abs(tweedie_deviance(y, mu) - mean_tweedie_deviance(y, mu, power=1.5)) < 1e-9
    yb = rng.integers(0, 2, 400); p = rng.uniform(0.05, 0.95, 400)
    assert abs(log_loss_score(yb, p) - log_loss(yb, p)) < 1e-9
    P = rng.dirichlet([1, 1, 1], 400); yc = rng.integers(0, 3, 400)
    assert abs(log_loss_score(yc, P) - log_loss(yc, P, labels=[0, 1, 2])) < 1e-9


def test_calibration_of_true_probabilities() -> None:
    from truthsuite.refpipe.scoring import calibration
    rng = np.random.default_rng(3)
    p = 1 / (1 + np.exp(-rng.normal(0, 1.5, 20000))); y = (rng.random(20000) < p).astype(int)
    c = calibration(y, p)
    assert abs(c["slope"] - 1) < 0.08 and abs(c["citl"]) < 0.05 and abs(c["intercept"]) < 0.05


def test_effective_n_and_acf1() -> None:
    from truthsuite.refpipe.scoring import acf1, effective_n
    assert effective_n(100, 0.0) == 100
    assert abs(effective_n(100, 0.5) - 100 / 3) < 1e-12
    rng = np.random.default_rng(4); e = np.zeros(5000)
    for t in range(1, 5000):
        e[t] = 0.7 * e[t - 1] + rng.normal()
    assert 0.65 < acf1(e) < 0.75


def test_paired_bootstrap_detects_known_difference() -> None:
    from truthsuite.refpipe.scoring import paired_bootstrap, rmse
    rng = np.random.default_rng(5); y = rng.normal(size=1000)
    good = y + rng.normal(0, 0.5, 1000); bad = y + rng.normal(0, 1.5, 1000)
    d, lo, hi = paired_bootstrap(y, bad, good, rmse, n=300, seed=0)  # (baseline - model) loss
    assert d > 0 and lo > 0
    d2, lo2, hi2 = paired_bootstrap(y, good, good, rmse, n=300, seed=0)
    assert d2 == 0 and lo2 <= 0 <= hi2


def test_mase_uses_training_window_scale_only() -> None:
    from truthsuite.refpipe.scoring import mase_scale
    train = np.arange(30, dtype=float)  # seasonal (m=12) differences are all 12
    assert mase_scale(train, m=12) == 12.0


def test_ljung_box_matches_statsmodels() -> None:
    from statsmodels.stats.diagnostic import acorr_ljungbox
    from truthsuite.refpipe.scoring import ljung_box
    rng = np.random.default_rng(6); e = rng.normal(size=300)
    q, p = ljung_box(e, lags=10)
    ref = acorr_ljungbox(e, lags=[10])
    assert abs(q - float(ref["lb_stat"].iloc[0])) < 1e-8 and abs(p - float(ref["lb_pvalue"].iloc[0])) < 1e-8


def test_q14_shipped_baseline_choice_synthetic() -> None:
    """Ruling Q14 on a small synthetic case (RMSE, 400 rows): the simple set is {A, B}; B scores best, A is worse."""
    from truthsuite.refpipe.run import q13_gate
    from truthsuite.refpipe.scoring import rmse
    rng = np.random.default_rng(7); n = 400
    y = rng.normal(0, 1, n)
    dummy = np.zeros(n)
    a = 0.3 * y                       # A: a shrunken signal, beats the dummy, worse than B
    b = 0.8 * y                       # B: best-scoring simple member, beats the dummy
    weak = y + rng.normal(0, 2.0, n)  # a member that is worse than the dummy
    names = {"dummy": "dummy"}
    # (b): the model does not beat the best member (B) -> ship the best-scoring member that beats the dummy: B
    g = q13_gate(y, rmse, 0.8 * y, dummy, [("A", a), ("B", b)], names, None, 0, None, "M")
    assert g["outcome"] == "keep-simple-baseline" and g["shipped"] == "B"
    # only A beats the dummy (W is worse than the dummy) -> ship A
    g2 = q13_gate(y, rmse, weak, dummy, [("A", a), ("W", weak)], names, None, 0, None, "M")
    assert g2["outcome"] == "keep-simple-baseline" and g2["shipped"] == "A"
    # (a): the model beats the best simple member and the dummy
    g3 = q13_gate(y, rmse, y + rng.normal(0, 0.05, n), dummy, [("A", a), ("B", b)], names, None, 0, None, "M")
    assert g3["outcome"] == "model" and g3["shipped"] == "M" and g3["branch"] == "a:beats-best-simple"
    # (a) is impossible when the delivered model is itself a simple member
    g4 = q13_gate(y, rmse, b, dummy, [("A", a), ("B", b)], names, "B", 0, None, "M")
    assert g4["outcome"] == "keep-simple-baseline" and g4["shipped"] == "B"
    # (c): nothing beats the dummy
    g5 = q13_gate(y, rmse, weak, dummy, [("W1", weak), ("W2", y + rng.normal(0, 2.0, n))], names, None, 0, None, "M")
    assert g5["outcome"] == "no-signal" and g5["shipped"] is None


def test_q15_decision_table_enumerated() -> None:
    """Rulings Q13 + Q14 + Q15: every combination of the paired lower-bound tests maps to exactly one outcome.
    The predicates below restate the ruling text independently of gate_decision."""
    import itertools
    from truthsuite.refpipe.run import gate_decision
    seen: set[str] = set()
    for m_dummy, m_best, a_dummy, b_dummy, delivered, a_better in itertools.product(
            (False, True), (False, True), (False, True), (False, True), (None, "A", "B"), (False, True)):
        member = {"A": a_dummy, "B": b_dummy}
        scores = {"A": 1.0, "B": 2.0} if a_better else {"A": 2.0, "B": 1.0}
        any_member = a_dummy or b_dummy
        a1 = delivered is None and m_dummy and m_best             # (a) beats the dummy and the best simple member
        a2 = m_dummy and not any_member                           # (a) Q15: only the model carries signal
        b = any_member and not (a1 or a2)                         # (b) Q14
        c = not m_dummy and not any_member                        # (c)
        assert [a1 or a2, b, c].count(True) == 1, (m_dummy, m_best, member, delivered)
        outcome, branch, shipped = gate_decision(m_dummy, m_best, member, scores, delivered)
        seen.add(branch)
        want = "model" if (a1 or a2) else "keep-simple-baseline" if b else "no-signal"
        assert outcome == want, (m_dummy, m_best, member, delivered, outcome)
        if a1:
            assert branch == "a:beats-best-simple" and shipped is None
        elif a2:
            assert branch == "a:Q15-only-model-beats-dummy" and shipped is None
        elif b:
            elig = [k for k in ("A", "B") if member[k]]
            assert branch == "b:keep-simple-baseline" and shipped == min(elig, key=lambda k: scores[k])
        else:
            assert branch == "c:no-signal" and shipped is None
    assert seen == {"a:beats-best-simple", "a:Q15-only-model-beats-dummy", "b:keep-simple-baseline", "c:no-signal"}


def test_q15_gate_synthetic_paired_differences() -> None:
    """Every branch through q13_gate on synthetic arrays (RMSE, 400 rows), including Q15: only the model beats the dummy."""
    from truthsuite.refpipe.run import q13_gate
    from truthsuite.refpipe.scoring import rmse
    rng = np.random.default_rng(11); n = 400
    y = rng.normal(0, 1, n); dummy = np.zeros(n); names = {"dummy": "dummy"}
    w1 = y + rng.normal(0, 2.0, n); w2 = -0.5 * y          # both worse than the dummy
    t = y.copy(); t[:12] += 5.0                            # T4-like member: exact on most rows, large misses on 12
    a = 0.3 * y
    # Q15: the model (0.3 y) beats the dummy; T is not demonstrably better than the dummy, and the model does not
    # demonstrably beat T (the best simple member), so only the Q15 branch makes it (a)
    q15 = q13_gate(y, rmse, a, dummy, [("T", t), ("W2", w2)], names, None, 0, None, "M")
    c = q15["comparisons"]; assert isinstance(c, dict)
    assert c["modelVsDummy"]["ci"][0] > 0 and c["TVsDummy"]["ci"][0] <= 0 and c["W2VsDummy"]["ci"][0] <= 0
    assert q15["bestSimple"] == "T" and c["modelVs:T"]["ci"][0] <= 0
    assert q15["outcome"] == "model" and q15["branch"] == "a:Q15-only-model-beats-dummy"
    assert q15["shipped"] == "M" and q15["shippedRole"] == "model"
    assert q15["note"] == "no simple baseline carries demonstrable signal"
    assert "shippedBeatsDummy" not in q15
    a1 = q13_gate(y, rmse, y + rng.normal(0, 0.05, n), dummy, [("A", a), ("W1", w1)], names, None, 0, None, "M")
    assert a1["outcome"] == "model" and a1["branch"] == "a:beats-best-simple" and a1["shipped"] == "M" and a1["note"] is None
    b = q13_gate(y, rmse, a, dummy, [("A", a), ("W1", w1)], names, None, 0, None, "M")
    assert b["outcome"] == "keep-simple-baseline" and b["shipped"] == "A" and b["shippedRole"] == "simpleBaseline"
    c = q13_gate(y, rmse, w2, dummy, [("W1", w1), ("W2", w2)], names, None, 0, None, "M")
    assert c["outcome"] == "no-signal" and c["shipped"] is None and c["shippedRole"] is None
