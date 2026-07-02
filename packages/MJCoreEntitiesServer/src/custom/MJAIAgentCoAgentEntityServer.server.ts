import { BaseEntity, IMetadataProvider, RunView, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentEntity, MJAIAgentCoAgentEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';

/** The seeded name of the Realtime agent type — a co-agent must be of this type. */
const REALTIME_AGENT_TYPE_NAME = 'Realtime';

/**
 * Server-side `MJ: AI Agent Co Agents` entity enforcing the affinity invariants the migration
 * documents (see `V202606121723__v5.41.x__AI_Agent_Sessions_Channels.sql`):
 *
 *   1. For `Type = 'CoAgent'` rows, `CoAgentID` must reference an **Active** agent of the
 *      **Realtime** agent type — only Realtime-type agents drive realtime sessions, so
 *      pairing rows for anything else are metadata mistakes caught at write time. Reserved
 *      relationship types (Peer/Delegate/Fallback/Reviewer/Observer) skip this check — their
 *      owner semantics will be defined when those features ship.
 *   2. **At most one `IsDefault = 1` row per (CoAgentID, Type)** — the default is the target
 *      a session falls back to when no runtime target is supplied (agent rows) or the type's
 *      default co-agent (type rows); two defaults would be ambiguous. Cross-record invariant
 *      checked via RunView (the BASE_ENTITY_SERVER_PATTERNS recipe — `ValidateAsync`, NOT a
 *      DB trigger).
 *   3. **No duplicate relationship**: (CoAgentID, target side, Type) must be unique. The DB
 *      cannot express this as a UNIQUE constraint across the two nullable target columns, so
 *      it lives here per the migration's documentation.
 *   4. `CoAgentID ≠ TargetAgentID` — defense in depth over the table CHECK constraint and the
 *      generated sync validator (an agent cannot front itself). The exactly-one-target rule
 *      is covered by the table CHECK + the generated validator.
 *
 * Affinity rows are OPT-IN: a co-agent with zero rows stays universal — these checks only
 * govern rows being written, never mandate that any exist.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Co Agents')
export class MJAIAgentCoAgentEntityServer extends MJAIAgentCoAgentEntity {
    /** Enable async validation so the cross-record pairing invariants run. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // (3) Self-pairing — cheap, always checked (defense in depth over the CHECK constraint).
        const selfPairError = BuildSelfPairingError(this.CoAgentID, this.TargetAgentID);
        if (selfPairError) {
            result.Errors.push(selfPairError);
            result.Success = false;
            return result;
        }

        // (1) Co-agent must be an Active, Realtime-type agent — Type='CoAgent' rows only,
        // and only when new or CoAgentID/Type changed.
        const coAgentDirty = this.GetFieldByName('CoAgentID')?.Dirty ?? false;
        const typeDirty = this.GetFieldByName('Type')?.Dirty ?? false;
        if (this.Type === 'CoAgent' && (!this.IsSaved || coAgentDirty || typeDirty)) {
            const coAgentErrors = await this.validateCoAgentIsActiveRealtime();
            if (coAgentErrors.length > 0) {
                result.Errors.push(...coAgentErrors);
                result.Success = false;
                return result;
            }
        }

        // (2) At most one IsDefault row per (CoAgentID, Type) — only when this row claims the default.
        const isDefaultDirty = this.GetFieldByName('IsDefault')?.Dirty ?? false;
        if (this.IsDefault && (!this.IsSaved || isDefaultDirty || coAgentDirty || typeDirty)) {
            const conflict = await this.countOtherDefaultRows();
            const defaultError = BuildDuplicateDefaultError(this.CoAgentID, conflict);
            if (defaultError) {
                result.Errors.push(defaultError);
                result.Success = false;
            }
        }

        // (3) No duplicate (CoAgentID, target side, Type) relationship.
        const targetDirty =
            (this.GetFieldByName('TargetAgentID')?.Dirty ?? false) ||
            (this.GetFieldByName('TargetAgentTypeID')?.Dirty ?? false);
        if (!this.IsSaved || coAgentDirty || typeDirty || targetDirty) {
            const duplicates = await this.countDuplicateRelationshipRows();
            const duplicateError = BuildDuplicateRelationshipError(this.CoAgentID, this.Type, duplicates);
            if (duplicateError) {
                result.Errors.push(duplicateError);
                result.Success = false;
            }
        }
        return result;
    }

    /**
     * Loads the co-agent (and its type) through the request-scoped provider and returns the
     * invariant violations: missing agent, non-Active status, or non-Realtime type.
     */
    private async validateCoAgentIsActiveRealtime(): Promise<ValidationErrorInfo[]> {
        if (!this.CoAgentID) {
            return []; // required-field violation is sync Validate()'s job
        }
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const coAgent = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', this.ContextCurrentUser);
        if (!(await coAgent.Load(this.CoAgentID))) {
            return BuildCoAgentInvariantErrors(this.CoAgentID, null, null);
        }
        let typeName: string | null = null;
        if (coAgent.TypeID) {
            const type = await md.GetEntityObject<MJAIAgentTypeEntity>('MJ: AI Agent Types', this.ContextCurrentUser);
            if (await type.Load(coAgent.TypeID)) {
                typeName = type.Name ?? null;
            }
        }
        return BuildCoAgentInvariantErrors(this.CoAgentID, coAgent.Status ?? null, typeName, coAgent.Name ?? undefined);
    }

    /**
     * Counts OTHER `IsDefault = 1` rows for this (co-agent, Type) — excluding this row when
     * updating. A failed query counts as 0 (fail-open; the invariant re-checks on next save).
     */
    private async countOtherDefaultRows(): Promise<number> {
        if (!this.CoAgentID) {
            return 0;
        }
        const safeType = this.Type.replace(/'/g, "''");
        return this.countRows(`CoAgentID='${this.safeID(this.CoAgentID)}' AND Type='${safeType}' AND IsDefault=1`);
    }

    /**
     * Counts OTHER rows expressing the SAME relationship — same co-agent, same Type, same
     * target side (TargetAgentID or TargetAgentTypeID) — excluding this row when updating.
     */
    private async countDuplicateRelationshipRows(): Promise<number> {
        if (!this.CoAgentID || (!this.TargetAgentID && !this.TargetAgentTypeID)) {
            return 0; // missing-target violation is the CHECK/sync validator's job
        }
        const safeType = this.Type.replace(/'/g, "''");
        const targetFilter = this.TargetAgentID
            ? `TargetAgentID='${this.safeID(this.TargetAgentID)}'`
            : `TargetAgentTypeID='${this.safeID(this.TargetAgentTypeID!)}'`;
        return this.countRows(`CoAgentID='${this.safeID(this.CoAgentID)}' AND Type='${safeType}' AND ${targetFilter}`);
    }

    /** Shared cross-record counter: runs the filter (plus self-exclusion) and returns the row count. */
    private async countRows(filter: string): Promise<number> {
        try {
            const md = this.ProviderToUse as unknown as IMetadataProvider;
            const selfExclusion = this.IsSaved ? ` AND ID <> '${this.safeID(this.ID)}'` : '';
            const rv = RunView.FromMetadataProvider(md);
            const result = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: AI Agent Co Agents',
                    ExtraFilter: `${filter}${selfExclusion}`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                },
                this.ContextCurrentUser
            );
            return result.Success ? (result.Results?.length ?? 0) : 0;
        } catch {
            return 0;
        }
    }

    /** Escapes a UUID/string for safe inclusion in an ExtraFilter literal. */
    private safeID(value: string): string {
        return value.replace(/'/g, "''");
    }
}

/**
 * PURE invariant: an agent cannot be paired as its own co-agent. Returns the error, or `null`.
 * Case/whitespace-insensitive UUID comparison (SQL Server vs PostgreSQL casing).
 */
export function BuildSelfPairingError(coAgentID: string | null, targetAgentID: string | null): ValidationErrorInfo | null {
    if (!coAgentID || !targetAgentID) {
        return null;
    }
    if (coAgentID.trim().toLowerCase() !== targetAgentID.trim().toLowerCase()) {
        return null;
    }
    return new ValidationErrorInfo(
        'CoAgentID',
        'The co-agent cannot be the same as the target agent — an agent cannot front itself in a realtime session.',
        coAgentID,
        ValidationErrorType.Failure
    );
}

/**
 * PURE invariant core for the co-agent reference (exported for unit tests): the referenced
 * agent must exist, be Active, and be of the Realtime agent type.
 *
 * @param coAgentID The referenced co-agent id.
 * @param status The loaded co-agent's Status, or `null` when the agent could not be loaded.
 * @param typeName The loaded co-agent's TYPE name, or `null` when missing/unresolvable.
 * @param agentName The loaded co-agent's display name (for friendlier messages).
 * @returns The violations (empty array = valid).
 */
export function BuildCoAgentInvariantErrors(
    coAgentID: string,
    status: string | null,
    typeName: string | null,
    agentName?: string
): ValidationErrorInfo[] {
    if (status === null) {
        return [
            new ValidationErrorInfo(
                'CoAgentID',
                `CoAgentID references agent '${coAgentID}' but no such agent exists.`,
                coAgentID,
                ValidationErrorType.Failure
            ),
        ];
    }
    const errors: ValidationErrorInfo[] = [];
    const label = agentName ? `'${agentName}'` : `'${coAgentID}'`;
    if (status.trim().toLowerCase() !== 'active') {
        errors.push(
            new ValidationErrorInfo(
                'CoAgentID',
                `Co-agent ${label} must be Active to be paired (current Status: ${status}).`,
                coAgentID,
                ValidationErrorType.Failure
            )
        );
    }
    if ((typeName ?? '').trim().toLowerCase() !== REALTIME_AGENT_TYPE_NAME.toLowerCase()) {
        errors.push(
            new ValidationErrorInfo(
                'CoAgentID',
                `Co-agent ${label} must be of the '${REALTIME_AGENT_TYPE_NAME}' agent type to drive realtime sessions ` +
                    `(current type: ${typeName ?? 'none'}).`,
                coAgentID,
                ValidationErrorType.Failure
            )
        );
    }
    return errors;
}

/**
 * PURE invariant: at most one `IsDefault = 1` row per (co-agent, relationship Type). Returns
 * the error when `existingDefaultCount` other default rows already exist, else `null`.
 */
export function BuildDuplicateDefaultError(coAgentID: string | null, existingDefaultCount: number): ValidationErrorInfo | null {
    if (existingDefaultCount <= 0) {
        return null;
    }
    return new ValidationErrorInfo(
        'IsDefault',
        `Co-agent '${coAgentID}' already has a default paired target (${existingDefaultCount} IsDefault row(s) exist). ` +
            'Clear the existing default before marking this pairing as the default.',
        true,
        ValidationErrorType.Failure
    );
}

/**
 * PURE invariant: a (CoAgentID, target side, Type) relationship may exist only once — the DB
 * cannot enforce uniqueness across the two nullable target columns. Returns the error when
 * `duplicateCount` other identical rows already exist, else `null`.
 */
export function BuildDuplicateRelationshipError(
    coAgentID: string | null,
    relationshipType: string,
    duplicateCount: number
): ValidationErrorInfo | null {
    if (duplicateCount <= 0) {
        return null;
    }
    return new ValidationErrorInfo(
        'TargetAgentID',
        `An identical '${relationshipType}' relationship already exists for co-agent '${coAgentID}' and this target ` +
            `(${duplicateCount} duplicate row(s)). Edit the existing row instead of creating another.`,
        coAgentID,
        ValidationErrorType.Failure
    );
}
