"""P11 fix round 3 (Ruling Q24, N5): monitor procedure M, its calibration on no-drift replays, and D2's power.

Monitor procedure M (both S8.3 gates use it):
  - Reference window: the model's training window. Looks: one per monitored period, L looks in the horizon.
  - At each look, each monitored input gets a statistic z (look-period mean minus reference mean, over its SE;
    two-proportion form for a binary input; for a single series the look value minus the reference mean, over the
    reference SD) and a two-sided p-value taken from z's distribution on no-drift replays of the design at that look
    (empirical p = (1 + #{|z_null| >= |z|}) / (1 + N_null)).
  - Benjamini-Hochberg across the look's inputs at level q(L); an alarm is any rejection at any look.
  - q(L) is the largest level with P(any alarm over the L looks) <= 0.05 on no-drift replays: calibrated here by
    bisection on one replay set and checked on a fresh one. Replays: an AR(1)-preserving series for T4 (the planted
    phi 0.9, sigma 2.0, stationary start, 228 reference months, L = 12 monthly looks, 1 input: the lagged series
    value) and the D1c cross-section design for D2 (3 inputs, periods 0-2 as reference, L = 3 looks at periods 3-5).
"""
from __future__ import annotations

import math
from collections.abc import Callable

import numpy as np
import numpy.typing as npt
from scipy import stats

Arr = npt.NDArray[np.float64]
BoolArr = npt.NDArray[np.bool_]
Q12: float = 0.0095
Q3: float = 0.0171
DELTA = 0.1
N_PER = 4000
N_REF = 3 * N_PER
P_AUTO = 0.35
ALPHA_ANY = 0.05
N_NULL = 100000     # replays that give each look's null distribution of z
N_CAL = 100000      # replays that calibrate q(L)
N_CHECK = 100000    # fresh replays that check the calibrated q(L)
N_POWER = 20000     # D2 seeds for power and FDP
N_SEEDS = 400
Z = 1.959963984540054
T4_N, T4_REF, T4_L, T4_PHI, T4_SIGMA, T4_LEVEL = 240, 228, 12, 0.9, 2.0, 100.0


def wilson(x: int, n: int) -> tuple[float, float]:
    phat = x / n; den = 1.0 + Z * Z / n
    centre = (phat + Z * Z / (2 * n)) / den
    half = Z * math.sqrt(phat * (1.0 - phat) / n + Z * Z / (4 * n * n)) / den
    return centre - half, centre + half


def binom_cdf_ge(k: int, n: int, p: float) -> float:
    return float(stats.binom.sf(k - 1, n, p))


def bh_reject(p: Arr, q: float) -> BoolArr:
    """p: (sims, m). Returns a boolean (sims, m) BH rejection mask."""
    m = p.shape[1]
    order = np.argsort(p, axis=1)
    ps = np.take_along_axis(p, order, axis=1)
    thresh = q * np.arange(1, m + 1) / m
    ok = ps <= thresh
    kmax = np.where(ok.any(axis=1), m - np.argmax(ok[:, ::-1], axis=1), 0)
    rej_sorted = np.arange(m)[None, :] < kmax[:, None]
    rej: BoolArr = np.zeros_like(rej_sorted)
    np.put_along_axis(rej, order, rej_sorted, axis=1)
    return rej


def empirical_p(z: Arr, z_null: Arr) -> Arr:
    """z: (sims, L, m); z_null: (N_NULL, L, m). Two-sided empirical p per look and input."""
    out = np.empty_like(z)
    for li in range(z.shape[1]):
        for j in range(z.shape[2]):
            srt = np.sort(np.abs(z_null[:, li, j]))
            ge = len(srt) - np.searchsorted(srt, np.abs(z[:, li, j]), side="left")
            out[:, li, j] = (1 + ge) / (1 + len(srt))
    return out


def any_alarm(p: Arr, q: float) -> BoolArr:
    """p: (sims, L, m). BH across inputs at each look; any rejection at any look."""
    hit: BoolArr = np.zeros(p.shape[0], dtype=bool)
    for li in range(p.shape[1]):
        hit |= bh_reject(p[:, li, :], q).any(axis=1)
    return hit


def calibrate(p_cal: Arr) -> float:
    lo, hi = 0.0, ALPHA_ANY
    for _ in range(40):
        mid = (lo + hi) / 2
        if any_alarm(p_cal, mid).mean() <= ALPHA_ANY:
            lo = mid
        else:
            hi = mid
    return lo


def t4_z(rng: np.random.Generator, n: int) -> Arr:
    e = rng.normal(0, T4_SIGMA / math.sqrt(1 - T4_PHI ** 2), n); ys = np.empty((n, T4_N))
    for t in range(T4_N):
        if t > 0:
            e = T4_PHI * e + rng.normal(0, T4_SIGMA, n)
        ys[:, t] = T4_LEVEL + e
    ref = ys[:, : T4_REF - 1]
    mu, sd = ref.mean(axis=1), ref.std(axis=1, ddof=1)
    looks = ys[:, T4_REF - 1 : T4_REF - 1 + T4_L]
    z: Arr = ((looks - mu[:, None]) / sd[:, None])[:, :, None]
    return z


def xs_z(rng: np.random.Generator, n: int, delta: float) -> Arr:
    se = math.sqrt(1 / N_PER + 1 / N_REF)
    ref_e = rng.normal(0, 1 / math.sqrt(N_REF), n); ref_t = rng.normal(0, 1 / math.sqrt(N_REF), n)
    ref_a = rng.binomial(N_REF, P_AUTO, n) / N_REF
    z = np.empty((n, 3, 3))
    for li in range(3):
        e = rng.normal(delta, 1 / math.sqrt(N_PER), n); t = rng.normal(0, 1 / math.sqrt(N_PER), n)
        a = rng.binomial(N_PER, P_AUTO, n) / N_PER
        pool = (a * N_PER + ref_a * N_REF) / (N_PER + N_REF)
        z[:, li, 0] = (e - ref_e) / se; z[:, li, 1] = (t - ref_t) / se
        z[:, li, 2] = (a - ref_a) / np.sqrt(pool * (1 - pool) * (1 / N_PER + 1 / N_REF))
    return z


def design(name: str, gen: Callable[[int], Arr]) -> tuple[float, Arr]:
    z_null = gen(N_NULL)
    q = calibrate(empirical_p(gen(N_CAL), z_null))
    rate = float(any_alarm(empirical_p(gen(N_CHECK), z_null), q).mean())
    se = math.sqrt(rate * (1 - rate) / N_CHECK)
    L, m = z_null.shape[1], z_null.shape[2]
    print(f"{name}: L = {L} looks, m = {m} input(s); calibrated q({L}) = {q:.5f}; fresh no-drift replays "
          f"({N_CHECK}): P(any alarm) = {rate:.4f} (SE {se:.4f}); Sidak-independent value would be "
          f"{1 - (1 - ALPHA_ANY) ** (1 / L):.5f}; the 400-replay rule (<= 28 of 400 with any alarm) passes with "
          f"P = {float(stats.binom.cdf(28, N_SEEDS, rate)):.3f} at this rate")
    return q, z_null
