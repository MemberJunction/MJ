import type { MJActionEntity } from '@memberjunction/core-entities';
import type { ActionParam } from '@memberjunction/actions-base';
import type { UserInfo } from '@memberjunction/core';
import type { BridgeHandlerMap } from '@memberjunction/code-execution';

/**
 * Parameters for a single Runtime action execution.
 */
export interface RuntimeActionExecutionParams {
    /** The MJActionEntity for the Runtime action to execute (must have Type='Runtime'). */
    action: MJActionEntity;

    /** Input + output ActionParam[] as supplied by the ActionEngine. */
    params: ActionParam[];

    /** User context — propagated into the sandbox for any future bridge calls. */
    contextUser: UserInfo;

    /**
     * Optional AbortSignal for cooperative cancellation. Honored by the
     * universal wall-clock timeout in ActionEngine; we race against it so
     * the sandbox can be terminated if the outer timeout fires.
     */
    abortSignal?: AbortSignal;

    /**
     * Optional bridge handlers to expose to sandbox code. When omitted, the
     * action runs in pure-compute mode (just `input` + `libs`). The bridge
     * layer (`@memberjunction/action-runtime`'s upcoming `RuntimeActionBridge`)
     * builds this map based on the action's `RuntimeActionConfiguration`
     * permissions.
     */
    bridgeHandlers?: BridgeHandlerMap;

    /**
     * Optional override for the per-execution bridge-call cap. Defaults to
     * the value in `RuntimeActionConfiguration.limits.maxBridgeCalls` or 100
     * if unset.
     */
    maxBridgeCalls?: number;
}

/**
 * Result of a Runtime action execution — structurally compatible with
 * ActionResultSimple so ActionEngine can return it unchanged to callers.
 */
export interface RuntimeActionExecutionResult {
    /** True if the sandbox ran cleanly and the user code did not signal failure. */
    success: boolean;

    /** Structured result code. See constants below for the canonical values. */
    resultCode: string;

    /** Optional human-readable message. */
    message?: string;

    /**
     * The output params that the action produced. If the user code returned
     * an object, its keys become Output ActionParams so downstream action
     * consumers see them via the standard params flow.
     */
    params: ActionParam[];

    /** Sandbox console logs. Surfaced for approval-UI review; not agent-visible. */
    logs?: string[];

    /** Execution time in milliseconds. */
    executionTimeMs?: number;
}

/**
 * Canonical result codes. Kept as string literals rather than an enum so
 * they serialize trivially into ActionExecutionLog.ResultCode and match
 * the existing Action.Result pattern.
 */
export const RuntimeActionResultCode = {
    /** Execution finished without throwing and the user code did not explicitly fail. */
    SUCCESS: 'SUCCESS',
    /** Action.Type was not 'Runtime' — dispatcher misconfiguration. */
    INVALID_TYPE: 'INVALID_TYPE',
    /** Action.Code is missing or empty. */
    MISSING_CODE: 'MISSING_CODE',
    /** CodeApprovalStatus is not 'Approved' — refuse to execute. */
    NOT_APPROVED: 'NOT_APPROVED',
    /** Action.Status is not 'Active'. */
    INACTIVE: 'INACTIVE',
    /** Sandbox execution threw an error (runtime exception in the user code). */
    RUNTIME_ERROR: 'RUNTIME_ERROR',
    /** Sandbox exceeded its timeout. */
    TIMEOUT: 'TIMEOUT',
    /** Sandbox exceeded its memory limit. */
    MEMORY_LIMIT: 'MEMORY_LIMIT',
    /** User code had a syntax error. */
    SYNTAX_ERROR: 'SYNTAX_ERROR',
    /** Security violation inside the sandbox (e.g. forbidden require). */
    SECURITY_ERROR: 'SECURITY_ERROR',
    /** Unhandled error during executor setup / teardown. */
    UNEXPECTED_ERROR: 'UNEXPECTED_ERROR'
} as const;

export type RuntimeActionResultCode =
    (typeof RuntimeActionResultCode)[keyof typeof RuntimeActionResultCode];
