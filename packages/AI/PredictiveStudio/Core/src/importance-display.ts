/**
 * @module importance-display
 *
 * Which stored feature importances may be shown to people as a global "drivers" list. The sidecar stores
 * `feature_importances_` for tree models (impurity for random forest, split counts for LightGBM, gain for XGBoost) and
 * |coefficient| for linear models (`Sidecar/src/python/app/main.py` `_extract_importance`). Split and impurity counts
 * favour noisy continuous and many-valued columns (findings F-SC-11, F-SC-9b), so those lists are hidden until
 * held-out permutation importance exists (held-out permutation importance is planned). Pure; no dependencies.
 */

/** Which global feature-importance lists people may see (decision D2-C4). */
export class ImportanceDisplay {
  /** Algorithm keys (normalised: lower case, letters and digits only) whose stored importance is a coefficient magnitude. */
  private static readonly coefficientAlgorithms: ReadonlySet<string> = new Set(['logisticregression', 'ridgeregression', 'ridge']);

  /** Plain note shown where a hidden global list used to be. */
  public static readonly HiddenNote =
    "This model's feature weights are the algorithm's own split or impurity counts, which favour noisy and many-valued " +
    'columns, so they are hidden until held-out importance is available.';

  /**
   * Whether a model's global feature-importance list may be shown, given its algorithm's display name
   * (`MJ: ML Models.Algorithm`, e.g. "Logistic Regression") or sidecar driver key (e.g. `logistic_regression`).
   * Unknown or missing algorithms are hidden (fail closed).
   */
  public static GlobalDriversShowable(algorithm: string | null | undefined): boolean {
    const key = (algorithm || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return ImportanceDisplay.coefficientAlgorithms.has(key);
  }
}
