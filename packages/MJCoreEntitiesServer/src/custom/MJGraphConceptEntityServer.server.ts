import {
    AuthorizationInfo,
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntitySaveOptions,
    ServerOperationScopeManager,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION,
    IsGraphDataProvider,
    MJGraphConceptEntity,
} from '@memberjunction/core-entities';
import { IsSetByTransactionVariable } from './anonymousOwnershipKeyGuard';
import { ApproveEdgesDenialReason } from './MJGraphEdgeEntityServer.server';

const GRAPH_CONCEPTS_ENTITY_NAME = 'MJ: Graph Concepts';

/**
 * Columns whose change on an `Approved` or `Deprecated` `MJ: Graph Concepts` row alters governed
 * canon definition, classification, authority, synonyms, hierarchy, or owning graph.
 */
export const CONCEPT_GOVERNED_FIELDS = [
    'GraphID',
    'ParentID',
    'Name',
    'ConceptTypeID',
    'AuthorityTierID',
    'Description',
    'Specification',
    'Synonyms',
] as const;

/**
 * Inputs to {@link EvaluateGraphConceptApproval}: what is being saved on `MJ: Graph Concepts`,
 * prior stored state, caller, and the authorizations held by the caller's provider.
 */
export interface GraphConceptApprovalInput {
    /** `true` for an update of an existing row, `false` for a create. */
    readonly IsSaved: boolean;
    /** The stored `Status` before this save (`Field.OldValue`); ignored for a create. */
    readonly PreviousStatus: MJGraphConceptEntity['Status'] | null | undefined;
    /** The `Status` being saved. */
    readonly NextStatus: MJGraphConceptEntity['Status'] | null | undefined;
    /** `true` when an update dirties any column listed in {@link CONCEPT_GOVERNED_FIELDS}. */
    readonly GovernedFieldsChanged: boolean;
    /** `true` when `'Status'` or `'ID'` is targeted by a `'Use'` transaction variable (applied after `ValidateAsync`). */
    readonly StatusOrIdSetByVariable?: boolean;
    readonly User: UserInfo | undefined;
    readonly Authorizations: AuthorizationInfo[] | undefined;
    /**
     * `true` when the save runs inside the Content Pipeline's {@link GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION}
     * server operation scope bound to this caller for `'MJ: Graph Concepts'`.
     */
    readonly InPipelineApprovalScope: boolean;
}

function isEditableUnapprovedStatus(status: unknown): status is 'Draft' | 'Proposed' {
    return status === 'Draft' || status === 'Proposed';
}

/**
 * True when saving these concept values is a governance decision that `Graph: Approve Edges` must
 * authorize:
 * - binding `'Status'` or `'ID'` via a `'Use'` transaction variable (applied after `ValidateAsync` runs);
 * - creating a concept whose `Status` does not start `Draft` or `Proposed` (null/undefined uses the
 *   database column default `'Draft'`, so those stay ungated; `'Approved'` and `'Deprecated'` require it);
 * - changing `Status` into or out of `'Approved'` or `'Deprecated'` (only `Draft <-> Proposed` stays ungated);
 * - editing any governed field on a concept whose status is `'Approved'` or `'Deprecated'`.
 *
 * Fails closed when `IsSaved` is `true` and `PreviousStatus` is unknown.
 */
export function GraphConceptSaveNeedsApproval(input: GraphConceptApprovalInput): boolean {
    if (input.StatusOrIdSetByVariable) {
        return true;
    }
    if (!input.IsSaved) {
        const effectiveNext = input.NextStatus === null || input.NextStatus === undefined ? 'Draft' : input.NextStatus;
        return !isEditableUnapprovedStatus(effectiveNext);
    }
    if (!input.PreviousStatus) {
        return true;
    }
    if (input.PreviousStatus !== input.NextStatus) {
        return !(isEditableUnapprovedStatus(input.PreviousStatus) && isEditableUnapprovedStatus(input.NextStatus));
    }
    return !isEditableUnapprovedStatus(input.PreviousStatus) && input.GovernedFieldsChanged;
}

/**
 * True when the Content Pipeline `Graph` stage is creating a brand-new `Approved` concept inside its
 * {@link GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION} server scope. Edits to existing concepts, status
 * transitions, deprecations, and variable-driven `Status`/`ID` mutations are never covered by this scope.
 */
export function IsPipelinePolicyApprovedConceptCreate(input: GraphConceptApprovalInput): boolean {
    return input.InPipelineApprovalScope && !input.IsSaved && input.NextStatus === 'Approved' && !input.StatusOrIdSetByVariable;
}

/**
 * Pure fail-closed gate for `MJ: Graph Concepts` approval, deprecation/rejection, and edits to
 * governed concepts (see {@link GraphConceptSaveNeedsApproval}).
 */
export function EvaluateGraphConceptApproval(input: GraphConceptApprovalInput): ValidationErrorInfo | null {
    if (!GraphConceptSaveNeedsApproval(input) || IsPipelinePolicyApprovedConceptCreate(input)) {
        return null;
    }
    const denial = ApproveEdgesDenialReason(input.User, input.Authorizations);
    if (!denial) {
        return null;
    }
    return new ValidationErrorInfo(
        'Status',
        `Saving this graph concept as "${input.NextStatus ?? ''}" or modifying a governed concept ${denial}. ` +
            'Save new or unratified concepts as "Draft" or "Proposed" for a steward instead.',
        input.NextStatus,
        ValidationErrorType.Failure,
    );
}

/**
 * Refusal message for deleting an `MJ: Graph Concepts` row whose stored `Status` is `storedStatus`,
 * or `null` when allowed. Only `'Draft'` and `'Proposed'` concepts may be deleted without
 * `Graph: Approve Edges` (keeping `'Deprecated'` tombstones intact so rejected names remain
 * skipped by proposers).
 */
export function GraphConceptDeleteRefusal(
    storedStatus: MJGraphConceptEntity['Status'] | null | undefined,
    user: UserInfo | undefined,
    authorizations: AuthorizationInfo[] | undefined,
): string | null {
    if (isEditableUnapprovedStatus(storedStatus)) {
        return null;
    }
    const denial = ApproveEdgesDenialReason(user, authorizations);
    if (!denial) {
        return null;
    }
    const label = storedStatus ? `"${storedStatus}"` : 'unknown-status';
    return `Deleting a ${label} graph concept is a governance decision and ${denial}.`;
}

/**
 * True while the current async call chain is inside {@link GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION}
 * scoped to `'MJ: Graph Concepts'` for `user`. Client CRUD boundaries mask every outer scope.
 */
export function IsInGraphConceptPipelineApprovalScope(user: UserInfo | undefined): boolean {
    if (!user) {
        return false;
    }
    return ServerOperationScopeManager.Instance.IsOperationActive([GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION], GRAPH_CONCEPTS_ENTITY_NAME, user);
}

/**
 * Server-side `MJ: Graph Concepts` entity enforcing Workstream 5a governance:
 * - Creating an `Approved` or `Deprecated` concept, approving/deprecating a concept, editing a
 *   governed field on an `Approved`/`Deprecated` concept, or deleting an `Approved`/`Deprecated`
 *   concept requires `Graph: Approve Edges` ({@link EvaluateGraphConceptApproval},
 *   {@link GraphConceptDeleteRefusal});
 * - The Content Pipeline `Graph` stage (`EntityGraphOverlayStore.UpsertConcept`) is permitted to
 *   create new policy-approved concepts inside {@link GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION}
 *   ({@link IsPipelinePolicyApprovedConceptCreate}), while never editing or deprecating existing
 *   governed concepts.
 */
@RegisterClass(BaseEntity, 'MJ: Graph Concepts')
export class MJGraphConceptEntityServer extends MJGraphConceptEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        const error = this.evaluateApprovalError();
        if (error) {
            result.Errors.push(error);
            result.Success = false;
        }
        return result;
    }

    /** Enforces the same governance gate when `ReplayOnly` or `SkipAsyncValidation` would skip `ValidateAsync`. */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (options?.ReplayOnly || options?.SkipAsyncValidation) {
            const error = this.evaluateApprovalError();
            if (error) {
                return this.refuseOperation(this.IsSaved ? 'update' : 'create', error.Message);
            }
        }
        return super.Save(options);
    }

    /**
     * Refuses deleting an `Approved`, `Deprecated`, or unknown/unloaded stored-status concept without
     * `Graph: Approve Edges`. Saved records read stored `Status` (`OldValue`) and never fall back to
     * in-memory `Status`.
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const provider = this.ProviderToUse;
        const authorizations = IsGraphDataProvider(provider) ? provider.Authorizations : undefined;
        const storedStatus = this.IsSaved ? this.previousStatus() : this.Status;
        const refusal = GraphConceptDeleteRefusal(storedStatus, this.ContextCurrentUser, authorizations);
        if (refusal) {
            return this.refuseOperation('delete', refusal);
        }
        return super.Delete(options);
    }

    private evaluateApprovalError(): ValidationErrorInfo | null {
        const provider = this.ProviderToUse;
        if (!IsGraphDataProvider(provider)) {
            return new ValidationErrorInfo(
                'Status',
                'Graph concepts can only be validated against a metadata provider.',
                this.Status,
                ValidationErrorType.Failure,
            );
        }

        const governedFieldsChanged =
            this.IsSaved &&
            (CONCEPT_GOVERNED_FIELDS.some((f) => this.GetFieldByName(f)?.Dirty === true) ||
                IsSetByTransactionVariable(this, CONCEPT_GOVERNED_FIELDS));

        return EvaluateGraphConceptApproval({
            IsSaved: this.IsSaved,
            PreviousStatus: this.previousStatus(),
            NextStatus: this.Status,
            GovernedFieldsChanged: governedFieldsChanged,
            StatusOrIdSetByVariable: IsSetByTransactionVariable(this, ['Status', 'ID']),
            User: this.ContextCurrentUser,
            Authorizations: provider.Authorizations,
            InPipelineApprovalScope: IsInGraphConceptPipelineApprovalScope(this.ContextCurrentUser),
        });
    }

    private refuseOperation(type: BaseEntityResult['Type'], message: string): false {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }

    private previousStatus(): MJGraphConceptEntity['Status'] | null {
        const field = this.GetFieldByName('Status');
        if (field?.NotLoaded) {
            return null;
        }
        const oldValue: unknown = field?.OldValue;
        return oldValue === 'Approved' || oldValue === 'Deprecated' || oldValue === 'Draft' || oldValue === 'Proposed'
            ? oldValue
            : null;
    }
}
