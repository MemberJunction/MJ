/**
 * @module importance-display
 *
 * Which stored feature importances may be shown to people as a global "drivers" list. Held-out permutation
 * importance (the increase of the held-out loss when a source column is permuted) and |coefficient| are comparable
 * across features, so both are shown. Split or impurity counts, which models trained before held-out importance
 * existed still carry, favour noisy continuous and many-valued columns, so those lists stay hidden. The sidecar
 * reports which kind it produced and training stores it in the model's evaluation lineage.
 */
import { EvaluationLineage } from './evaluation-record';

/** Which global feature-importance lists people may see. */
export class ImportanceDisplay {
  /** Plain note shown where a hidden global list used to be. */
  public static readonly HiddenNote =
    "This model's feature weights are the algorithm's own split or impurity counts, which favour noisy and many-valued " +
    'columns, so they are hidden. A retrained model reports held-out importance when it has held-out rows to measure it on.';

  /** Whether a model's global importance list may be shown, from its stored Lineage. Unknown kinds are hidden (fail closed). */
  public static GlobalDriversShowable(lineageJSON: string | null | undefined): boolean {
    const kind = EvaluationLineage.Read(lineageJSON || null)?.ImportanceKind;
    return kind === 'coefficient' || kind === 'held_out_permutation';
  }
}
