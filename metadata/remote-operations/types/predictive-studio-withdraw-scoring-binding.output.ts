/**
 * Output of `PredictiveStudio.WithdrawScoringBinding`: what withdrawal did to the binding's column copies. The binding is
 * `Withdrawn` whenever the operation succeeds; a failure arrives as `Success: false` with the reason in `ErrorMessage`
 * and changes nothing.
 */
export interface PredictiveStudioWithdrawScoringBindingOutput {
    /** Records whose target column held the value the binding copied, now cleared. */
    cleared: number;
    /** Records whose target column holds a value a person entered since, kept. */
    keptHuman: number;
}
