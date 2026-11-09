import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJTaskEntity } from '@memberjunction/core-entities';
import { TASK_RUNTIME_SECURITY_KEYS } from '@memberjunction/ai-core-plus';

/**
 * Why a save must not write `Task.SecurityEnvelope`, or null when it may.
 *
 * The envelope holds the constraints of the agent run that submitted a task graph — its bound
 * parameters, audience, tenant scope and taint — and the dispatcher enforces it on every node. It is
 * written once, when the row is created (the server's own graph submission and its compensation
 * tasks), and never changed: a later edit could only loosen what the submitting run was held to, so
 * any change to it on an existing row is refused, whoever makes it.
 */
export function SecurityEnvelopeChangeRefusal(isSaved: boolean, securityEnvelopeDirty: boolean): string | null {
    if (!isSaved || !securityEnvelopeDirty) {
        return null;
    }
    return 'SecurityEnvelope cannot be changed after the task is created: it holds the constraints of the run that ' +
        'submitted the workflow, and the dispatcher enforces it on every step.';
}

/**
 * Why a save must not write `Configuration` as given, or null when it may: it changes one of the
 * runtime fields the dispatcher's security decisions read ({@link TASK_RUNTIME_SECURITY_KEYS}).
 *
 * Those fields record what happened when a step ran (whether its output was tainted, and the
 * parameters its action was given), and the dispatcher writes them through its guarded completion
 * procedure, beneath the entity layer. So any change to them through the entity layer is refused,
 * whoever makes it: a client, or server code such as the Update Record action a tainted agent calls
 * on its own graph's rows. Setting `isOutputTainted` back to false would otherwise run every step
 * downstream of an untrusted fetch clean. A create counts as a change from nothing, and a
 * `Configuration` that does not parse reads as having none of them, so neither can slip one in.
 *
 * @param storedConfiguration the column before this save (`null` for a create)
 * @param nextConfiguration the column being saved
 */
export function RuntimeSecurityChangeRefusal(
    storedConfiguration: string | null | undefined,
    nextConfiguration: string | null | undefined,
): string | null {
    const stored = runtimeOf(storedConfiguration);
    const next = runtimeOf(nextConfiguration);
    const changed = TASK_RUNTIME_SECURITY_KEYS.find((key) => JSON.stringify(stored[key]) !== JSON.stringify(next[key]));
    if (!changed) {
        return null;
    }
    return `Configuration.runtime.${changed} cannot be set or changed: only the task-graph dispatcher records it, ` +
        'and it decides how far the step\'s output is trusted.';
}

/** The `runtime` object of a serialized `Task.Configuration`, or `{}` when it has none or does not parse. */
function runtimeOf(configuration: string | null | undefined): Record<string, unknown> {
    if (!configuration) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(configuration);
        const runtime = isRecord(parsed) ? parsed.runtime : undefined;
        return isRecord(runtime) ? runtime : {};
    } catch {
        return {};
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Server-side `MJ: Tasks` entity: keeps a task's security envelope immutable after insert
 * ({@link SecurityEnvelopeChangeRefusal}) and its runtime security fields dispatcher-owned
 * ({@link RuntimeSecurityChangeRefusal}).
 */
@RegisterClass(BaseEntity, 'MJ: Tasks')
export class MJTaskEntityServer extends MJTaskEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const refusal = SecurityEnvelopeChangeRefusal(this.IsSaved, this.GetFieldByName('SecurityEnvelope')?.Dirty ?? false);
        if (refusal) {
            result.Errors.push(new ValidationErrorInfo('SecurityEnvelope', refusal, this.SecurityEnvelope, ValidationErrorType.Failure));
            result.Success = false;
        }
        const storedConfiguration = this.IsSaved ? (this.GetFieldByName('Configuration')?.OldValue as string | null | undefined) : null;
        const runtimeRefusal = RuntimeSecurityChangeRefusal(storedConfiguration, this.Configuration);
        if (runtimeRefusal) {
            result.Errors.push(new ValidationErrorInfo('Configuration', runtimeRefusal, this.Configuration, ValidationErrorType.Failure));
            result.Success = false;
        }
        return result;
    }
}
