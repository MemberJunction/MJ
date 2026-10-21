"""Ruling Q8: the S6.5 noise-publish rule at n = 400 seeds (stdlib only).

Rule: run n = 400 pure-noise seeds (N1c, N1r or W2-noise); count the seeds whose pipeline publishes (the gate returns
outcome `model`). Pass if the lower bound of the two-sided 95% Wilson interval on the publish rate x/n is <= 0.05,
i.e. the data do not show, one-sidedly at 2.5%, that the rate exceeds 5%. The script finds the largest accepted x
and the exact binomial pass probability at true publish rates 0.05 and 0.10 (the ledger line: "use 400 seeds
(0.969 / 0.023)").
"""
from __future__ import annotations

import math

N = 400
LIMIT = 0.05
Z = 1.959963984540054


def wilson(x: int, n: int, z: float = Z) -> tuple[float, float]:
    phat = x / n
    den = 1.0 + z * z / n
    centre = (phat + z * z / (2 * n)) / den
    half = z * math.sqrt(phat * (1.0 - phat) / n + z * z / (4 * n * n)) / den
    return centre - half, centre + half


def binom_pmf(x: int, n: int, p: float) -> float:
    return math.comb(n, x) * p**x * (1.0 - p) ** (n - x)


def accept_max(n: int = N, limit: float = LIMIT) -> int:
    return max(x for x in range(n + 1) if wilson(x, n)[0] <= limit)


def max_accepted_publications(n: int = N, limit: float = LIMIT) -> int:
    return accept_max(n, limit)


def p_pass(q: float, n: int = N, limit: float = LIMIT) -> float:
    k = accept_max(n, limit)
    return sum(binom_pmf(x, n, q) for x in range(k + 1))


def main() -> None:
    k = accept_max()
    lo_k, hi_k = wilson(k, N)
    lo_k1, hi_k1 = wilson(k + 1, N)
    print(f"S6.5 rule (Ruling Q8): n = {N} seeds, pass if the 95% Wilson lower bound on the publish rate <= {LIMIT}")
    print(f"  accept <= {k} publications of {N}")
    print(f"  x = {k}: Wilson [{lo_k:.5f}, {hi_k:.5f}] (lower <= {LIMIT}, accepted)")
    print(f"  x = {k + 1}: Wilson [{lo_k1:.5f}, {hi_k1:.5f}] (lower > {LIMIT}, refused)")
    for q in (0.05, 0.10, 0.20, 0.50):
        print(f"  true publish rate {q:.2f}: P(pass) = {p_pass(q):.3f}")
    for n in (200, 400):
        print(f"  cross-check n = {n}: accept <= {accept_max(n)}; P(pass | 0.05) = {p_pass(0.05, n):.3f}; "
              f"P(pass | 0.10) = {p_pass(0.10, n):.3f}")


if __name__ == "__main__":
    main()
