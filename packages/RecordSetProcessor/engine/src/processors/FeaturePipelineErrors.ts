/**
 * @fileoverview Typed errors for the Feature Pipeline processors, so a caller can tell "this pipeline cannot be
 * resolved as configured" (a known, stable condition) from a failure to load what it needs (which may be transient).
 */

/**
 * A Feature Pipeline cannot run as configured: its prompt is not found, or its driver cannot be resolved. Stable until
 * someone changes the configuration; a failure to load data is not this error.
 */
export class FeaturePipelineUnresolvableError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'FeaturePipelineUnresolvableError';
    }
}

/**
 * A Decision pipeline's escalation target cannot be used as configured: its row is missing, it is not an Active Infer
 * LLM pipeline on the same entity producing the Decision pipeline's outputs, it cannot be built, or it cannot be
 * resolved ({@link FeaturePipelineUnresolvableError}). A failure to load the target is not this error.
 */
export class EscalationTargetUnresolvableError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'EscalationTargetUnresolvableError';
    }
}
