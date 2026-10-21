/**
 * @module causal-copy
 *
 * Phrases Predictive Studio must not show people: attributions are "drivers" (associations), never levers or causes
 * (criterion S9.3, findings F-UI-1, F-UI-2). One list, used by the copy-scan unit test and the truth-suite story scan.
 */

/** One forbidden phrase: a short label (reported) and the pattern that finds it. */
export interface CausalCopyPattern {
  Label: string;
  Pattern: RegExp;
}

/** The one list of causal or "lever" phrases, and the scan over it. */
export class CausalCopy {
  public static readonly Patterns: ReadonlyArray<CausalCopyPattern> = [
    { Label: 'lever', Pattern: /\blevers?\b/i },
    { Label: 'what drives', Pattern: /\bwhat drives\b/i },
    { Label: 'drives the outcome', Pattern: /\bdrives? the outcome\b/i },
    { Label: "what's driving", Pattern: /\bwhat(?:'|’)?s driving\b/i },
    { Label: 'explains about', Pattern: /\bexplains about\b/i },
    { Label: 'decision drivers', Pattern: /\bdecision drivers\b/i },
    { Label: 'influential', Pattern: /\binfluential\b/i },
    { Label: 'honest holdout evaluation', Pattern: /\bhonest holdout evaluation\b/i },
  ];

  /** The labels of every forbidden phrase found in `text`, in list order; empty when the text is clean. */
  public static FindPhrases(text: string): string[] {
    return CausalCopy.Patterns.filter((p) => p.Pattern.test(text)).map((p) => p.Label);
  }
}
