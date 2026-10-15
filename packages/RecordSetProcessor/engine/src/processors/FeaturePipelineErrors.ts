/**
 * @fileoverview Typed errors for the Feature Pipeline processors: "cannot be resolved as configured", as opposed to a
 * (possibly transient) failure to load what it needs.
 */

/** A Feature Pipeline cannot run as configured: its prompt is not found, or its driver cannot be resolved. */
export class FeaturePipelineUnresolvableError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'FeaturePipelineUnresolvableError';
    }
}

/** A Decision pipeline's escalation target cannot be used as configured (missing, invalid, unbuildable or unresolvable). */
export class EscalationTargetUnresolvableError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'EscalationTargetUnresolvableError';
    }
}
