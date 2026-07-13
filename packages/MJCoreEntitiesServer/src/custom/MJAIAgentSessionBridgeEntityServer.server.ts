import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentSessionBridgeEntity } from '@memberjunction/core-entities';

/** Bridge statuses that are terminal (the connection is over). */
const TERMINAL_BRIDGE_STATUSES: ReadonlySet<string> = new Set<string>(['Disconnected', 'Failed']);

/**
 * Server-side `MJ: AI Agent Session Bridges` entity. The session IS the existing `AIAgentSession`;
 * this row is the transport attachment (lifecycle state machine in §7 of the architecture doc).
 *
 * The single-column value lists (`Direction`, `JoinMethod`, `TurnMode`, `Status`, `CloseReason`)
 * are already enforced by table CHECK constraints + the generated sync validator, so this server
 * focuses on **CROSS-FIELD coherence** the DB cannot express:
 *
 *   1. **Outbound needs a target.** `Direction='Outbound'` (the agent goes *to* a meeting / places
 *      a call) requires an `Address` (join URL / phone number) OR an `ExternalConnectionID` to dial.
 *      An outbound bridge with neither is unactionable.
 *   2. **Connected implies `ConnectedAt`.** Once `Status='Connected'` the media is flowing, so the
 *      connect timestamp must be stamped (mirrors the state machine; downstream metrics read it).
 *      Same for terminal states and `DisconnectedAt`.
 *   3. **`CloseReason` only on terminal status.** A close reason on a still-active bridge is
 *      contradictory; a terminal bridge should record *why* it closed.
 *
 * All three are PURE intra-row checks → no `RunView`, no DB round trips. Each is a separately
 * exported, unit-tested helper.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Session Bridges')
export class MJAIAgentSessionBridgeEntityServer extends MJAIAgentSessionBridgeEntity {
    /** Enable async validation so the cross-field coherence checks run. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // Cheap intra-row checks. Each gates on the fields it actually reads so updates that don't
        // touch the lifecycle don't re-pay the (tiny) cost — and, more importantly, an unrelated
        // edit never resurfaces a pre-existing coherence quirk on a field the caller didn't change.
        const newErrors: ValidationErrorInfo[] = [];

        const directionDirty = this.GetFieldByName('Direction')?.Dirty ?? false;
        const addressDirty = this.GetFieldByName('Address')?.Dirty ?? false;
        const extConnDirty = this.GetFieldByName('ExternalConnectionID')?.Dirty ?? false;
        if (!this.IsSaved || directionDirty || addressDirty || extConnDirty) {
            const outboundError = ValidateOutboundHasTarget(this.Direction, this.Address, this.ExternalConnectionID);
            if (outboundError) {
                newErrors.push(outboundError);
            }
        }

        const statusDirty = this.GetFieldByName('Status')?.Dirty ?? false;
        const connectedAtDirty = this.GetFieldByName('ConnectedAt')?.Dirty ?? false;
        const disconnectedAtDirty = this.GetFieldByName('DisconnectedAt')?.Dirty ?? false;
        if (!this.IsSaved || statusDirty || connectedAtDirty || disconnectedAtDirty) {
            newErrors.push(...ValidateStatusTimestamps(this.Status, this.ConnectedAt ?? null, this.DisconnectedAt ?? null));
        }

        const closeReasonDirty = this.GetFieldByName('CloseReason')?.Dirty ?? false;
        if (!this.IsSaved || statusDirty || closeReasonDirty) {
            const closeError = ValidateCloseReasonCoherence(this.Status, this.CloseReason ?? null);
            if (closeError) {
                newErrors.push(closeError);
            }
        }

        // Collect all errors; only hard Failures flip Success (a Warning — e.g. a terminal bridge
        // missing a CloseReason — must not block the janitor/error paths from persisting).
        result.Errors.push(...newErrors);
        if (newErrors.some((e) => e.Type === ValidationErrorType.Failure)) {
            result.Success = false;
        }
        return result;
    }
}

/**
 * PURE invariant: an `Outbound` bridge must have somewhere to go — an `Address` (join URL / phone
 * number) or an `ExternalConnectionID` (an already-established connection to attach to). Returns
 * the error, or `null` when valid (Inbound bridges are exempt — the endpoint comes to the agent).
 */
export function ValidateOutboundHasTarget(
    direction: 'Inbound' | 'Outbound' | null | undefined,
    address: string | null | undefined,
    externalConnectionID: string | null | undefined
): ValidationErrorInfo | null {
    if (direction !== 'Outbound') {
        return null;
    }
    const hasAddress = (address ?? '').trim().length > 0;
    const hasConnection = (externalConnectionID ?? '').trim().length > 0;
    if (hasAddress || hasConnection) {
        return null;
    }
    return new ValidationErrorInfo(
        'Address',
        'An Outbound bridge must specify an Address (meeting join URL / phone number) or an ' +
            'ExternalConnectionID — the agent has no endpoint to connect to.',
        address ?? null,
        ValidationErrorType.Failure
    );
}

/**
 * PURE invariant: the lifecycle timestamps must agree with `Status`.
 *  - `Connected` ⇒ `ConnectedAt` is set (media is flowing; the timestamp anchors duration metrics).
 *  - terminal (`Disconnected`/`Failed`) ⇒ `DisconnectedAt` is set.
 * Returns all violations (empty array = valid). Earlier non-terminal states (Pending/Scheduled/
 * Connecting/Disconnecting) impose no timestamp requirement.
 */
export function ValidateStatusTimestamps(
    status: string | null | undefined,
    connectedAt: Date | null,
    disconnectedAt: Date | null
): ValidationErrorInfo[] {
    const errors: ValidationErrorInfo[] = [];
    if (status === 'Connected' && connectedAt == null) {
        errors.push(
            new ValidationErrorInfo(
                'ConnectedAt',
                "ConnectedAt must be set once Status is 'Connected' (the bridge's media is flowing).",
                connectedAt,
                ValidationErrorType.Failure
            )
        );
    }
    if (status != null && TERMINAL_BRIDGE_STATUSES.has(status) && disconnectedAt == null) {
        errors.push(
            new ValidationErrorInfo(
                'DisconnectedAt',
                `DisconnectedAt must be set once Status is terminal ('${status}').`,
                disconnectedAt,
                ValidationErrorType.Failure
            )
        );
    }
    return errors;
}

/**
 * PURE invariant: `CloseReason` is meaningful only for a terminal bridge.
 *  - a non-terminal status with a `CloseReason` set is contradictory (the bridge isn't closed).
 *  - a terminal status SHOULD record a reason (returned as a warning, not a hard failure, so the
 *    janitor / error paths that haven't yet stamped a reason aren't blocked from persisting).
 * Returns the error/warning, or `null` when coherent.
 */
export function ValidateCloseReasonCoherence(
    status: string | null | undefined,
    closeReason: string | null | undefined
): ValidationErrorInfo | null {
    const isTerminal = status != null && TERMINAL_BRIDGE_STATUSES.has(status);
    const hasReason = (closeReason ?? '').trim().length > 0;

    if (hasReason && !isTerminal) {
        return new ValidationErrorInfo(
            'CloseReason',
            `CloseReason ('${closeReason}') may only be set when Status is terminal (Disconnected/Failed); ` +
                `current Status is '${status ?? 'none'}'.`,
            closeReason,
            ValidationErrorType.Failure
        );
    }
    if (isTerminal && !hasReason) {
        return new ValidationErrorInfo(
            'CloseReason',
            `Status is terminal ('${status}') but no CloseReason is recorded — set why the bridge closed.`,
            closeReason ?? null,
            ValidationErrorType.Warning
        );
    }
    return null;
}
