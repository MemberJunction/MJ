import { BaseEntity, IMetadataProvider, RunView, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIBridgeProviderChannelEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: AI Bridge Provider Channels` entity — the junction declaring which registered
 * `AIAgentChannel`s a provider contributes (Zoom → Meeting Controls + Native Whiteboard, etc.).
 *
 * The only invariant worth enforcing is uniqueness of `(ProviderID, ChannelID)` — a provider
 * shouldn't list the same channel twice. **The database already enforces this with a UNIQUE
 * constraint (`UQ_AIBridgeProviderChannel (ProviderID, ChannelID)`)**, so this check is
 * **defense-in-depth / friendly-message only**: it turns the raw SQL unique-violation error into a
 * clear, field-attributed message at validation time (before the INSERT/UPDATE is attempted) and
 * is consistent with how the sibling co-agent / identity servers surface their cross-record rules.
 * No format/shape invariants exist for this purely-relational row, so there is nothing else to add.
 */
@RegisterClass(BaseEntity, 'MJ: AI Bridge Provider Channels')
export class MJAIBridgeProviderChannelEntityServer extends MJAIBridgeProviderChannelEntity {
    /** Enable async validation so the friendly-message uniqueness check runs. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        const providerDirty = this.GetFieldByName('ProviderID')?.Dirty ?? false;
        const channelDirty = this.GetFieldByName('ChannelID')?.Dirty ?? false;
        if (!this.IsSaved || providerDirty || channelDirty) {
            const conflict = await this.countOtherProviderChannelRows();
            const dupError = BuildDuplicateProviderChannelError(this.ProviderID, this.ChannelID, conflict);
            if (dupError) {
                result.Errors.push(dupError);
                result.Success = false;
            }
        }

        return result;
    }

    /**
     * Counts OTHER rows pairing this provider with this channel (excluding this row when updating).
     * A failed query counts as 0 (fail-open; the DB UNIQUE constraint is the hard backstop anyway).
     */
    private async countOtherProviderChannelRows(): Promise<number> {
        if (!this.ProviderID || !this.ChannelID) {
            return 0; // required-field violations are sync Validate()'s job
        }
        try {
            const md = this.ProviderToUse as unknown as IMetadataProvider;
            const selfExclusion = this.IsSaved ? ` AND ID <> '${this.safeLiteral(this.ID)}'` : '';
            const filter =
                `ProviderID='${this.safeLiteral(this.ProviderID)}' AND ` +
                `ChannelID='${this.safeLiteral(this.ChannelID)}'${selfExclusion}`;
            const rv = RunView.FromMetadataProvider(md);
            const queryResult = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: AI Bridge Provider Channels',
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
 * PURE invariant: a provider may list a given channel only once. Returns the friendly error when
 * `existingCount` other rows already pair this `(ProviderID, ChannelID)`, else `null`.
 * (Defense-in-depth over the DB `UQ_AIBridgeProviderChannel` UNIQUE constraint.)
 */
export function BuildDuplicateProviderChannelError(
    providerID: string | null,
    channelID: string | null,
    existingCount: number
): ValidationErrorInfo | null {
    if (existingCount <= 0) {
        return null;
    }
    return new ValidationErrorInfo(
        'ChannelID',
        `This provider already contributes the selected channel (${existingCount} existing row(s)). ` +
            'A provider can list each channel only once — edit the existing row instead.',
        channelID,
        ValidationErrorType.Failure
    );
}
