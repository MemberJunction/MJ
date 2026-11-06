import {
    AuthorizationInfo,
    BaseEntity,
    IMetadataProvider,
    RunView,
    RunViewParams,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    EvaluateAuthorizationChecks,
    FormatGraphNodeKey,
    GraphEngine,
    IsGraphDataProvider,
    MJGraphEdgeEntity,
    MJGraphEdgeTypeEntity,
    type GraphDataProvider,
} from '@memberjunction/core-entities';

/** Maximum character length permitted for `SourceRecordID` and `TargetRecordID`. */
export const MAX_GRAPH_EDGE_RECORD_ID_LENGTH = 400;

/** Named authorization required for every approval decision on `MJ: Graph Edges` (see {@link EvaluateGraphEdgeApproval}). */
export const GRAPH_APPROVE_EDGES_AUTHORIZATION = 'Graph: Approve Edges';

/**
 * Input snapshot of a `MJ: Graph Edges` row evaluated by {@link ValidateGraphEdgeInvariants}.
 */
export interface GraphEdgeValidationInput {
    readonly GraphID: string | null | undefined;
    readonly EdgeTypeID: string | null | undefined;
    readonly SourceEntityID: string | null | undefined;
    readonly SourceRecordID: string | null | undefined;
    readonly TargetEntityID: string | null | undefined;
    readonly TargetRecordID: string | null | undefined;
    readonly Origin: MJGraphEdgeEntity['Origin'] | null | undefined;
    readonly Status: MJGraphEdgeEntity['Status'] | null | undefined;
    readonly IsSaved: boolean;
}

/**
 * Normalized endpoints for an undirected edge (lower `<entityID>|<recordID>` node key first).
 */
export interface CanonicalGraphEdgeEndpoints {
    readonly SourceEntityID: string;
    readonly SourceRecordID: string;
    readonly TargetEntityID: string;
    readonly TargetRecordID: string;
    readonly Swapped: boolean;
}

/**
 * Canonicalize endpoints for an undirected edge (`IsDirected === false`) so the lower
 * `<entityID>|<recordID>` key always occupies the `Source*` columns.
 */
export function CanonicalizeUndirectedEdgeEndpoints(
    sourceEntityID: string,
    sourceRecordID: string,
    targetEntityID: string,
    targetRecordID: string,
): CanonicalGraphEdgeEndpoints {
    const sourceKey = FormatGraphNodeKey(sourceEntityID, sourceRecordID);
    const targetKey = FormatGraphNodeKey(targetEntityID, targetRecordID);
    if (sourceKey > targetKey) {
        return {
            SourceEntityID: targetEntityID,
            SourceRecordID: targetRecordID,
            TargetEntityID: sourceEntityID,
            TargetRecordID: sourceRecordID,
            Swapped: true,
        };
    }
    return {
        SourceEntityID: sourceEntityID,
        SourceRecordID: sourceRecordID,
        TargetEntityID: targetEntityID,
        TargetRecordID: targetRecordID,
        Swapped: false,
    };
}

/**
 * Pure invariant check for a `MJ: Graph Edges` record (Phase G1.3):
 * 1. No self-loop (`SourceEntityID === TargetEntityID` and `SourceRecordID === TargetRecordID`).
 * 2. `SourceRecordID` and `TargetRecordID` are non-empty and at most 400 characters.
 * 3. `EdgeTypeID` resolves to an edge type with `AllowStored === true` (refuses provider-only types)
 *    that belongs to the edge's `GraphID` or is global (`GraphID === null`).
 * 4. `SourceEntityID` and `TargetEntityID` satisfy `GraphEngine.ValidateEdgeEndpoint` constraints.
 * 5. A new `Inferred` edge (`!IsSaved && Origin === 'Inferred'`) must be created with `Status === 'Proposed'`.
 */
export function ValidateGraphEdgeInvariants(
    input: GraphEdgeValidationInput,
    edgeType: Pick<MJGraphEdgeTypeEntity, 'ID' | 'Name' | 'GraphID' | 'IsDirected' | 'AllowStored'> | undefined,
    validateEndpoint: (edgeTypeId: string, side: 'Source' | 'Target', entityId: string) => boolean = (
        edgeTypeId,
        side,
        entityId,
    ) => GraphEngine.Instance.ValidateEdgeEndpoint(edgeTypeId, side, entityId),
): ValidationErrorInfo[] {
    const errors: ValidationErrorInfo[] = [];

    const srcRec = input.SourceRecordID ?? '';
    const tgtRec = input.TargetRecordID ?? '';

    if (srcRec.trim().length === 0) {
        errors.push(
            new ValidationErrorInfo(
                'SourceRecordID',
                'SourceRecordID cannot be empty.',
                input.SourceRecordID,
                ValidationErrorType.Failure,
            ),
        );
    } else if (srcRec.length > MAX_GRAPH_EDGE_RECORD_ID_LENGTH) {
        errors.push(
            new ValidationErrorInfo(
                'SourceRecordID',
                `SourceRecordID cannot exceed ${MAX_GRAPH_EDGE_RECORD_ID_LENGTH} characters (got ${srcRec.length}).`,
                input.SourceRecordID,
                ValidationErrorType.Failure,
            ),
        );
    }

    if (tgtRec.trim().length === 0) {
        errors.push(
            new ValidationErrorInfo(
                'TargetRecordID',
                'TargetRecordID cannot be empty.',
                input.TargetRecordID,
                ValidationErrorType.Failure,
            ),
        );
    } else if (tgtRec.length > MAX_GRAPH_EDGE_RECORD_ID_LENGTH) {
        errors.push(
            new ValidationErrorInfo(
                'TargetRecordID',
                `TargetRecordID cannot exceed ${MAX_GRAPH_EDGE_RECORD_ID_LENGTH} characters (got ${tgtRec.length}).`,
                input.TargetRecordID,
                ValidationErrorType.Failure,
            ),
        );
    }

    if (
        input.SourceEntityID &&
        input.TargetEntityID &&
        srcRec.trim().length > 0 &&
        UUIDsEqual(input.SourceEntityID, input.TargetEntityID) &&
        srcRec.trim().toLowerCase() === tgtRec.trim().toLowerCase()
    ) {
        errors.push(
            new ValidationErrorInfo(
                'SourceRecordID',
                'Graph edge cannot connect a node to itself (self-loop is not allowed).',
                input.SourceRecordID,
                ValidationErrorType.Failure,
            ),
        );
    }

    if (edgeType) {
        if (!edgeType.AllowStored) {
            errors.push(
                new ValidationErrorInfo(
                    'EdgeTypeID',
                    `Edge type "${edgeType.Name}" is provider-only (AllowStored = false) and cannot be persisted in MJ: Graph Edges.`,
                    input.EdgeTypeID,
                    ValidationErrorType.Failure,
                ),
            );
        }
        if (edgeType.GraphID != null && input.GraphID != null && !UUIDsEqual(edgeType.GraphID, input.GraphID)) {
            errors.push(
                new ValidationErrorInfo(
                    'EdgeTypeID',
                    `Edge type "${edgeType.Name}" is scoped to a different graph and cannot be used in graph "${input.GraphID}".`,
                    input.EdgeTypeID,
                    ValidationErrorType.Failure,
                ),
            );
        }
    }

    if (input.EdgeTypeID && input.SourceEntityID) {
        if (!validateEndpoint(input.EdgeTypeID, 'Source', input.SourceEntityID)) {
            errors.push(
                new ValidationErrorInfo(
                    'SourceEntityID',
                    `Entity "${input.SourceEntityID}" is not permitted as a Source endpoint for edge type "${edgeType?.Name ?? input.EdgeTypeID}".`,
                    input.SourceEntityID,
                    ValidationErrorType.Failure,
                ),
            );
        }
    }

    if (input.EdgeTypeID && input.TargetEntityID) {
        if (!validateEndpoint(input.EdgeTypeID, 'Target', input.TargetEntityID)) {
            errors.push(
                new ValidationErrorInfo(
                    'TargetEntityID',
                    `Entity "${input.TargetEntityID}" is not permitted as a Target endpoint for edge type "${edgeType?.Name ?? input.EdgeTypeID}".`,
                    input.TargetEntityID,
                    ValidationErrorType.Failure,
                ),
            );
        }
    }

    if (!input.IsSaved && input.Origin === 'Inferred' && input.Status !== 'Proposed') {
        errors.push(
            new ValidationErrorInfo(
                'Status',
                `Inferred edges must be created with Status = "Proposed" (got "${input.Status ?? ''}").`,
                input.Status,
                ValidationErrorType.Failure,
            ),
        );
    }

    return errors;
}

/**
 * Inputs to {@link EvaluateGraphEdgeApproval}: what is being saved, by whom, and the authorizations
 * the caller's provider holds.
 */
export interface GraphEdgeApprovalInput {
    /** `true` for an update of an existing row, `false` for a create. */
    readonly IsSaved: boolean;
    /** The stored `Status` before this save (the field's `OldValue`); ignored for a create. */
    readonly PreviousStatus: MJGraphEdgeEntity['Status'] | null | undefined;
    /** The `Status` being saved. */
    readonly NextStatus: MJGraphEdgeEntity['Status'] | null | undefined;
    /**
     * `true` when an update changes what the edge connects or means: `GraphID`, `EdgeTypeID`, or any
     * `Source*` / `Target*` column. Re-pointing an approved edge approves a different edge.
     */
    readonly IdentityChanged: boolean;
    readonly User: UserInfo | undefined;
    readonly Authorizations: AuthorizationInfo[] | undefined;
}

/**
 * Result of {@link EvaluateGraphEdgeApproval}.
 */
export interface GraphEdgeApprovalVerdict {
    readonly Error: ValidationErrorInfo | null;
    /** `true` when the save is an approval decision that passed, so the reviewer is stamped. */
    readonly ShouldStampReview: boolean;
}

/**
 * True when saving these values is an approval decision that `Graph: Approve Edges` must authorize:
 * - creating an edge that starts out `Approved` (a pre-approved `Declared` edge);
 * - changing `Status` to `Approved` or `Rejected` (a review decision, from any prior status);
 * - changing what an `Approved` edge connects (`IdentityChanged`).
 */
export function GraphEdgeSaveNeedsApproval(input: GraphEdgeApprovalInput): boolean {
    if (!input.IsSaved) {
        return input.NextStatus === 'Approved';
    }
    const statusChanged = input.PreviousStatus !== input.NextStatus;
    if (statusChanged && (input.NextStatus === 'Approved' || input.NextStatus === 'Rejected')) {
        return true;
    }
    return input.NextStatus === 'Approved' && input.IdentityChanged;
}

/**
 * Pure fail-closed gate for approval decisions on `MJ: Graph Edges` (see {@link GraphEdgeSaveNeedsApproval}).
 *
 * The caller must hold `Graph: Approve Edges` (or an ancestor) through `EvaluateAuthorizationChecks`,
 * MJ's role-based evaluation. There is no bypass for any user type: an authorization that is not
 * seeded, an empty authorization list, or a missing caller all deny, because each of them means
 * nobody has been granted the right.
 */
export function EvaluateGraphEdgeApproval(input: GraphEdgeApprovalInput): GraphEdgeApprovalVerdict {
    if (!GraphEdgeSaveNeedsApproval(input)) {
        return { Error: null, ShouldStampReview: false };
    }
    if (!input.User) {
        return {
            Error: approvalError(`requires an authenticated caller with "${GRAPH_APPROVE_EDGES_AUTHORIZATION}"`, input.NextStatus),
            ShouldStampReview: false,
        };
    }
    const [check] = EvaluateAuthorizationChecks([GRAPH_APPROVE_EDGES_AUTHORIZATION], input.User, input.Authorizations ?? []);
    if (!check || check.Unknown) {
        return {
            Error: approvalError(`requires "${GRAPH_APPROVE_EDGES_AUTHORIZATION}", which is not configured in this system`, input.NextStatus),
            ShouldStampReview: false,
        };
    }
    if (!check.Allowed) {
        return {
            Error: approvalError(`requires "${GRAPH_APPROVE_EDGES_AUTHORIZATION}", which the caller does not hold`, input.NextStatus),
            ShouldStampReview: false,
        };
    }
    return { Error: null, ShouldStampReview: true };
}

function approvalError(reason: string, nextStatus: MJGraphEdgeEntity['Status'] | null | undefined): ValidationErrorInfo {
    return new ValidationErrorInfo(
        'Status',
        `Saving this graph edge as "${nextStatus ?? ''}" is an approval decision and ${reason}. ` +
            'Save it as "Proposed" for a reviewer instead.',
        nextStatus,
        ValidationErrorType.Failure,
    );
}

/**
 * Batched `RunViews` (`ResultType: 'count_only'`) existence check for `Source` and `Target` endpoint
 * records, run as `user` so an endpoint the caller cannot read (entity permission or row-level
 * security) is refused exactly like one that does not exist.
 *
 * Fails closed: an endpoint entity missing from metadata, a failed read, or an exception is a
 * validation error, never a silent pass.
 */
export async function CheckGraphEdgeEndpointsExist(
    input: {
        readonly SourceEntityID: string | null | undefined;
        readonly SourceRecordID: string | null | undefined;
        readonly TargetEntityID: string | null | undefined;
        readonly TargetRecordID: string | null | undefined;
    },
    provider: IMetadataProvider,
    user: UserInfo | undefined,
): Promise<ValidationErrorInfo[]> {
    if (!user) {
        return [endpointError('SourceRecordID', 'Graph edge endpoints can only be checked for an authenticated caller.', input.SourceRecordID)];
    }

    const errors: ValidationErrorInfo[] = [];
    const checks: Array<{ Field: EndpointField; EntityName: string; RecordID: string; Param: RunViewParams }> = [];
    const addCheck = (field: EndpointField, entityId: string | null | undefined, recordId: string | null | undefined): void => {
        const trimmedId = recordId?.trim();
        if (!entityId || !trimmedId) {
            return; // emptiness is reported by ValidateGraphEdgeInvariants
        }
        const entityInfo = provider.EntityByID(entityId);
        const pkName = entityInfo?.FirstPrimaryKey?.Name; // first-pk-ok: Graph edge endpoint record existence check uses FirstPrimaryKey
        if (!entityInfo || !pkName) {
            errors.push(endpointError(field, `Endpoint entity "${entityId}" is not a known entity.`, entityId));
            return;
        }
        checks.push({
            Field: field,
            EntityName: entityInfo.Name,
            RecordID: trimmedId,
            Param: {
                EntityName: entityInfo.Name,
                ExtraFilter: `[${pkName}] = '${EscapeSQLString(trimmedId)}'`,
                ResultType: 'count_only',
            },
        });
    };

    addCheck('SourceRecordID', input.SourceEntityID, input.SourceRecordID);
    addCheck('TargetRecordID', input.TargetEntityID, input.TargetRecordID);
    if (checks.length === 0) {
        return errors;
    }

    try {
        const results = await RunView.FromMetadataProvider(provider).RunViews(
            checks.map((c) => c.Param),
            user,
        );
        for (let i = 0; i < checks.length; i++) {
            const check = checks[i];
            const res = results[i];
            if (!res?.Success) {
                errors.push(
                    endpointError(
                        check.Field,
                        `Could not verify endpoint record "${check.RecordID}" in entity "${check.EntityName}": ${res?.ErrorMessage ?? 'no result'}.`,
                        check.RecordID,
                    ),
                );
            } else if (res.TotalRowCount === 0) {
                errors.push(
                    endpointError(
                        check.Field,
                        `Endpoint record "${check.RecordID}" in entity "${check.EntityName}" does not exist or is not readable by the caller.`,
                        check.RecordID,
                    ),
                );
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(endpointError('SourceRecordID', `Could not verify graph edge endpoints: ${msg}`, input.SourceRecordID));
    }
    return errors;
}

type EndpointField = 'SourceRecordID' | 'TargetRecordID';

function endpointError(field: string, message: string, value: unknown): ValidationErrorInfo {
    return new ValidationErrorInfo(field, message, value, ValidationErrorType.Failure);
}

/** Columns whose change on an `Approved` edge re-approves a different edge. */
const IDENTITY_FIELDS = ['GraphID', 'EdgeTypeID', 'SourceEntityID', 'SourceRecordID', 'TargetEntityID', 'TargetRecordID'] as const;

/**
 * Server-side `MJ: Graph Edges` entity enforcing Phase G1.3 write-time invariants:
 * - No self-loops
 * - Record ID length <= 400 chars
 * - Refuses an `EdgeTypeID` that is unknown, provider-only (`AllowStored = false`) or scoped to another graph
 * - Enforces `MJ: Graph Edge Type Endpoints` source/target entity constraints via `GraphEngine.Instance.ValidateEdgeEndpoint`
 * - Canonicalizes undirected (`IsDirected = false`) edge endpoint orientation (lower `<entityID>|<recordID>` key first)
 * - Requires new `Inferred` edges to start with `Status = 'Proposed'`
 * - Requires `Graph: Approve Edges` for every approval decision ({@link EvaluateGraphEdgeApproval}) and stamps
 *   `ReviewedByUserID` / `ReviewedAt` into `Attributes`
 * - Verifies `Source` and `Target` endpoint records exist, as the caller, via batched `RunViews` (`count_only`)
 *
 * Every check fails closed: graph metadata that cannot be loaded is a validation error, not a pass.
 */
@RegisterClass(BaseEntity, 'MJ: Graph Edges')
export class MJGraphEdgeEntityServer extends MJGraphEdgeEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        const provider = this.ProviderToUse;
        if (!IsGraphDataProvider(provider)) {
            return this.fail(result, new ValidationErrorInfo('EdgeTypeID', 'Graph edges can only be validated against a metadata provider.', this.EdgeTypeID, ValidationErrorType.Failure));
        }
        const engineError = await this.ensureGraphEngine(provider);
        if (engineError) {
            return this.fail(result, engineError);
        }

        const edgeType = this.resolveEdgeType(this.EdgeTypeID);
        this.canonicalizeUndirectedEndpoints(edgeType);

        const errors = ValidateGraphEdgeInvariants(
            {
                GraphID: this.GraphID,
                EdgeTypeID: this.EdgeTypeID,
                SourceEntityID: this.SourceEntityID,
                SourceRecordID: this.SourceRecordID,
                TargetEntityID: this.TargetEntityID,
                TargetRecordID: this.TargetRecordID,
                Origin: this.Origin,
                Status: this.Status,
                IsSaved: this.IsSaved,
            },
            edgeType,
        );
        if (this.EdgeTypeID && !edgeType) {
            errors.push(new ValidationErrorInfo('EdgeTypeID', `Edge type "${this.EdgeTypeID}" is not a known graph edge type.`, this.EdgeTypeID, ValidationErrorType.Failure));
        }

        const approval = EvaluateGraphEdgeApproval({
            IsSaved: this.IsSaved,
            PreviousStatus: this.previousStatus(),
            NextStatus: this.Status,
            IdentityChanged: this.IsSaved && IDENTITY_FIELDS.some((f) => this.GetFieldByName(f)?.Dirty === true),
            User: this.ContextCurrentUser,
            Authorizations: provider.Authorizations,
        });
        if (approval.Error) {
            errors.push(approval.Error);
        } else if (approval.ShouldStampReview && this.ContextCurrentUser?.ID) {
            this.stampReview(this.ContextCurrentUser.ID);
        }

        if (errors.length === 0 && this.endpointsDirty()) {
            errors.push(
                ...(await CheckGraphEdgeEndpointsExist(
                    {
                        SourceEntityID: this.SourceEntityID,
                        SourceRecordID: this.SourceRecordID,
                        TargetEntityID: this.TargetEntityID,
                        TargetRecordID: this.TargetRecordID,
                    },
                    provider,
                    this.ContextCurrentUser,
                )),
            );
        }

        if (errors.length > 0) {
            result.Errors.push(...errors);
            result.Success = false;
        }
        return result;
    }

    /**
     * Makes sure `GraphEngine` has its edge types and endpoint constraints. `Config` is a no-op once
     * loaded; on a server `BaseEngine` loads it as the system user, so the shared cache never takes
     * this caller's scope. A failure is returned as an error: validating against an empty cache
     * would skip the edge-type checks.
     */
    private async ensureGraphEngine(provider: GraphDataProvider): Promise<ValidationErrorInfo | null> {
        try {
            await GraphEngine.Instance.Config(false, this.ContextCurrentUser, provider);
            return GraphEngine.Instance.Loaded
                ? null
                : new ValidationErrorInfo('EdgeTypeID', 'Graph metadata could not be loaded to validate this edge.', this.EdgeTypeID, ValidationErrorType.Failure);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return new ValidationErrorInfo('EdgeTypeID', `Graph metadata could not be loaded to validate this edge: ${msg}`, this.EdgeTypeID, ValidationErrorType.Failure);
        }
    }

    private canonicalizeUndirectedEndpoints(edgeType: MJGraphEdgeTypeEntity | undefined): void {
        if (!edgeType || edgeType.IsDirected || !this.SourceEntityID || !this.TargetEntityID || !this.SourceRecordID || !this.TargetRecordID) {
            return;
        }
        const canonical = CanonicalizeUndirectedEdgeEndpoints(this.SourceEntityID, this.SourceRecordID, this.TargetEntityID, this.TargetRecordID);
        if (canonical.Swapped) {
            this.SourceEntityID = canonical.SourceEntityID;
            this.SourceRecordID = canonical.SourceRecordID;
            this.TargetEntityID = canonical.TargetEntityID;
            this.TargetRecordID = canonical.TargetRecordID;
        }
    }

    private previousStatus(): MJGraphEdgeEntity['Status'] | null {
        const oldValue: unknown = this.GetFieldByName('Status')?.OldValue;
        return oldValue === 'Approved' || oldValue === 'Proposed' || oldValue === 'Rejected' ? oldValue : null;
    }

    private stampReview(userId: string): void {
        let attrObj: Record<string, unknown> = {};
        if (this.Attributes && this.Attributes.trim().length > 0) {
            try {
                const parsed: unknown = JSON.parse(this.Attributes);
                if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                    attrObj = { ...(parsed as Record<string, unknown>) };
                }
            } catch {
                attrObj = {};
            }
        }
        attrObj['ReviewedByUserID'] = userId;
        attrObj['ReviewedAt'] = new Date().toISOString();
        this.Attributes = JSON.stringify(attrObj);
    }

    private endpointsDirty(): boolean {
        return (
            !this.IsSaved ||
            ['SourceEntityID', 'SourceRecordID', 'TargetEntityID', 'TargetRecordID'].some((f) => this.GetFieldByName(f)?.Dirty === true)
        );
    }

    private fail(result: ValidationResult, error: ValidationErrorInfo): ValidationResult {
        result.Errors.push(error);
        result.Success = false;
        return result;
    }

    private resolveEdgeType(edgeTypeId: string | null | undefined): MJGraphEdgeTypeEntity | undefined {
        if (!edgeTypeId) {
            return undefined;
        }
        return GraphEngine.Instance.EdgeTypes.find((et) => UUIDsEqual(et.ID, edgeTypeId));
    }
}
