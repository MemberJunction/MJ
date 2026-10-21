// binomial.ts — exact binomial tail sums via log-gamma (Lanczos, g = 7), accurate to ~1e-13 here.
export class Binomial {
  private static readonly lanczosC0 = 0.99999999999980993;
  private static readonly lanczosTail: readonly number[] = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

  /** ln Γ(x) (Lanczos approximation; reflection below 0.5). */
  public static LogGamma(x: number): number {
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - Binomial.LogGamma(1 - x);
    const xm1 = x - 1;
    let a = Binomial.lanczosC0;
    Binomial.lanczosTail.forEach((c, i) => { a += c / (xm1 + i + 1); });
    const t = xm1 + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (xm1 + 0.5) * Math.log(t) - t + Math.log(a);
  }

  /** P(X = k) for X ~ Binomial(n, p). */
  public static Pmf(n: number, p: number, k: number): number {
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(Binomial.LogGamma(n + 1) - Binomial.LogGamma(k + 1) - Binomial.LogGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }

  /** P(lo ≤ X ≤ hi) for X ~ Binomial(n, p). */
  public static RangeProbability(n: number, p: number, lo: number, hi: number): number {
    let total = 0;
    for (let k = Math.max(0, lo); k <= Math.min(n, hi); k++) total += Binomial.Pmf(n, p, k);
    return total;
  }
}
