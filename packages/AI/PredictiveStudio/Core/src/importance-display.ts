/**
 * @module importance-display
 *
 * Which stored feature importances may be shown to people as a global "drivers" list. Linear models store
 * |coefficient|, which is comparable across features; tree models store split or impurity counts, which favour noisy
 * continuous and many-valued columns, so those lists stay hidden until held-out permutation importance exists. The
 * sidecar reports which kind it produced and training stores it in the model's evaluation lineage.
 */
import { EvaluationLineage } from './evaluation-record';

/** Which global feature-importance lists people may see. */
export class ImportanceDisplay {
  /** Plain note shown where a hidden global list used to be. */
  public static readonly HiddenNote =
    "This model's feature weights are the algorithm's own split or impurity counts, which favour noisy and many-valued " +
    'columns, so they are hidden until held-out importance is available.';

  /** Whether a model's global importance list may be shown, from its stored Lineage. Unknown kinds are hidden (fail closed). */
  public static GlobalDriversShowable(lineageJSON: string | null | undefined): boolean {
    return EvaluationLineage.Read(lineageJSON || null)?.ImportanceKind === 'coefficient';
  }
}
