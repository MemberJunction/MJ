import { BaseEntity, IMetadataProvider, RunView, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentSessionBridgeParticipantEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: AI Agent Session Bridge Participants` entity. One row per participant on the
 * meeting/call (the diarization map + multi-party signal intel a facilitator agent reads),
 * including the agent bot itself (`IsAgent = 1`).
 *
 * Invariant: **at most one `IsAgent = 1` participant per bridge.** A bridge is one agent's
 * connection into one room (multiple agents = multiple bridges, §4c), so two bot participants on
 * the same bridge is a bookkeeping error that would confuse diarization (which inbound speaker is
 * "the agent") and the self-echo gate. The DB cannot express "≤ 1 row where IsAgent=1 per
 * SessionBridgeID" as a UNIQUE constraint (it would need a filtered unique index, which CodeGen
 * doesn't manage), so it lives here — a cross-record RunView gated on dirty, self-excluded on
 * update. PURE helper `BuildDuplicateAgentParticipantError`.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Session Bridge Participants')
export class MJAIAgentSessionBridgeParticipantEntityServer extends MJAIAgentSessionBridgeParticipantEntity {
    /** Enable async validation so the one-agent-per-bridge check runs. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // Only when this row claims to be the agent, and only when new or the relevant fields moved.
        const isAgentDirty = this.GetFieldByName('IsAgent')?.Dirty ?? false;
        const bridgeDirty = this.GetFieldByName('SessionBridgeID')?.Dirty ?? false;
        if (this.IsAgent && (!this.IsSaved || isAgentDirty || bridgeDirty)) {
            const conflict = await this.countOtherAgentParticipants();
            const dupError = BuildDuplicateAgentParticipantError(this.SessionBridgeID, conflict);
            if (dupError) {
                result.Errors.push(dupError);
                result.Success = false;
            }
        }

        return result;
    }

    /**
     * Counts OTHER `IsAgent = 1` participants on the same bridge (excluding this row when updating).
     * A failed query counts as 0 (fail-open; re-checks on next save).
     */
    private async countOtherAgentParticipants(): Promise<number> {
        if (!this.SessionBridgeID) {
            return 0; // required-field violation is sync Validate()'s job
        }
        try {
            const md = this.ProviderToUse as unknown as IMetadataProvider;
            const selfExclusion = this.IsSaved ? ` AND ID <> '${this.safeLiteral(this.ID)}'` : '';
            const filter = `SessionBridgeID='${this.safeLiteral(this.SessionBridgeID)}' AND IsAgent=1${selfExclusion}`;
            const rv = RunView.FromMetadataProvider(md);
            const queryResult = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: AI Agent Session Bridge Participants',
                    ExtraFilter: filter,
                    Fields: ['ID'],
                    ResultType: 'simple',
                },
                this.ContextCurrentUser
            );
            return queryResult.Success ? (queryResult.Results?.length ?? 0) : 0;
        } catch {
            return 0;
        }
    }

    /** Escapes a UUID/string for safe inclusion in an ExtraFilter literal. */
    private safeLiteral(value: string): string {
        return value.replace(/'/g, "''");
    }
}

/**
 * PURE invariant: a bridge has at most one agent-bot participant. Returns the error when
 * `existingAgentCount` other `IsAgent = 1` rows already exist on the bridge, else `null`.
 */
export function BuildDuplicateAgentParticipantError(
    sessionBridgeID: string | null,
    existingAgentCount: number
): ValidationErrorInfo | null {
    if (existingAgentCount <= 0) {
        return null;
    }
    return new ValidationErrorInfo(
        'IsAgent',
        `This bridge already has an agent participant (${existingAgentCount} IsAgent row(s) exist). ` +
            'A bridge is a single agent’s connection — only one participant may be the agent bot.',
        true,
        ValidationErrorType.Failure
    );
}
