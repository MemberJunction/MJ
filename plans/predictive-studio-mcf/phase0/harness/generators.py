"""
Phase-0 seeded planted-truth generators.

Every generator returns a GenResult carrying the data AND the ground truth that
was planted into it, so experiments assert RECOVERY of known structure rather
than "it ran". Determinism: a required integer seed drives one numpy Generator;
no wall-clock, no global RNG. These are deliberately throwaway-grade (NOT the
production TestBench) — small, legible, single-file.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
import numpy as np
import pandas as pd

EPOCH = np.datetime64("2020-01-01")  # fixed origin; no real "now" anywhere


@dataclass
class GenResult:
    X: pd.DataFrame
    y: np.ndarray
    truth: dict[str, Any]
    meta: dict[str, Any] = field(default_factory=dict)


def _rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


# ─────────────────────────────────────────────────────────────────────────────
# Classification with planted logits (V1 base, V5, V6)
# ─────────────────────────────────────────────────────────────────────────────
def gen_classification(seed: int, n: int = 4000, p: int = 8, informative: int = 4,
                       noise: float = 1.0, class_sep: float = 1.0) -> GenResult:
    g = _rng(seed)
    X = g.standard_normal((n, p))
    coef = np.zeros(p)
    coef[:informative] = g.uniform(0.6, 1.6, size=informative) * g.choice([-1, 1], size=informative)
    logits = (X @ coef) * class_sep + g.normal(0, noise, size=n)
    proba = _sigmoid(logits)
    y = (g.uniform(size=n) < proba).astype(int)
    cols = [f"f{i}" for i in range(p)]
    df = pd.DataFrame(X, columns=cols)
    return GenResult(df, y, {
        "coef": coef.tolist(), "informative_cols": cols[:informative],
        "true_proba": proba, "bayes_auc_hint": None,
    }, {"generator": "classification", "seed": seed, "n": n, "p": p})


def gen_pure_noise(seed: int, n: int = 3000, p: int = 20) -> GenResult:
    """No signal at all — target independent of every feature (V5 honesty test)."""
    g = _rng(seed)
    X = g.standard_normal((n, p))
    y = g.integers(0, 2, size=n)  # coin flip, independent of X
    df = pd.DataFrame(X, columns=[f"f{i}" for i in range(p)])
    return GenResult(df, y, {"signal": False, "true_auc": 0.5},
                     {"generator": "pure_noise", "seed": seed, "n": n, "p": p})


def gen_weak_signal(seed: int, n: int = 3000, p: int = 20, informative: int = 2,
                    noise: float = 3.0) -> GenResult:
    """A faint real signal buried in noise (V5 — separates skill from luck)."""
    return gen_classification(seed, n=n, p=p, informative=informative,
                              noise=noise, class_sep=0.6)


# ─────────────────────────────────────────────────────────────────────────────
# Regression with planted coefficients (V2 realistic arm)
# ─────────────────────────────────────────────────────────────────────────────
def gen_regression(seed: int, n: int = 4000, p: int = 10, informative: int = 5,
                   noise: float = 1.0) -> GenResult:
    g = _rng(seed)
    X = g.standard_normal((n, p))
    coef = np.zeros(p)
    coef[:informative] = g.uniform(1.0, 3.0, size=informative) * g.choice([-1, 1], size=informative)
    y = X @ coef + g.normal(0, noise, size=n)
    df = pd.DataFrame(X, columns=[f"f{i}" for i in range(p)])
    return GenResult(df, y, {"coef": coef.tolist()},
                     {"generator": "regression", "seed": seed, "n": n, "p": p})


# ─────────────────────────────────────────────────────────────────────────────
# HMM-regime driven target (V2 — the sequence-state component bet)
#   Each entity has a hidden state sequence; the LABEL depends on the state
#   mix, but the raw per-row features do NOT expose the state directly. A model
#   that recovers the state should lift a GBT that only sees raw features.
# ─────────────────────────────────────────────────────────────────────────────
def gen_hmm_regime(seed: int, n_entities: int = 3000, seq_len: int = 12,
                   n_states: int = 3) -> GenResult:
    g = _rng(seed)
    # planted transition + emission (Gaussian means per state on a 2-d obs)
    trans = np.array([[0.80, 0.15, 0.05],
                      [0.10, 0.80, 0.10],
                      [0.05, 0.15, 0.80]])
    emis_mean = np.array([[0.0, 0.0], [2.5, 0.0], [0.0, 2.5]])
    # label driven by fraction of time spent in state 2 ("dormant") near the end
    rows, obs_seqs, labels, ent_ids = [], [], [], []
    for e in range(n_entities):
        s = g.integers(0, n_states)
        states = []
        obs = []
        for t in range(seq_len):
            states.append(s)
            o = emis_mean[s] + g.normal(0, 0.7, size=2)
            obs.append(o)
            s = g.choice(n_states, p=trans[s])
        states = np.array(states)
        obs = np.array(obs)
        # planted signal: high share of state-2 in the LAST third → positive label
        late = states[-seq_len // 3:]
        share_dormant = np.mean(late == 2)
        p_pos = _sigmoid((share_dormant - 0.4) * 6.0)
        label = int(g.uniform() < p_pos)
        # raw tabular features a GBT sees: summary stats of obs (NOT the states)
        rows.append({
            "obs0_mean": obs[:, 0].mean(), "obs1_mean": obs[:, 1].mean(),
            "obs0_std": obs[:, 0].std(), "obs1_std": obs[:, 1].std(),
            "obs0_last": obs[-1, 0], "obs1_last": obs[-1, 1],
        })
        obs_seqs.append(obs)
        labels.append(label)
        ent_ids.append(e)
    df = pd.DataFrame(rows)
    return GenResult(df, np.array(labels), {
        "transition": trans.tolist(), "emission_mean": emis_mean.tolist(),
        "n_states": n_states, "obs_sequences": obs_seqs,  # for the HMM feature extractor
        "signal": "share of hidden state-2 in final third",
    }, {"generator": "hmm_regime", "seed": seed, "n": n_entities, "seq_len": seq_len})


# ─────────────────────────────────────────────────────────────────────────────
# Cluster-heterogeneous relationships (V2 — the cluster-then-classify bet)
#   Within each latent cluster the feature→label relationship has a DIFFERENT
#   sign. A global GBT struggles; knowing the cluster id resolves it.
# ─────────────────────────────────────────────────────────────────────────────
def gen_cluster_heterogeneous(seed: int, n: int = 4000, k: int = 3, p: int = 6,
                              center_spread: float = 2.0, noise: float = 1.6) -> GenResult:
    # center_spread/noise chosen so clusters OVERLAP: the GBT cannot trivially
    # recover cluster identity from the features, so an explicit cluster-id is a
    # genuine test (well-separated clusters would let the GBT reconstruct it free).
    g = _rng(seed)
    centers = g.uniform(-center_spread, center_spread, size=(k, p))
    assign = g.integers(0, k, size=n)
    X = centers[assign] + g.normal(0, noise, size=(n, p))
    # per-cluster coefficient with FLIPPED sign across clusters on f0
    signs = np.array([1.0, -1.0, 1.0])[:k]
    logits = np.zeros(n)
    for c in range(k):
        m = assign == c
        # strong sign-flipped effect: knowing the cluster is decisive for the label,
        # but the clusters overlap so the GBT can't recover the cluster for free
        logits[m] = signs[c] * X[m, 0] * 3.0
    proba = _sigmoid(logits)
    y = (g.uniform(size=n) < proba).astype(int)
    df = pd.DataFrame(X, columns=[f"f{i}" for i in range(p)])
    return GenResult(df, y, {
        "centers": centers.tolist(), "cluster_assign": assign, "k": k,
        "signal": "feature→label sign flips per latent cluster",
    }, {"generator": "cluster_heterogeneous", "seed": seed, "n": n, "k": k})


# ─────────────────────────────────────────────────────────────────────────────
# Event-log with planted post-decision leakage (V7 — the Featuretools grave)
#   Each entity has dated events before AND after a decision date. A naive
#   aggregate over ALL events leaks the future; an as-of aggregate (events <=
#   decision date) does not.
# ─────────────────────────────────────────────────────────────────────────────
def gen_event_log(seed: int, n_entities: int = 3000, horizon_days: int = 365) -> GenResult:
    g = _rng(seed)
    ent_rows, all_events = [], []
    labels = []
    for e in range(n_entities):
        decision_day = int(g.integers(120, 240))
        base_rate = g.uniform(0.2, 2.0)  # honest pre-decision signal
        pre_count = g.poisson(base_rate * decision_day / 30.0)
        # label depends on the TRUE pre-decision engagement rate (honest signal)
        p_pos = _sigmoid((base_rate - 1.0) * 1.5)
        label = int(g.uniform() < p_pos)
        # POST-decision events: members who churned (label=0) stop; leak if counted
        post_rate = base_rate if label == 1 else base_rate * 0.1
        post_count = g.poisson(post_rate * (horizon_days - decision_day) / 30.0)
        # emit dated events
        for _ in range(pre_count):
            day = int(g.integers(0, decision_day + 1))
            all_events.append({"entity": e, "day": day, "amount": g.uniform(1, 5)})
        for _ in range(post_count):
            day = int(g.integers(decision_day + 1, horizon_days + 1))
            all_events.append({"entity": e, "day": day, "amount": g.uniform(1, 5)})
        ent_rows.append({"entity": e, "decision_day": decision_day, "tenure_days": decision_day})
        labels.append(label)
    entities = pd.DataFrame(ent_rows)
    events = pd.DataFrame(all_events)
    return GenResult(entities, np.array(labels), {
        "events": events, "signal": "true pre-decision event rate",
        "leak": "post-decision event count correlates with the label",
    }, {"generator": "event_log", "seed": seed, "n": n_entities})


# ─────────────────────────────────────────────────────────────────────────────
# Survival with planted hazards + censoring (V3 — task-coverage bet)
# ─────────────────────────────────────────────────────────────────────────────
def gen_survival(seed: int, n: int = 3000, p: int = 5, censor_rate: float = 0.35,
                 horizon: float = 365.0) -> GenResult:
    g = _rng(seed)
    X = g.standard_normal((n, p))
    beta = np.array([0.9, -0.6, 0.4, 0.0, 0.0])[:p]
    # Cox-style: hazard scales with exp(Xβ); draw event times from exponential
    linpred = X @ beta
    scale = np.exp(-linpred)  # higher risk → shorter time
    true_time = g.exponential(scale * 200.0)
    # administrative + random censoring to hit ~censor_rate
    cens_time = g.uniform(0, horizon * (1.0 / max(censor_rate, 1e-3)), size=n)
    observed_time = np.minimum(true_time, cens_time)
    event = (true_time <= cens_time).astype(int)
    cols = [f"x{i}" for i in range(p)]
    df = pd.DataFrame(X, columns=cols)
    df["duration"] = observed_time
    df["event"] = event
    return GenResult(df, true_time, {
        "beta": beta.tolist(), "true_time": true_time,
        "censor_frac": float(1 - event.mean()),
    }, {"generator": "survival", "seed": seed, "n": n, "p": p})
