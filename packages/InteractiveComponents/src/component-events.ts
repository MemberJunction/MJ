/**
 * Base event interfaces for the MemberJunction component event system.
 * These interfaces define the standard argument shapes for Before/After event patterns
 * used by interactive components to communicate with their containers.
 */

/** Base for all component event arguments */
export interface BaseEventArgs {
    /** When the event was fired */
    timestamp: Date;
    /** Optional name of the component that fired the event */
    sourceComponentName?: string;
}

/** Base for Before events that support cancellation */
export interface CancelableEventArgs extends BaseEventArgs {
    /** Set to true by the container to cancel the operation */
    cancel: boolean;
    /** Optional reason explaining why the operation was cancelled */
    cancelReason?: string;
}

/** Base for After events that report on completed operations */
export interface AfterEventArgs extends BaseEventArgs {
    /** Whether the operation completed successfully */
    success: boolean;
    /** Error message if the operation failed */
    errorMessage?: string;
    /** How long the operation took, in milliseconds */
    durationMs?: number;
}
