/**
 * The evidence of an ML Model as the server builds it from stored rows: what a sign-off approver is shown and what a
 * publish freezes on its `MJ: ML Model Publish Records` row (`Evidence`).
 *
 * **Lockstep contract**: `PredictiveStudioEvidenceSnapshot` equals `EvidenceSnapshot` in
 * `@memberjunction/predictive-studio-core` (`governance-contracts.ts`), member for member; the referenced types are
 * written inline because a Remote Operation type file cannot import another. Core's
 * `src/__tests__/fixtures/jsontype-mirrors.ts` pins the two as exactly equal (`MirrorGetModelEvidence`), so a member
 * added, dropped or changed on either side fails Core's `jsontype-mirrors.compile.test.ts`.
 */
export type PredictiveStudioEvidenceSnapshot = {
    /** The holdout primary score of what ships, with its interval. */
    readonly holdoutPrimary: {
        readonly metric:
            | 'log-loss' | 'brier' | 'multiclass-log-loss' | 'rmse' | 'mae' | 'poisson-deviance' | 'tweedie-deviance' | 'mase'
            | 'auc' | 'accuracy' | 'f1' | 'precision' | 'recall' | 'r2' | 'calibration-slope';
        readonly value: number;
        readonly interval: { readonly level: number; readonly lower: number; readonly upper: number };
        readonly n: number;
    };
    /** The run's paired comparisons, by name. */
    readonly comparisons: Readonly<Record<string, { readonly value: number; readonly ci: readonly [number, number]; readonly beats: boolean }>>;
    /** The run's stored gate decision. */
    readonly gate:
        | {
            readonly outcome: 'model';
            readonly branch: 'a:beats-best-simple' | 'a:Q15-only-model-beats-dummy';
            readonly shipped: string;
            readonly shippedRole: 'model';
            readonly note: 'no simple baseline carries demonstrable signal' | null;
        }
        | { readonly outcome: 'keep-simple-baseline'; readonly branch: 'b:keep-simple-baseline'; readonly shipped: string; readonly shippedRole: 'simpleBaseline'; readonly note: null }
        | { readonly outcome: 'no-signal'; readonly branch: 'c:no-signal'; readonly shipped: null; readonly shippedRole: null; readonly note: null };
    /** The run's stored leakage-audit findings. */
    readonly leakageFlags: readonly (
        | { readonly kind: 'single-feature-auc'; readonly sourceColumn: string; readonly heldOutAuc: number }
        | { readonly kind: 'time-shifted-label'; readonly scoreWithShiftedLabel: number }
        | { readonly kind: 'drop-column'; readonly sourceColumn: string; readonly scoreDrop: number }
        | { readonly kind: 'high-cardinality-id'; readonly sourceColumn: string; readonly distinctRatio: number }
    )[];
    /** The training data window, as ISO dates (yyyy-mm-dd). */
    readonly dataWindow: { readonly from: string; readonly to: string };
    /** The `ContentHash` of the Training Snapshot the model was trained on. */
    readonly snapshotHash: string;
};

/** Output of `PredictiveStudio.GetModelEvidence`: the evidence and the SHA-256 a sign-off over it records. */
export interface PredictiveStudioGetModelEvidenceOutput {
    /** The evidence, built from stored rows only. */
    evidence: PredictiveStudioEvidenceSnapshot;
    /** Lower-case hex SHA-256 of the canonical JSON of `evidence`; a sign-off records it as `EvidenceSha256`. */
    evidenceSha256: string;
}
