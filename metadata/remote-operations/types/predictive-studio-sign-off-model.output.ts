/**
 * Output of `PredictiveStudio.SignOffModel`: the recorded sign-off (`MJ: ML Model Publish Records`, Kind `sign-off`) and
 * the SHA-256 of the evidence it was made over. A `Success: true` result always carries both fields. A refused sign-off
 * carries no output: it arrives as the operation's `ResultCode` (`NOT_HUMAN`, `INVALID_INPUT`, `OVERRIDES_WITHOUT_REASON`,
 * `MODEL_ARCHIVED`) with `Success: false` and the reason in `ErrorMessage`, and writes no row.
 */
export interface PredictiveStudioSignOffModelOutput {
    /** Id of the recorded sign-off; pass it as `signOffId` to `PredictiveStudio.PromoteModel`. */
    signOffRecordId: string;
    /** The `EvidenceSha256` the sign-off recorded. */
    evidenceSha256: string;
}
