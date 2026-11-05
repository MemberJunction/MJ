import {
    BaseEntity,
    EntitySaveOptions,
    IMetadataProvider,
    Metadata,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import {
    BuildGraphNodeKey,
    EvaluateAuthorizationChecks,
    GraphEngine,
    MJGraphEdgeEntity,
    MJGraphEdgeTypeEndpointEntity,
    MJGraphEdgeTypeEntity,
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

const MAX_RECORD_ID_LENGTH = 400;
const GRAPH_APPROVE_EDGES_AUTH = 'Graph: Approve Edges';

/**
 * Server-side `MJ: Graph Edges` entity subclass enforcing semantic graph invariants:
 * - No self-loops (`SourceEntityID === TargetEntityID` and `SourceRecordID === TargetRecordID`)
 * - `SourceRecordID` and `TargetRecordID` length <= 400 characters
 * - EdgeType has `AllowStored = true` and belongs to the edge's `GraphID` (or is global)
 * - Source and Target entities satisfy `MJ: Graph Edge Type Endpoints` constraints (when defined)
 * - Undirected edges (`IsDirected = false`) are normalized to canonical orientation (`sourceKey <= targetKey`)
 * - New `Inferred` edges must be created with `Status = 'Proposed'`
 * - Transitioning an edge to `Status = 'Approved'` requires the `Graph: Approve Edges` authorization
 */
@RegisterClass(BaseEntity, 'MJ: Graph Edges')
export class MJGraphEdgeEntityServer extends MJGraphEdgeEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateEdgeInvariants(result);
        return result;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        this.validateEdgeInvariants(result);
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const validation = this.Validate();
        if (!validation.Success) {
            return false;
        }
        return super.Save(options);
    }

    private validateEdgeInvariants(result: ValidationResult): void {
        this.validateRecordIDLengths(result);
        this.validateNoSelfLoop(result);
        this.validateInferredLifecycleAndAuth(result);

        const edgeType = this.resolveEdgeType();
        if (edgeType) {
            this.validateEdgeTypeScopeAndStorage(edgeType, result);
            if (!edgeType.IsDirected) {
                this.normalizeUndirectedOrientation();
            }
            this.validateEndpointConstraints(edgeType, result);
        }
    }

    private validateRecordIDLengths(result: ValidationResult): void {
        if (this.SourceRecordID && this.SourceRecordID.length > MAX_RECORD_ID_LENGTH) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'SourceRecordID',
                    `SourceRecordID length (${this.SourceRecordID.length}) exceeds the maximum of ${MAX_RECORD_ID_LENGTH} characters.`,
                    this.SourceRecordID,
                    ValidationErrorType.Failure,
                ),
            );
            result.Success = false;
        }
        if (this.TargetRecordID && this.TargetRecordID.length > MAX_RECORD_ID_LENGTH) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'TargetRecordID',
                    `TargetRecordID length (${this.TargetRecordID.length}) exceeds the maximum of ${MAX_RECORD_ID_LENGTH} characters.`,
                    this.TargetRecordID,
                    ValidationErrorType.Failure,
                ),
            );
            result.Success = false;
        }
    }

    private validateNoSelfLoop(result: ValidationResult): void {
        if (!this.SourceEntityID || !this.TargetEntityID || !this.SourceRecordID || !this.TargetRecordID) {
            return;
        }
        const sameEntity = UUIDsEqual(this.SourceEntityID, this.TargetEntityID);
        const sameRecord =
            BuildGraphNodeKey(this.SourceEntityID, this.SourceRecordID) ===
            BuildGraphNodeKey(this.TargetEntityID, this.TargetRecordID);
        if (sameEntity && sameRecord) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'TargetRecordID',
                    'A graph edge cannot connect a record to itself (self-loop).',
                    this.TargetRecordID,
                    ValidationErrorType.Failure,
                ),
            );
            result.Success = false;
        }
    }

    private validateInferredLifecycleAndAuth(result: ValidationResult): void {
        // Rule 1: Newly created Inferred edges must arrive as Proposed
        if (!this.IsSaved && this.Origin === 'Inferred' && this.Status === 'Approved') {
            result.Errors.push(
                new ValidationErrorInfo(
                    'Status',
                    'Inferred graph edges must be created with Status = "Proposed" and reviewed before approval.',
                    this.Status,
                    ValidationErrorType.Failure,
                ),
            );
            result.Success = false;
            return;
        }

        // Rule 2: Transitioning an existing Proposed edge to Approved requires Graph: Approve Edges
        const statusField = this.GetFieldByName('Status');
        const transitioningToApproved =
            this.IsSaved && statusField?.Dirty === true && this.Status === 'Approved';
        if (transitioningToApproved && this.ContextCurrentUser) {
            const md = (this.ProviderToUse as unknown as IMetadataProvider) ?? Metadata.Provider;
            const authorizations = md?.Authorizations ?? [];
            if (authorizations.length > 0) {
                const [check] = EvaluateAuthorizationChecks(
                    [GRAPH_APPROVE_EDGES_AUTH],
                    this.ContextCurrentUser,
                    authorizations,
                );
                if (!check?.Allowed) {
                    result.Errors.push(
                        new ValidationErrorInfo(
                            'Status',
                            `Approving a graph edge requires the "${GRAPH_APPROVE_EDGES_AUTH}" authorization.`,
                            this.Status,
                            ValidationErrorType.Failure,
                        ),
                    );
                    result.Success = false;
                }
            }
        }
    }

    private resolveEdgeType(): MJGraphEdgeTypeEntity | undefined {
        if (!this.EdgeTypeID) {
            return undefined;
        }
        return GraphEngine.Instance.EdgeTypes.find(et => UUIDsEqual(et.ID, this.EdgeTypeID));
    }

    private validateEdgeTypeScopeAndStorage(
        edgeType: MJGraphEdgeTypeEntity,
        result: ValidationResult,
    ): void {
        if (!edgeType.AllowStored) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'EdgeTypeID',
                    `Edge type "${edgeType.Name}" has AllowStored = 0 and is produced exclusively at read time by a GraphEdgeProvider.`,
                    this.EdgeTypeID,
                    ValidationErrorType.Failure,
                ),
            );
            result.Success = false;
        }

        if (edgeType.GraphID != null && this.GraphID && !UUIDsEqual(edgeType.GraphID, this.GraphID)) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'EdgeTypeID',
                    `Edge type "${edgeType.Name}" belongs to a different graph and cannot be used on this graph.`,
                    this.EdgeTypeID,
                    ValidationErrorType.Failure,
                ),
            );
            result.Success = false;
        }
    }

    /**
     * Normalizes undirected edges so the lexicographically smaller `<entityID>|<recordID>` key
     * is stored in `(SourceEntityID, SourceRecordID)`.
     */
    private normalizeUndirectedOrientation(): void {
        if (!this.SourceEntityID || !this.TargetEntityID || !this.SourceRecordID || !this.TargetRecordID) {
            return;
        }
        const sourceKey = BuildGraphNodeKey(this.SourceEntityID, this.SourceRecordID);
        const targetKey = BuildGraphNodeKey(this.TargetEntityID, this.TargetRecordID);
        if (sourceKey > targetKey) {
            const tmpEntityID = this.SourceEntityID;
            const tmpRecordID = this.SourceRecordID;
            this.SourceEntityID = this.TargetEntityID;
            this.SourceRecordID = this.TargetRecordID;
            this.TargetEntityID = tmpEntityID;
            this.TargetRecordID = tmpRecordID;
        }
    }

    private validateEndpointConstraints(
        edgeType: MJGraphEdgeTypeEntity,
        result: ValidationResult,
    ): void {
        const endpoints: MJGraphEdgeTypeEndpointEntity[] =
            GraphEngine.Instance.EdgeTypeEndpoints.filter(ep =>
                UUIDsEqual(ep.EdgeTypeID, edgeType.ID),
            );
        if (endpoints.length === 0) {
            return;
        }

        const sourceAllowed = endpoints.filter(ep => ep.Side === 'Source');
        const targetAllowed = endpoints.filter(ep => ep.Side === 'Target');

        const matchesForward =
            (sourceAllowed.length === 0 ||
                sourceAllowed.some(ep => UUIDsEqual(ep.EntityID, this.SourceEntityID))) &&
            (targetAllowed.length === 0 ||
                targetAllowed.some(ep => UUIDsEqual(ep.EntityID, this.TargetEntityID)));

        if (matchesForward) {
            return;
        }

        // For undirected edges, also check whether the reverse orientation satisfies endpoints
        if (!edgeType.IsDirected) {
            const matchesReverse =
                (sourceAllowed.length === 0 ||
                    sourceAllowed.some(ep => UUIDsEqual(ep.EntityID, this.TargetEntityID))) &&
                (targetAllowed.length === 0 ||
                    targetAllowed.some(ep => UUIDsEqual(ep.EntityID, this.SourceEntityID)));
            if (matchesReverse) {
                return;
            }
        }

        if (
            sourceAllowed.length > 0 &&
            !sourceAllowed.some(ep => UUIDsEqual(ep.EntityID, this.SourceEntityID))
        ) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'SourceEntityID',
                    `SourceEntityID (${this.SourceEntityID}) is not an allowed Source endpoint for edge type "${edgeType.Name}".`,
                    this.SourceEntityID,
                    ValidationErrorType.Failure,
                ),
            );
            result.Success = false;
        }

        if (
            targetAllowed.length > 0 &&
            !targetAllowed.some(ep => UUIDsEqual(ep.EntityID, this.TargetEntityID))
        ) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'TargetEntityID',
                    `TargetEntityID (${this.TargetEntityID}) is not an allowed Target endpoint for edge type "${edgeType.Name}".`,
                    this.TargetEntityID,
                    ValidationErrorType.Failure,
                ),
            );
            result.Success = false;
        }
    }
}
