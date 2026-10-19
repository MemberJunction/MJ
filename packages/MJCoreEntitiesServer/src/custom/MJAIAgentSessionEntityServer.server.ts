import { BaseEntity, EntitySaveOptions, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { FindProtectedSessionConfigChanges, IsTrustedSessionConfigWriteActive } from './sessionConfigGuard';

/**
 * Server-side `MJ: AI Agent Sessions` entity.
 *
 * It keeps the **server-authoritative keys** inside `Config` (the janitor's
 * `maxSessionDeadlineIso`, the `identityVerification` state) out of the session owner's reach, and it
 * keeps every save from writing back the **recording ledger's columns** (see {@link Save}). The
 * owner can legitimately write the row — the `UI` and `Widget Guest` roles hold `CanUpdate` on their
 * own sessions — so the protection has to live at the entity, where the generated CRUD mutations,
 * `StartAgentSession(configJson)` and every other path converge on `Save()`.
 *
 * See {@link FindProtectedSessionConfigChanges} for what is protected and why, and
 * `RunWithTrustedSessionConfigWrites` for how server code opts in.
 *
 * Uses the **synchronous** `Validate()` rather than `ValidateAsync()` on purpose: `Validate()` runs on
 * every save, whereas async validation can be skipped by an option, and a guard that a caller can opt
 * out of is not a guard.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Sessions')
export class MJAIAgentSessionEntityServer extends MJAIAgentSessionEntity {
    /**
     * Columns the client-direct recording ledger's stored procedures own (#5294). They change under a live
     * session (shard inserts, terminal stamps, assembly claims and finishes) without going through this
     * entity.
     */
    private static readonly recordingLedgerFields: readonly (keyof MJAIAgentSessionEntity)[] = [
        'RecordingStatus', 'RecordingExpectedShards', 'RecordingCapturedSamples', 'RecordingGaps',
        'RecordingAssemblyVersion', 'RecordingFileID', 'RecordingMedia',
    ];

    /**
     * Saves without writing back the recording ledger's columns the caller did not change.
     *
     * An update writes every loaded column, so a session loaded before a ledger procedure ran and saved
     * after it (a heartbeat, the close, a delegated tool call that rolls `Config` forward, a verification
     * step) would put the stale recording state back: rewind the assembly version and status (a running
     * assembly then loses its fence and a superseded one can win it) or clear `RecordingFileID` (a later
     * re-assembly then has no file to reuse and writes silence over audio it can no longer recover).
     * Marking those fields not-loaded makes the save leave them out of the update procedure, whose
     * `ISNULL` keeps the stored values. A field the caller set explicitly (the legacy whole-call upload
     * stamps `RecordingFileID`) is dirty and is still saved; an insert takes every column.
     *
     * `MarkNotLoaded` is the hydration paths' tool; this entity uses it for the same meaning — "this copy
     * of the value is not the database's" — at the one place every server-side save converges.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.IsSaved) {
            for (const name of MJAIAgentSessionEntityServer.recordingLedgerFields) {
                const field = this.GetFieldByName(name);
                if (field && !field.Dirty) {
                    field.MarkNotLoaded();
                }
            }
        }
        return super.Save(options);
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        const violation = this.checkProtectedConfigKeys();
        if (violation) {
            result.Errors.push(violation);
            result.Success = false;
        }
        return result;
    }

    /** Returns a refusal when an untrusted save changes a protected `Config` key, else null. */
    private checkProtectedConfigKeys(): ValidationErrorInfo | null {
        if (IsTrustedSessionConfigWriteActive()) {
            return null;
        }
        const configField = this.GetFieldByName('Config');
        if (!configField) {
            return null;
        }
        // A saved record is compared against what was loaded; a new record against nothing. For a
        // saved record whose Config was not touched there is nothing to compare.
        if (this.IsSaved && !configField.Dirty) {
            return null;
        }
        const previous = this.IsSaved && typeof configField.OldValue === 'string' ? configField.OldValue : null;
        const changed = FindProtectedSessionConfigChanges(previous, this.Config_);
        if (changed.length === 0) {
            return null;
        }
        return new ValidationErrorInfo(
            'Config',
            `Config keys [${changed.join(', ')}] are server-managed and cannot be set by the session owner.`,
            null,
            ValidationErrorType.Failure,
        );
    }
}
