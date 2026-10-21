"""S-T.5 and S6.5 test design: exact pass probabilities for seed-count checks (stdlib only).

Old rule (P1 initial): pass if observed coverage >= 90% over 20 seeds.
New rule (fix round 1): run n seeds; pass if the 95% Wilson interval on the observed coverage x/n contains 0.95.
S6.5 (pure-noise false-publish rate): old rule "no model in >= 19 of 20 seeds"; new rule: run 200 seeds and
pass if the lower bound of the 95% Wilson interval on the publish rate is <= 0.05.
Each probability below is an exact binomial sum over x = 0..n.
"""
from __future__ import annotations

import math


def binom_pmf(x: int, n: int, p: float) -> float:
    return math.comb(n, x) * p**x * (1.0 - p) ** (n - x)


def wilson(x: int, n: int, z: float = 1.959963984540054) -> tuple[float, float]:
    phat = x / n
    den = 1.0 + z * z / n
    centre = (phat + z * z / (2 * n)) / den
    half = z * math.sqrt(phat * (1.0 - phat) / n + z * z / (4 * n * n)) / den
    return centre - half, centre + half


def p_pass_old(p: float, n: int = 20, threshold: float = 0.90) -> float:
    k = math.ceil(threshold * n)
    return sum(binom_pmf(x, n, p) for x in range(k, n + 1))


def p_pass_new(p: float, n: int, target: float = 0.95) -> float:
    total = 0.0
    for x in range(n + 1):
        lo, hi = wilson(x, n)
        if lo <= target <= hi:
            total += binom_pmf(x, n, p)
    return total


def accepted_range(n: int, target: float = 0.95) -> tuple[int, int]:
    xs = [x for x in range(n + 1) if wilson(x, n)[0] <= target <= wilson(x, n)[1]]
    return min(xs), max(xs)


def p_pass_noise_new(q: float, n: int = 200, limit: float = 0.05) -> float:
    return sum(binom_pmf(x, n, q) for x in range(n + 1) if wilson(x, n)[0] <= limit)


def p_pass_noise_old(q: float, n: int = 20) -> float:
    return sum(binom_pmf(x, n, q) for x in range(0, 2))


def main() -> None:
    trues = [0.95, 0.93, 0.90, 0.85, 0.80]
    print("Old rule: >= 18 of 20 seeds covered")
    for p in trues:
        print(f"  true coverage {p:.2f}: P(pass) = {p_pass_old(p):.3f}")
    for n in (200, 400):
        lo, hi = accepted_range(n)
        print(f"New rule: n = {n} seeds, pass if 95% Wilson interval on x/n contains 0.95 "
              f"(accepts x in [{lo}, {hi}], i.e. {lo / n:.3f}-{hi / n:.3f})")
        for p in trues:
            print(f"  true coverage {p:.2f}: P(pass) = {p_pass_new(p, n):.3f}")
    xmax = max(x for x in range(201) if wilson(x, 200)[0] <= 0.05)
    print("S6.5 old rule: publishes in <= 1 of 20 noise seeds")
    for q in (0.05, 0.10, 0.20, 0.50):
        print(f"  true publish rate {q:.2f}: P(pass) = {p_pass_noise_old(q):.3f}")
    print(f"S6.5 new rule: 200 seeds, pass if Wilson lower bound on publish rate <= 0.05 (accepts <= {xmax} publications)")
    for q in (0.05, 0.10, 0.20, 0.50):
        print(f"  true publish rate {q:.2f}: P(pass) = {p_pass_noise_new(q):.3f}")


if __name__ == "__main__":
    main()
