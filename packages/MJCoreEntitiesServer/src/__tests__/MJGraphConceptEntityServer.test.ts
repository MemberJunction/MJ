/**
 * Unit tests for `MJGraphConceptEntityServer.server.ts`: pure fail-closed governance rules
 * (`GraphConceptSaveNeedsApproval`, `EvaluateGraphConceptApproval`, `GraphConceptDeleteRefusal`),
 * Content Pipeline approval scope, client CRUD boundary masking, and `ValidateAsync` / `Delete`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    AuthorizationInfo,
    AuthorizationRoleInfo,
    type IMetadataProvider,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
    ServerOperationScopeManager,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import {
    GRAPH_APPROVE_EDGES_AUTHORIZATION,
    GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION,
    type MJGraphConceptEntity,
} from '@memberjunction/core-entities';

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    const core = await import('@memberjunction/core');

    /** Settable stand-in for generated `MJGraphConceptEntity`; base validation always succeeds. */
    class MockMJGraphConceptEntity {
        public ID = '';
        public GraphID = '';
        public ParentID: string | null = null;
        public Name = '';
        public ConceptTypeID = '';
        public AuthorityTierID: string | null = null;
        public Description = '';
        public Specification: string | null = null;
        public Synonyms: string | null = null;
        public Status: MJGraphConceptEntity['Status'] = 'Draft';
        public IsSaved = false;
        public ContextCurrentUser: UserInfo | undefined;
        public ProviderToUse: object | undefined;
        public TransactionGroup?: { Variables: Array<{ EntityObject: object; Type: string; FieldName: string }> };
        public FieldState: Record<string, { Dirty: boolean; OldValue: unknown; NotLoaded?: boolean }> = {};
        public GetFieldByName(name: string): { Dirty: boolean; OldValue: unknown; NotLoaded?: boolean } | undefined {
            return this.FieldState[name];
        }
        public async ValidateAsync(): Promise<InstanceType<typeof core.ValidationResult>> {
            const r = new core.ValidationResult();
            r.Success = true;
            return r;
        }
        public SaveCalls = 0;
        public async Save(): Promise<boolean> {
            this.SaveCalls++;
            return true;
        }
        public DeleteCalls = 0;
        public async Delete(): Promise<boolean> {
            this.DeleteCalls++;
            return true;
        }
        public ResultHistory: Array<InstanceType<typeof core.BaseEntityResult>> = [];
        public RegisterResultHistoryEntry(result: InstanceType<typeof core.BaseEntityResult>): void {
            this.ResultHistory.push(result);
        }
        public get LatestResult(): InstanceType<typeof core.BaseEntityResult> | undefined {
            return this.ResultHistory[this.ResultHistory.length - 1];
        }
    }

    return {
        ...actual,
        MJGraphConceptEntity: MockMJGraphConceptEntity,
    };
});

import {
    CONCEPT_GOVERNED_FIELDS,
    EvaluateGraphConceptApproval,
    GraphConceptDeleteRefusal,
    GraphConceptSaveNeedsApproval,
    IsPipelinePolicyApprovedConceptCreate,
    MJGraphConceptEntityServer,
    type GraphConceptApprovalInput,
} from '../custom/MJGraphConceptEntityServer.server';

const APPROVE_AUTH_ID = 'F0000001-0000-0000-0000-000000000002';
const STAFF_ROLE_ID = 'F0000002-0000-0000-0000-000000000001';
const CURATOR_ROLE_ID = 'F0000002-0000-0000-0000-000000000002';

function userWithRoles(id: string, roleIds: string[], type: UserInfo['Type'] = 'User'): UserInfo {
    return {
        ID: id,
        Name: id,
        Email: `${id}@example.com`,
        Type: type,
        UserRoles: roleIds.map((RoleID) => ({ UserID: id, RoleID, RoleName: RoleID })),
    } as unknown as UserInfo;
}

const staff = userWithRoles('u-staff', [STAFF_ROLE_ID]);
const curator = userWithRoles('u-curator', [CURATOR_ROLE_ID]);

function makeApproveAuthorizations(): AuthorizationInfo[] {
    const owningProvider = {
        AuthorizationRoles: [
            new AuthorizationRoleInfo({ ID: 'ar-concept-1', AuthorizationID: APPROVE_AUTH_ID, RoleID: CURATOR_ROLE_ID, Type: 'Allow' }),
        ],
    } as unknown as IMetadataProvider;
    return [
        new AuthorizationInfo(
            { ID: APPROVE_AUTH_ID, Name: GRAPH_APPROVE_EDGES_AUTHORIZATION, ParentID: null, IsActive: true },
            owningProvider,
        ),
    ];
}

function makeProvider(authorizations: AuthorizationInfo[] = []): object {
    return {
        Entities: [],
        Authorizations: authorizations,
        EntityByName: () => undefined,
        EntityByID: () => undefined,
        RunView: async (): Promise<RunViewResult> => ({
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 0,
            ErrorMessage: '',
            UserViewRunID: '',
        }),
        RunViews: async (_params: RunViewParams[]): Promise<RunViewResult[]> => [],
        RunQuery: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' }),
    };
}

function approvalInput(overrides: Partial<GraphConceptApprovalInput> = {}): GraphConceptApprovalInput {
    return {
        IsSaved: true,
        PreviousStatus: 'Proposed',
        NextStatus: 'Approved',
        GovernedFieldsChanged: false,
        User: staff,
        Authorizations: makeApproveAuthorizations(),
        InPipelineApprovalScope: false,
        ...overrides,
    };
}

describe('MJGraphConceptEntityServer governance rules', () => {
    it('lets anyone create Draft or Proposed concepts (including DB default null/undefined)', () => {
        for (const NextStatus of ['Draft', 'Proposed', null, undefined] as const) {
            const input = approvalInput({ IsSaved: false, PreviousStatus: null, NextStatus });
            expect(GraphConceptSaveNeedsApproval(input)).toBe(false);
            expect(EvaluateGraphConceptApproval(input)).toBeNull();
        }
    });

    it('gates creating Approved or Deprecated concepts behind Graph: Approve Edges', () => {
        for (const NextStatus of ['Approved', 'Deprecated'] as const) {
            const byStaff = approvalInput({ IsSaved: false, PreviousStatus: null, NextStatus, User: staff });
            expect(GraphConceptSaveNeedsApproval(byStaff)).toBe(true);
            const error = EvaluateGraphConceptApproval(byStaff);
            expect(error).not.toBeNull();
            expect(error!.Message).toContain(GRAPH_APPROVE_EDGES_AUTHORIZATION);

            const byCurator = { ...byStaff, User: curator };
            expect(EvaluateGraphConceptApproval(byCurator)).toBeNull();
        }
    });

    it('permits Draft <-> Proposed transitions without Graph: Approve Edges', () => {
        expect(GraphConceptSaveNeedsApproval(approvalInput({ PreviousStatus: 'Draft', NextStatus: 'Proposed' }))).toBe(false);
        expect(GraphConceptSaveNeedsApproval(approvalInput({ PreviousStatus: 'Proposed', NextStatus: 'Draft' }))).toBe(false);
    });

    it('gates every transition to or from Approved or Deprecated', () => {
        const gatedPairs: Array<[MJGraphConceptEntity['Status'], MJGraphConceptEntity['Status']]> = [
            ['Draft', 'Approved'],
            ['Proposed', 'Approved'],
            ['Draft', 'Deprecated'],
            ['Proposed', 'Deprecated'],
            ['Approved', 'Proposed'],
            ['Approved', 'Draft'],
            ['Approved', 'Deprecated'],
            ['Deprecated', 'Proposed'],
            ['Deprecated', 'Draft'],
            ['Deprecated', 'Approved'],
        ];
        for (const [PreviousStatus, NextStatus] of gatedPairs) {
            const byStaff = approvalInput({ PreviousStatus, NextStatus, User: staff });
            expect(GraphConceptSaveNeedsApproval(byStaff)).toBe(true);
            expect(EvaluateGraphConceptApproval(byStaff)).not.toBeNull();
            expect(EvaluateGraphConceptApproval({ ...byStaff, User: curator })).toBeNull();
        }
    });

    it('gates editing governed fields on Approved or Deprecated concepts, while permitting Draft/Proposed edits', () => {
        expect(GraphConceptSaveNeedsApproval(approvalInput({ PreviousStatus: 'Approved', NextStatus: 'Approved', GovernedFieldsChanged: true }))).toBe(true);
        expect(GraphConceptSaveNeedsApproval(approvalInput({ PreviousStatus: 'Deprecated', NextStatus: 'Deprecated', GovernedFieldsChanged: true }))).toBe(true);
        expect(GraphConceptSaveNeedsApproval(approvalInput({ PreviousStatus: 'Approved', NextStatus: 'Approved', GovernedFieldsChanged: false }))).toBe(false);
        expect(GraphConceptSaveNeedsApproval(approvalInput({ PreviousStatus: 'Draft', NextStatus: 'Draft', GovernedFieldsChanged: true }))).toBe(false);
        expect(GraphConceptSaveNeedsApproval(approvalInput({ PreviousStatus: 'Proposed', NextStatus: 'Proposed', GovernedFieldsChanged: true }))).toBe(false);
    });

    it('fails closed when PreviousStatus is missing on an update, when User is missing, or when authorizations are unseeded', () => {
        expect(EvaluateGraphConceptApproval(approvalInput({ PreviousStatus: null, NextStatus: 'Proposed' }))).not.toBeNull();
        expect(EvaluateGraphConceptApproval(approvalInput({ User: undefined }))).not.toBeNull();
        expect(EvaluateGraphConceptApproval(approvalInput({ User: curator, Authorizations: [] }))).not.toBeNull();
    });

    it('allows only new Approved concept creates inside the pipeline scope', () => {
        expect(IsPipelinePolicyApprovedConceptCreate(approvalInput({ IsSaved: false, PreviousStatus: null, NextStatus: 'Approved', InPipelineApprovalScope: true }))).toBe(true);
        expect(EvaluateGraphConceptApproval(approvalInput({ IsSaved: false, PreviousStatus: null, NextStatus: 'Approved', InPipelineApprovalScope: true, User: staff }))).toBeNull();

        // Pipeline scope must NEVER allow status changes, deprecations, or edits to existing concepts
        expect(EvaluateGraphConceptApproval(approvalInput({ IsSaved: true, PreviousStatus: 'Proposed', NextStatus: 'Approved', InPipelineApprovalScope: true, User: staff }))).not.toBeNull();
        expect(EvaluateGraphConceptApproval(approvalInput({ IsSaved: true, PreviousStatus: 'Approved', NextStatus: 'Approved', GovernedFieldsChanged: true, InPipelineApprovalScope: true, User: staff }))).not.toBeNull();
        expect(EvaluateGraphConceptApproval(approvalInput({ IsSaved: false, PreviousStatus: null, NextStatus: 'Deprecated', InPipelineApprovalScope: true, User: staff }))).not.toBeNull();

        // Pipeline scope must NEVER exempt variable-driven Status or ID mutations
        expect(IsPipelinePolicyApprovedConceptCreate(approvalInput({ IsSaved: false, NextStatus: 'Approved', InPipelineApprovalScope: true, StatusOrIdSetByVariable: true }))).toBe(false);
        expect(EvaluateGraphConceptApproval(approvalInput({ IsSaved: false, NextStatus: 'Approved', InPipelineApprovalScope: true, StatusOrIdSetByVariable: true, User: staff }))).not.toBeNull();
    });

    it('gates deleting Approved, Deprecated, or unknown-status concepts behind Graph: Approve Edges', () => {
        const auths = makeApproveAuthorizations();
        expect(GraphConceptDeleteRefusal('Draft', staff, auths)).toBeNull();
        expect(GraphConceptDeleteRefusal('Proposed', staff, auths)).toBeNull();
        expect(GraphConceptDeleteRefusal('Approved', staff, auths)).toContain(GRAPH_APPROVE_EDGES_AUTHORIZATION);
        expect(GraphConceptDeleteRefusal('Deprecated', staff, auths)).toContain(GRAPH_APPROVE_EDGES_AUTHORIZATION);
        expect(GraphConceptDeleteRefusal(null, staff, auths)).toContain(GRAPH_APPROVE_EDGES_AUTHORIZATION);
        expect(GraphConceptDeleteRefusal('Approved', curator, auths)).toBeNull();
        expect(GraphConceptDeleteRefusal('Deprecated', curator, auths)).toBeNull();
    });
});

describe('MJGraphConceptEntityServer.ValidateAsync & Delete', () => {
    function makeConcept(status: MJGraphConceptEntity['Status'], user: UserInfo, authorizations: AuthorizationInfo[] = makeApproveAuthorizations()): MJGraphConceptEntityServer {
        const concept = new MJGraphConceptEntityServer();
        concept.GraphID = 'E0000001-0000-0000-0000-000000000001';
        concept.Name = 'Test Concept';
        concept.ConceptTypeID = 'C0000001-0000-0000-0000-000000000001';
        concept.Description = 'Concise description.';
        concept.Status = status;
        const internal = concept as unknown as { IsSaved: boolean; ContextCurrentUser: UserInfo; ProviderToUse: object };
        internal.IsSaved = false;
        internal.ContextCurrentUser = user;
        internal.ProviderToUse = makeProvider(authorizations);
        return concept;
    }

    function markSaved(concept: MJGraphConceptEntityServer, previousStatus: MJGraphConceptEntity['Status'], dirty: string[] = []): void {
        const internal = concept as unknown as { IsSaved: boolean; FieldState: Record<string, { Dirty: boolean; OldValue: unknown }> };
        internal.IsSaved = true;
        internal.FieldState = {
            Status: { Dirty: previousStatus !== concept.Status, OldValue: previousStatus },
        };
        for (const f of dirty) {
            internal.FieldState[f] = { Dirty: true, OldValue: 'old' };
        }
    }

    function inConceptPipelineScope<T>(user: UserInfo, work: () => Promise<T>): Promise<T> {
        return ServerOperationScopeManager.Instance.RunWithAuthority(
            { operationKey: GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Graph Concepts'], userId: user.ID },
            work,
        );
    }

    function deleteCalls(concept: MJGraphConceptEntityServer): number {
        return (concept as unknown as { DeleteCalls: number }).DeleteCalls;
    }

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('refuses creating Approved/Deprecated concepts without authorization and allows Proposed', async () => {
        const approved = await makeConcept('Approved', staff).ValidateAsync();
        expect(approved.Success).toBe(false);
        expect(approved.Errors.some((e) => e.Source === 'Status' && e.Message.includes(GRAPH_APPROVE_EDGES_AUTHORIZATION))).toBe(true);

        const deprecated = await makeConcept('Deprecated', staff).ValidateAsync();
        expect(deprecated.Success).toBe(false);

        const proposed = await makeConcept('Proposed', staff).ValidateAsync();
        expect(proposed.Success).toBe(true);
    });

    it('accepts new Approved concepts inside the pipeline scope and masks it inside ClientCrudBoundary', async () => {
        const ok = await inConceptPipelineScope(staff, () => makeConcept('Approved', staff).ValidateAsync());
        expect(ok.Success).toBe(true);

        const wrongUser = await inConceptPipelineScope(curator, () => makeConcept('Approved', staff).ValidateAsync());
        expect(wrongUser.Success).toBe(false);

        const edgeOnlyScope = await ServerOperationScopeManager.Instance.RunWithAuthority(
            { operationKey: GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Graph Edges'], userId: staff.ID },
            () => makeConcept('Approved', staff).ValidateAsync(),
        );
        expect(edgeOnlyScope.Success).toBe(false);

        const maskedApi = await inConceptPipelineScope(staff, () =>
            ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => makeConcept('Approved', staff).ValidateAsync()),
        );
        expect(maskedApi.Success).toBe(false);
    });

    it('gates editing every CONCEPT_GOVERNED_FIELDS column on Approved concepts without authorization', async () => {
        for (const field of CONCEPT_GOVERNED_FIELDS) {
            const byStaff = makeConcept('Approved', staff);
            markSaved(byStaff, 'Approved', [field]);
            const denied = await byStaff.ValidateAsync();
            expect(denied.Success).toBe(false);

            const byCurator = makeConcept('Approved', curator);
            markSaved(byCurator, 'Approved', [field]);
            const allowed = await byCurator.ValidateAsync();
            expect(allowed.Success).toBe(true);
        }
    });

    it('refuses rejecting/deprecating a Proposed concept without authorization and allows curators', async () => {
        const byStaff = makeConcept('Deprecated', staff);
        markSaved(byStaff, 'Proposed');
        expect((await byStaff.ValidateAsync()).Success).toBe(false);

        const byCurator = makeConcept('Deprecated', curator);
        markSaved(byCurator, 'Proposed');
        expect((await byCurator.ValidateAsync()).Success).toBe(true);
    });

    it('fails closed when provider is not a GraphDataProvider', async () => {
        const concept = makeConcept('Proposed', staff);
        (concept as unknown as { ProviderToUse: object }).ProviderToUse = { Entities: [] };
        const res = await concept.ValidateAsync();
        expect(res.Success).toBe(false);
        expect(res.Errors[0].Type).toBe(ValidationErrorType.Failure);
    });

    it('refuses deleting Approved or Deprecated concepts without authorization; Proposed or curator succeeds', async () => {
        const approvedByStaff = makeConcept('Approved', staff);
        markSaved(approvedByStaff, 'Approved');
        expect(await approvedByStaff.Delete()).toBe(false);
        expect(deleteCalls(approvedByStaff)).toBe(0);
        expect(approvedByStaff.LatestResult?.Message).toContain(GRAPH_APPROVE_EDGES_AUTHORIZATION);

        const deprecatedByStaff = makeConcept('Deprecated', staff);
        markSaved(deprecatedByStaff, 'Deprecated');
        expect(await deprecatedByStaff.Delete()).toBe(false);
        expect(deleteCalls(deprecatedByStaff)).toBe(0);

        const proposedByStaff = makeConcept('Proposed', staff);
        markSaved(proposedByStaff, 'Proposed');
        expect(await proposedByStaff.Delete()).toBe(true);
        expect(deleteCalls(proposedByStaff)).toBe(1);

        const approvedByCurator = makeConcept('Approved', curator);
        markSaved(approvedByCurator, 'Approved');
        expect(await approvedByCurator.Delete()).toBe(true);
        expect(deleteCalls(approvedByCurator)).toBe(1);
    });

    it('gates TransactionGroup Use variables on Status, ID, or governed fields of governed concepts while allowing FK bindings on new Proposed concepts', async () => {
        for (const varField of ['Status', 'ID'] as const) {
            const createProposedWithVar = makeConcept('Proposed', staff);
            (createProposedWithVar as unknown as { TransactionGroup: { Variables: Array<{ EntityObject: object; Type: string; FieldName: string }> } }).TransactionGroup = {
                Variables: [{ EntityObject: createProposedWithVar, Type: 'Use', FieldName: varField }],
            };
            expect((await createProposedWithVar.ValidateAsync()).Success).toBe(false);

            const scopedCreateWithVar = makeConcept('Approved', staff);
            (scopedCreateWithVar as unknown as { TransactionGroup: { Variables: Array<{ EntityObject: object; Type: string; FieldName: string }> } }).TransactionGroup = {
                Variables: [{ EntityObject: scopedCreateWithVar, Type: 'Use', FieldName: varField }],
            };
            const inScopeRes = await inConceptPipelineScope(staff, () => scopedCreateWithVar.ValidateAsync());
            expect(inScopeRes.Success).toBe(false);

            const curatorWithVar = makeConcept('Proposed', curator);
            (curatorWithVar as unknown as { TransactionGroup: { Variables: Array<{ EntityObject: object; Type: string; FieldName: string }> } }).TransactionGroup = {
                Variables: [{ EntityObject: curatorWithVar, Type: 'Use', FieldName: varField }],
            };
            expect((await curatorWithVar.ValidateAsync()).Success).toBe(true);
        }

        // Creating a Proposed concept whose GraphID/ParentID comes from a TransactionVariable remains allowed
        const newProposedWithFkVar = makeConcept('Proposed', staff);
        (newProposedWithFkVar as unknown as { TransactionGroup: { Variables: Array<{ EntityObject: object; Type: string; FieldName: string }> } }).TransactionGroup = {
            Variables: [{ EntityObject: newProposedWithFkVar, Type: 'Use', FieldName: 'GraphID' }],
        };
        expect((await newProposedWithFkVar.ValidateAsync()).Success).toBe(true);

        // Updating an Approved concept via a TransactionVariable on a governed field is gated even when Dirty is false
        const approvedWithDescVar = makeConcept('Approved', staff);
        markSaved(approvedWithDescVar, 'Approved');
        (approvedWithDescVar as unknown as { TransactionGroup: { Variables: Array<{ EntityObject: object; Type: string; FieldName: string }> } }).TransactionGroup = {
            Variables: [{ EntityObject: approvedWithDescVar, Type: 'Use', FieldName: 'Description' }],
        };
        expect((await approvedWithDescVar.ValidateAsync()).Success).toBe(false);
    });

    it('enforces approval on Save when ReplayOnly or SkipAsyncValidation is passed', async () => {
        for (const opts of [{ ReplayOnly: true }, { SkipAsyncValidation: true }] as const) {
            const unauthorized = makeConcept('Approved', staff);
            expect(await unauthorized.Save(opts)).toBe(false);
            expect((unauthorized as unknown as { SaveCalls: number }).SaveCalls).toBe(0);
            expect(unauthorized.LatestResult?.Message).toContain(GRAPH_APPROVE_EDGES_AUTHORIZATION);

            const authorized = makeConcept('Approved', curator);
            expect(await authorized.Save(opts)).toBe(true);
            expect((authorized as unknown as { SaveCalls: number }).SaveCalls).toBe(1);
        }
    });

    it('fails closed on Delete for saved records when Status is NotLoaded or OldValue is missing', async () => {
        const notLoadedConcept = makeConcept('Draft', staff);
        const internalNotLoaded = notLoadedConcept as unknown as { IsSaved: boolean; FieldState: Record<string, { Dirty: boolean; OldValue: unknown; NotLoaded?: boolean }> };
        internalNotLoaded.IsSaved = true;
        internalNotLoaded.FieldState = { Status: { Dirty: false, OldValue: undefined, NotLoaded: true } };
        expect(await notLoadedConcept.Delete()).toBe(false);
        expect(deleteCalls(notLoadedConcept)).toBe(0);
        expect(notLoadedConcept.LatestResult?.Message).toContain(GRAPH_APPROVE_EDGES_AUTHORIZATION);

        const missingOldValueConcept = makeConcept('Proposed', staff);
        const internalMissing = missingOldValueConcept as unknown as { IsSaved: boolean; FieldState: Record<string, { Dirty: boolean; OldValue: unknown }> };
        internalMissing.IsSaved = true;
        internalMissing.FieldState = {};
        expect(await missingOldValueConcept.Delete()).toBe(false);
        expect(deleteCalls(missingOldValueConcept)).toBe(0);

        // Curator is allowed to delete even when stored Status is unknown/NotLoaded
        const curatorMissing = makeConcept('Draft', curator);
        const internalCurator = curatorMissing as unknown as { IsSaved: boolean; FieldState: Record<string, { Dirty: boolean; OldValue: unknown; NotLoaded?: boolean }> };
        internalCurator.IsSaved = true;
        internalCurator.FieldState = { Status: { Dirty: false, OldValue: undefined, NotLoaded: true } };
        expect(await curatorMissing.Delete()).toBe(true);
        expect(deleteCalls(curatorMissing)).toBe(1);
    });
});

// Keep ValidationResult referenced alongside dynamic vitest mock factory.
void ValidationResult;
