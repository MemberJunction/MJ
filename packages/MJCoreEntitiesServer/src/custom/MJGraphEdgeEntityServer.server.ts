import {
    AuthorizationInfo,
    BaseEntity,
    IMetadataProvider,
    IRunViewProvider,
    RunView,
    RunViewParams,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    EvaluateAuthorizationChecks,
    FormatGraphNodeKey,
    GraphEngine,
    MJGraphEdgeEntity,
    MJGraphEdgeTypeEntity,
} from '@memberjunction/core-entities';

/** Maximum character length permitted for `SourceRecordID` and `TargetRecordID`. */
export const MAX_GRAPH_EDGE_RECORD_ID_LENGTH = 400;

/** Named authorization governing promotion/rejection of `Proposed` edges. */
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
 * Pure check + review metadata calculation when a `Proposed` edge transitions to `Approved` or `Rejected`.
 */
export function EvaluateGraphEdgeReviewTransition(params: {
    readonly PreviousStatus: MJGraphEdgeEntity['Status'] | null | undefined;
    readonly NextStatus: MJGraphEdgeEntity['Status'] | null | undefined;
    readonly IsSaved: boolean;
    readonly User: UserInfo | undefined;
    readonly Authorizations: AuthorizationInfo[] | undefined;
}): {
    readonly Error: ValidationErrorInfo | null;
    readonly ShouldStampReview: boolean;
} {
    const isPromotionOrRejection =
        params.IsSaved &&
        params.PreviousStatus === 'Proposed' &&
        (params.NextStatus === 'Approved' || params.NextStatus === 'Rejected');

    if (!isPromotionOrRejection) {
        return { Error: null, ShouldStampReview: false };
    }

    if (!params.User) {
        return {
            Error: new ValidationErrorInfo(
                'Status',
                `Approving or rejecting a Proposed graph edge requires an authenticated caller with "${GRAPH_APPROVE_EDGES_AUTHORIZATION}".`,
                params.NextStatus,
                ValidationErrorType.Failure,
            ),
            ShouldStampReview: false,
        };
    }

    const isOwner = params.User.Type && params.User.Type.trim().toLowerCase() === 'owner';
    if (!isOwner && params.Authorizations && params.Authorizations.length > 0) {
        const [check] = EvaluateAuthorizationChecks(
            [GRAPH_APPROVE_EDGES_AUTHORIZATION],
            params.User,
            params.Authorizations,
        );
        if (check && !check.Unknown && !check.Allowed) {
            return {
                Error: new ValidationErrorInfo(
                    'Status',
                    `Caller lacks "${GRAPH_APPROVE_EDGES_AUTHORIZATION}" authorization required to transition a Proposed edge to "${params.NextStatus}".`,
                    params.NextStatus,
                    ValidationErrorType.Failure,
                ),
                ShouldStampReview: false,
            };
        }
    }

    return { Error: null, ShouldStampReview: true };
}

/**
 * Batched `RunViews` (`ResultType: 'count_only'`) existence check for `Source` and `Target` endpoint records.
 */
export async function CheckGraphEdgeEndpointsExist(
    input: {
        readonly SourceEntityID: string | null | undefined;
        readonly SourceRecordID: string | null | undefined;
        readonly TargetEntityID: string | null | undefined;
        readonly TargetRecordID: string | null | undefined;
    },
    provider: (IMetadataProvider & IRunViewProvider) | undefined,
    user: UserInfo | undefined,
): Promise<ValidationErrorInfo[]> {
    if (!provider || !user || !Array.isArray(provider.Entities) || provider.Entities.length === 0) {
        return [];
    }

    const checks: Array<{ Field: 'SourceRecordID' | 'TargetRecordID'; EntityName: string; RecordID: string; Param: RunViewParams }> = [];
    const buildEndpointParam = (
        field: 'SourceRecordID' | 'TargetRecordID',
        entityId: string | null | undefined,
        recordId: string | null | undefined,
    ): void => {
        const trimmedId = recordId?.trim();
        if (!entityId || !trimmedId) {
            return;
        }
        const entityInfo = provider.Entities.find((e) => UUIDsEqual(e.ID, entityId));
        if (!entityInfo || !entityInfo.FirstPrimaryKey?.Name) { // first-pk-ok: Graph edge endpoint record existence check uses FirstPrimaryKey
            return;
        }
        const pkName = entityInfo.FirstPrimaryKey.Name; // first-pk-ok: Graph edge endpoint record existence check uses FirstPrimaryKey
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

    buildEndpointParam('SourceRecordID', input.SourceEntityID, input.SourceRecordID);
    buildEndpointParam('TargetRecordID', input.TargetEntityID, input.TargetRecordID);

    if (checks.length === 0) {
        return [];
    }

    try {
        const rv = RunView.FromMetadataProvider(provider);
        const results = await rv.RunViews(
            checks.map((c) => c.Param),
            user,
        );
        const errors: ValidationErrorInfo[] = [];
        for (let i = 0; i < checks.length; i++) {
            const check = checks[i];
            const res = results[i];
            if (res && res.Success && res.TotalRowCount === 0) {
                errors.push(
                    new ValidationErrorInfo(
                        check.Field,
                        `Endpoint record "${check.RecordID}" in entity "${check.EntityName}" does not exist or is not readable by the caller.`,
                        check.RecordID,
                        ValidationErrorType.Failure,
                    ),
                );
            }
        }
        return errors;
    } catch {
        return [];
    }
}

/**
 * Server-side `MJ: Graph Edges` entity enforcing Phase G1.3 write-time invariants:
 * - No self-loops
 * - Record ID length <= 400 chars
 * - Refuses storing edges of provider-only (`AllowStored = false`) edge types or edge types scoped to another graph
 * - Enforces `MJ: Graph Edge Type Endpoints` source/target entity constraints via `GraphEngine.Instance.ValidateEdgeEndpoint`
 * - Canonicalizes undirected (`IsDirected = false`) edge endpoint orientation (lower `<entityID>|<recordID>` key first)
 * - Requires new `Inferred` edges to start with `Status = 'Proposed'`
 * - Gates `Proposed -> Approved / Rejected` transitions on `Graph: Approve Edges` authorization and stamps `ReviewedByUserID` / `ReviewedAt`
 * - Verifies `Source` and `Target` endpoint records exist via batched `RunViews` (`count_only`)
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

        const provider = this.ProviderToUse as unknown as (IMetadataProvider & IRunViewProvider) | undefined;
        if (GraphEngine.Instance.EdgeTypes.length === 0 && this.ContextCurrentUser && provider) {
            try {
                await GraphEngine.Instance.Config(false, this.ContextCurrentUser, provider);
            } catch {
                // Continue with currently cached metadata if Config cannot run in test harness
            }
        }

        const edgeType = this.resolveEdgeType(this.EdgeTypeID);

        if (
            edgeType &&
            !edgeType.IsDirected &&
            this.SourceEntityID &&
            this.TargetEntityID &&
            this.SourceRecordID &&
            this.TargetRecordID
        ) {
            const canonical = CanonicalizeUndirectedEdgeEndpoints(
                this.SourceEntityID,
                this.SourceRecordID,
                this.TargetEntityID,
                this.TargetRecordID,
            );
            if (canonical.Swapped) {
                this.SourceEntityID = canonical.SourceEntityID;
                this.SourceRecordID = canonical.SourceRecordID;
                this.TargetEntityID = canonical.TargetEntityID;
                this.TargetRecordID = canonical.TargetRecordID;
            }
        }

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

        const statusField = this.GetFieldByName('Status');
        const previousStatus = (statusField?.OldValue as MJGraphEdgeEntity['Status'] | null | undefined) ?? this.Status;
        const reviewTransition = EvaluateGraphEdgeReviewTransition({
            PreviousStatus: previousStatus,
            NextStatus: this.Status,
            IsSaved: this.IsSaved,
            User: this.ContextCurrentUser,
            Authorizations: provider?.Authorizations,
        });
        if (reviewTransition.Error) {
            errors.push(reviewTransition.Error);
        } else if (reviewTransition.ShouldStampReview && this.ContextCurrentUser?.ID) {
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
            if (!attrObj['ReviewedByUserID']) {
                attrObj['ReviewedByUserID'] = this.ContextCurrentUser.ID;
            }
            if (!attrObj['ReviewedAt']) {
                attrObj['ReviewedAt'] = new Date().toISOString();
            }
            this.Attributes = JSON.stringify(attrObj);
        }

        const endpointsDirty =
            !this.IsSaved ||
            Boolean(this.GetFieldByName('SourceEntityID')?.Dirty) ||
            Boolean(this.GetFieldByName('SourceRecordID')?.Dirty) ||
            Boolean(this.GetFieldByName('TargetEntityID')?.Dirty) ||
            Boolean(this.GetFieldByName('TargetRecordID')?.Dirty);

        if (errors.length === 0 && endpointsDirty) {
            const existenceErrors = await CheckGraphEdgeEndpointsExist(
                {
                    SourceEntityID: this.SourceEntityID,
                    SourceRecordID: this.SourceRecordID,
                    TargetEntityID: this.TargetEntityID,
                    TargetRecordID: this.TargetRecordID,
                },
                provider,
                this.ContextCurrentUser,
            );
            errors.push(...existenceErrors);
        }

        if (errors.length > 0) {
            result.Errors.push(...errors);
            result.Success = false;
        }

        return result;
    }

    private resolveEdgeType(edgeTypeId: string | null | undefined): MJGraphEdgeTypeEntity | undefined {
        if (!edgeTypeId) {
            return undefined;
        }
        const targetNorm = NormalizeUUID(edgeTypeId);
        for (const et of GraphEngine.Instance.EdgeTypes) {
            if (NormalizeUUID(et.ID) === targetNorm) {
                return et;
            }
        }
        return undefined;
    }
}

