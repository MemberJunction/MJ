/**
 * Unit tests for `MJGraphEdgeEntityServer.server.ts`: the pure write-time invariants, the fail-closed
 * approval gate (`Graph: Approve Edges`), the endpoint existence check, and `ValidateAsync` itself.
 *
 * `ValidateAsync` runs against a settable stand-in for the generated `MJGraphEdgeEntity` base and a
 * stub `GraphEngine` (both dependencies of the unit, not the unit). Authorizations are real
 * `AuthorizationInfo` objects resolving their role grants through an owning provider, so the gate is
 * evaluated by MJ's own `EvaluateAuthorizationChecks`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    AuthorizationInfo,
    AuthorizationRoleInfo,
    type EntityInfo,
    type IMetadataProvider,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
    ServerOperationScopeManager,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION, type MJGraphEdgeTypeEntity } from '@memberjunction/core-entities';

interface EngineStub {
    EdgeTypes: Array<Pick<MJGraphEdgeTypeEntity, 'ID' | 'Name' | 'GraphID' | 'IsDirected' | 'AllowStored'>>;
    Loaded: boolean;
    ConfigCalls: Array<{ User: UserInfo | undefined }>;
    Config: (force: boolean, user: UserInfo | undefined) => Promise<void>;
    ValidateEdgeEndpoint: (edgeTypeId: string, side: 'Source' | 'Target', entityId: string) => boolean;
}

const engine = vi.hoisted((): EngineStub => {
    const stub: EngineStub = {
        EdgeTypes: [],
        Loaded: true,
        ConfigCalls: [],
        Config: async (_force, user) => {
            stub.ConfigCalls.push({ User: user });
        },
        ValidateEdgeEndpoint: () => true,
    };
    return stub;
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    const core = await import('@memberjunction/core');

    /** Settable stand-in for the generated `MJGraphEdgeEntity`; its own validation always passes. */
    class MockMJGraphEdgeEntity {
        public ID = '';
        public GraphID = '';
        public EdgeTypeID = '';
        public SourceEntityID = '';
        public SourceRecordID = '';
        public TargetEntityID = '';
        public TargetRecordID = '';
        public Weight = 1;
        public Description: string | null = null;
        public Attributes: string | null = null;
        public Origin: 'Declared' | 'Inferred' = 'Declared';
        public Status: 'Approved' | 'Proposed' | 'Rejected' = 'Proposed';
        public Confidence: number | null = null;
        public IsSaved = false;
        public ContextCurrentUser: UserInfo | undefined;
        public ProviderToUse: object | undefined;
        public FieldState: Record<string, { Dirty: boolean; OldValue: unknown }> = {};
        public GetFieldByName(name: string): { Dirty: boolean; OldValue: unknown } | undefined {
            return this.FieldState[name];
        }
        public async ValidateAsync(): Promise<InstanceType<typeof core.ValidationResult>> {
            const r = new core.ValidationResult();
            r.Success = true;
            return r;
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
        MJGraphEdgeEntity: MockMJGraphEdgeEntity,
        GraphEngine: { Instance: engine },
    };
});

import {
    CanonicalizeUndirectedEdgeEndpoints,
    CheckGraphEdgeEndpointsExist,
    EvaluateGraphEdgeApproval,
    GRAPH_APPROVE_EDGES_AUTHORIZATION,
    GraphEdgeSaveNeedsApproval,
    MAX_GRAPH_EDGE_RECORD_ID_LENGTH,
    MJGraphEdgeEntityServer,
    ValidateGraphEdgeInvariants,
    type GraphEdgeApprovalInput,
    type GraphEdgeValidationInput,
} from '../custom/MJGraphEdgeEntityServer.server';

const GRAPH_ID = 'E0000001-0000-0000-0000-000000000001';
const OTHER_GRAPH_ID = 'E0000001-0000-0000-0000-000000000099';
const EDGE_TYPE_STORED_ID = 'D0000001-0000-0000-0000-000000000001';
const EDGE_TYPE_PROVIDER_ONLY_ID = 'D0000001-0000-0000-0000-000000000002';
const ENTITY_CONCEPTS_ID = 'A0000001-0000-0000-0000-000000000001';
const ENTITY_QUERIES_ID = 'B0000001-0000-0000-0000-000000000002';
const APPROVE_AUTH_ID = 'C0000001-0000-0000-0000-000000000001';
const CURATOR_ROLE_ID = 'F1000001-0000-0000-0000-000000000001';
const STAFF_ROLE_ID = 'F1000001-0000-0000-0000-000000000002';

function makeUser(id: string, roleIds: string[], type: 'User' | 'Owner' = 'User'): UserInfo {
    return {
        ID: id,
        Name: id,
        Type: type,
        UserRoles: roleIds.map((RoleID) => ({ UserID: id, RoleID, Role: RoleID })),
    } as unknown as UserInfo;
}

/** A real `Graph: Approve Edges` authorization granted (Allow) to the curator role. */
function makeApproveAuthorizations(): AuthorizationInfo[] {
    const owningProvider = {
        AuthorizationRoles: [
            new AuthorizationRoleInfo({ ID: 'ar-1', AuthorizationID: APPROVE_AUTH_ID, RoleID: CURATOR_ROLE_ID, Type: 'Allow' }),
        ],
    } as unknown as IMetadataProvider;
    return [
        new AuthorizationInfo(
            { ID: APPROVE_AUTH_ID, Name: GRAPH_APPROVE_EDGES_AUTHORIZATION, ParentID: null, IsActive: true },
            owningProvider,
        ),
    ];
}

const curator = makeUser('u-curator', [CURATOR_ROLE_ID]);
const staff = makeUser('u-staff', [STAFF_ROLE_ID]);
const owner = makeUser('u-owner', [STAFF_ROLE_ID], 'Owner');

function makeValidEdgeInput(overrides: Partial<GraphEdgeValidationInput> = {}): GraphEdgeValidationInput {
    return {
        GraphID: GRAPH_ID,
        EdgeTypeID: EDGE_TYPE_STORED_ID,
        SourceEntityID: ENTITY_CONCEPTS_ID,
        SourceRecordID: 'F0000001-0000-0000-0000-000000000001',
        TargetEntityID: ENTITY_QUERIES_ID,
        TargetRecordID: 'F0000001-0000-0000-0000-000000000002',
        ...overrides,
    };
}

describe('MJGraphEdgeEntityServer (Phase G1.3 invariants)', () => {
    const storedEdgeType = {
        ID: EDGE_TYPE_STORED_ID,
        Name: 'Defines',
        GraphID: null,
        IsDirected: true,
        AllowStored: true,
    };

    const providerOnlyEdgeType = {
        ID: EDGE_TYPE_PROVIDER_ONLY_ID,
        Name: 'Reads',
        GraphID: null,
        IsDirected: true,
        AllowStored: false,
    };

    it('accepts a valid declared edge on an AllowStored=true edge type', () => {
        const errors = ValidateGraphEdgeInvariants(makeValidEdgeInput(), storedEdgeType, () => true);
        expect(errors).toEqual([]);
    });

    it('refuses storing an edge whose EdgeType has AllowStored = false (provider-only)', () => {
        const errors = ValidateGraphEdgeInvariants(
            makeValidEdgeInput({ EdgeTypeID: EDGE_TYPE_PROVIDER_ONLY_ID }),
            providerOnlyEdgeType,
            () => true,
        );
        expect(errors).toHaveLength(1);
        expect(errors[0].Source).toBe('EdgeTypeID');
        expect(errors[0].Type).toBe(ValidationErrorType.Failure);
        expect(errors[0].Message).toContain('AllowStored = false');
    });

    it('refuses storing an edge whose EdgeType is scoped to a different graph', () => {
        const otherGraphEdgeType = {
            ...storedEdgeType,
            GraphID: OTHER_GRAPH_ID,
        };
        const errors = ValidateGraphEdgeInvariants(makeValidEdgeInput(), otherGraphEdgeType, () => true);
        expect(errors).toHaveLength(1);
        expect(errors[0].Source).toBe('EdgeTypeID');
        expect(errors[0].Message).toContain('scoped to a different graph');
    });

    it('refuses a self-loop where Source and Target identify the same entity and record', () => {
        const errors = ValidateGraphEdgeInvariants(
            makeValidEdgeInput({
                SourceEntityID: ENTITY_CONCEPTS_ID.toLowerCase(),
                SourceRecordID: 'REC-001',
                TargetEntityID: ENTITY_CONCEPTS_ID.toUpperCase(),
                TargetRecordID: 'rec-001',
            }),
            storedEdgeType,
            () => true,
        );
        expect(errors.some((e) => e.Message.includes('self-loop'))).toBe(true);
    });

    it('refuses SourceEntityID or TargetEntityID that violates GraphEdgeTypeEndpoint constraints', () => {
        const errors = ValidateGraphEdgeInvariants(
            makeValidEdgeInput(),
            storedEdgeType,
            (_edgeTypeId, side) => side !== 'Source',
        );
        expect(errors).toHaveLength(1);
        expect(errors[0].Source).toBe('SourceEntityID');
        expect(errors[0].Message).toContain('not permitted as a Source endpoint');
    });

    it('refuses oversize SourceRecordID or TargetRecordID (> 400 characters)', () => {
        const oversize = 'X'.repeat(MAX_GRAPH_EDGE_RECORD_ID_LENGTH + 1);
        const errors = ValidateGraphEdgeInvariants(
            makeValidEdgeInput({ SourceRecordID: oversize, TargetRecordID: oversize }),
            storedEdgeType,
            () => true,
        );
        expect(errors).toHaveLength(2);
        expect(errors.map((e) => e.Source)).toEqual(['SourceRecordID', 'TargetRecordID']);
    });

    it('canonicalizes undirected edge endpoints so lower <entityID>|<recordID> key comes first', () => {
        const swapped = CanonicalizeUndirectedEdgeEndpoints(
            ENTITY_QUERIES_ID,
            'REC-Z',
            ENTITY_CONCEPTS_ID,
            'REC-A',
        );
        expect(swapped.Swapped).toBe(true);
        expect(swapped.SourceEntityID).toBe(ENTITY_CONCEPTS_ID);
        expect(swapped.SourceRecordID).toBe('REC-A');
        expect(swapped.TargetEntityID).toBe(ENTITY_QUERIES_ID);
        expect(swapped.TargetRecordID).toBe('REC-Z');

        const alreadyCanonical = CanonicalizeUndirectedEdgeEndpoints(
            ENTITY_CONCEPTS_ID,
            'REC-A',
            ENTITY_QUERIES_ID,
            'REC-Z',
        );
        expect(alreadyCanonical.Swapped).toBe(false);
    });
});

function approvalInput(overrides: Partial<GraphEdgeApprovalInput>): GraphEdgeApprovalInput {
    return {
        IsSaved: true,
        Origin: 'Declared',
        PreviousStatus: 'Proposed',
        NextStatus: 'Approved',
        IdentityChanged: false,
        ContentChanged: false,
        User: curator,
        Authorizations: makeApproveAuthorizations(),
        InPipelineApprovalScope: false,
        ...overrides,
    };
}

describe('EvaluateGraphEdgeApproval (Graph: Approve Edges, fail closed)', () => {
    it('allows a curator holding the authorization to approve a Proposed edge, and stamps the review', () => {
        const verdict = EvaluateGraphEdgeApproval(approvalInput({}));
        expect(verdict.Error).toBeNull();
        expect(verdict.ShouldStampReview).toBe(true);
    });

    it('denies a caller without the authorization', () => {
        const verdict = EvaluateGraphEdgeApproval(approvalInput({ User: staff }));
        expect(verdict.Error?.Source).toBe('Status');
        expect(verdict.Error?.Message).toContain('does not hold');
        expect(verdict.ShouldStampReview).toBe(false);
    });

    it('denies when the authorization is not seeded (Unknown), instead of allowing', () => {
        const verdict = EvaluateGraphEdgeApproval(approvalInput({ Authorizations: [] }));
        expect(verdict.Error).not.toBeNull();
        expect(verdict.Error?.Message).toContain('not configured');
    });

    it('denies when the provider has no authorization list at all', () => {
        const verdict = EvaluateGraphEdgeApproval(approvalInput({ Authorizations: undefined }));
        expect(verdict.Error).not.toBeNull();
    });

    it('gives an Owner no bypass: an Owner without the grant is denied', () => {
        const verdict = EvaluateGraphEdgeApproval(approvalInput({ User: owner }));
        expect(verdict.Error).not.toBeNull();
    });

    it('denies an unauthenticated caller', () => {
        expect(EvaluateGraphEdgeApproval(approvalInput({ User: undefined })).Error).not.toBeNull();
    });

    it('gates creating a pre-approved (Declared, Approved) edge', () => {
        const create = approvalInput({ IsSaved: false, PreviousStatus: null, NextStatus: 'Approved', User: staff });
        expect(GraphEdgeSaveNeedsApproval(create)).toBe(true);
        expect(EvaluateGraphEdgeApproval(create).Error).not.toBeNull();
        expect(EvaluateGraphEdgeApproval({ ...create, User: curator }).Error).toBeNull();
    });

    it('gates every review decision, including Rejected -> Approved, and re-pointing an Approved edge', () => {
        expect(GraphEdgeSaveNeedsApproval(approvalInput({ PreviousStatus: 'Rejected', NextStatus: 'Approved' }))).toBe(true);
        expect(GraphEdgeSaveNeedsApproval(approvalInput({ PreviousStatus: 'Proposed', NextStatus: 'Rejected' }))).toBe(true);
        expect(GraphEdgeSaveNeedsApproval(approvalInput({ PreviousStatus: 'Approved', NextStatus: 'Approved', IdentityChanged: true }))).toBe(true);
    });

    it('gates editing what an Approved edge says, and taking it out of Approved', () => {
        expect(GraphEdgeSaveNeedsApproval(approvalInput({ PreviousStatus: 'Approved', NextStatus: 'Approved', ContentChanged: true }))).toBe(true);
        expect(GraphEdgeSaveNeedsApproval(approvalInput({ PreviousStatus: 'Approved', NextStatus: 'Proposed' }))).toBe(true);
        expect(GraphEdgeSaveNeedsApproval(approvalInput({ PreviousStatus: 'Proposed', NextStatus: 'Proposed', ContentChanged: true }))).toBe(false);
    });

    it('leaves ordinary saves ungated: a Proposed create, and an Approved edge whose identity is unchanged', () => {
        expect(GraphEdgeSaveNeedsApproval(approvalInput({ IsSaved: false, PreviousStatus: null, NextStatus: 'Proposed' }))).toBe(false);
        expect(GraphEdgeSaveNeedsApproval(approvalInput({ PreviousStatus: 'Approved', NextStatus: 'Approved', IdentityChanged: false }))).toBe(false);
        expect(EvaluateGraphEdgeApproval(approvalInput({ IsSaved: false, PreviousStatus: null, NextStatus: 'Proposed', User: staff })).Error).toBeNull();
    });
});

interface ProviderStubOptions {
    Authorizations?: AuthorizationInfo[];
    CountsByEntity?: Record<string, number>;
    FailEntity?: string;
}

interface ProviderStub {
    Entities: EntityInfo[];
    Authorizations: AuthorizationInfo[];
    ReadUsers: Array<UserInfo | undefined>;
    EntityByName: (name: string) => EntityInfo | undefined;
    EntityByID: (id: string) => EntityInfo | undefined;
    RunView: (p: RunViewParams, u?: UserInfo) => Promise<RunViewResult>;
    RunViews: (p: RunViewParams[], u?: UserInfo) => Promise<RunViewResult[]>;
    RunQuery: () => Promise<never>;
}

function makeProvider(options: ProviderStubOptions = {}): ProviderStub {
    const entities = [
        { ID: ENTITY_CONCEPTS_ID, Name: 'MJ: Graph Concepts', FirstPrimaryKey: { Name: 'ID' } },
        { ID: ENTITY_QUERIES_ID, Name: 'MJ: Queries', FirstPrimaryKey: { Name: 'ID' } },
    ] as unknown as EntityInfo[];
    const stub: ProviderStub = {
        Entities: entities,
        Authorizations: options.Authorizations ?? [],
        ReadUsers: [],
        EntityByName: (name) => entities.find((e) => e.Name === name),
        EntityByID: (id) => entities.find((e) => e.ID.toLowerCase() === id.toLowerCase()),
        RunView: async (p, u) => (await stub.RunViews([p], u))[0],
        RunViews: async (params, u) => {
            stub.ReadUsers.push(u);
            return params.map((p) => {
                if (p.EntityName === options.FailEntity) {
                    return { Success: false, ErrorMessage: 'boom', Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, UserViewRunID: '' } as RunViewResult;
                }
                const count = options.CountsByEntity?.[p.EntityName ?? ''] ?? 1;
                return { Success: true, ErrorMessage: '', Results: [], RowCount: 0, TotalRowCount: count, ExecutionTime: 0, UserViewRunID: '' } as RunViewResult;
            });
        },
        RunQuery: async () => {
            throw new Error('not used');
        },
    };
    return stub;
}

describe('CheckGraphEdgeEndpointsExist (fails closed, reads as the caller)', () => {
    const endpoints = {
        SourceEntityID: ENTITY_CONCEPTS_ID,
        SourceRecordID: 'exists-1',
        TargetEntityID: ENTITY_QUERIES_ID,
        TargetRecordID: 'missing-2',
    };

    it('reports a missing or unreadable endpoint, reading as the caller', async () => {
        const provider = makeProvider({ CountsByEntity: { 'MJ: Queries': 0 } });
        const errors = await CheckGraphEdgeEndpointsExist(endpoints, provider as unknown as IMetadataProvider, curator);
        expect(errors).toHaveLength(1);
        expect(errors[0].Source).toBe('TargetRecordID');
        expect(errors[0].Message).toContain('does not exist');
        expect(provider.ReadUsers).toEqual([curator]);
    });

    it('treats an unknown endpoint entity and a failed read as errors, not a pass', async () => {
        const unknownEntity = await CheckGraphEdgeEndpointsExist(
            { ...endpoints, TargetEntityID: 'A9999999-0000-0000-0000-000000000000' },
            makeProvider() as unknown as IMetadataProvider,
            curator,
        );
        expect(unknownEntity.some((e) => e.Message.includes('not a known entity'))).toBe(true);

        const failedRead = await CheckGraphEdgeEndpointsExist(
            endpoints,
            makeProvider({ FailEntity: 'MJ: Graph Concepts' }) as unknown as IMetadataProvider,
            curator,
        );
        expect(failedRead.some((e) => e.Message.includes('Could not verify'))).toBe(true);
    });

    it('refuses to check without a caller', async () => {
        const errors = await CheckGraphEdgeEndpointsExist(endpoints, makeProvider() as unknown as IMetadataProvider, undefined);
        expect(errors).toHaveLength(1);
    });
});

describe('MJGraphEdgeEntityServer.ValidateAsync', () => {
    const storedEdgeType = { ID: EDGE_TYPE_STORED_ID, Name: 'Defines', GraphID: null, IsDirected: true, AllowStored: true };

    beforeEach(() => {
        engine.EdgeTypes = [storedEdgeType];
        engine.Loaded = true;
        engine.ConfigCalls = [];
        engine.ValidateEdgeEndpoint = () => true;
    });

    interface EdgeFields extends GraphEdgeValidationInput {
        Origin: 'Declared' | 'Inferred';
        Status: 'Approved' | 'Proposed' | 'Rejected';
        IsSaved: boolean;
    }

    function makeEdge(fields: Partial<EdgeFields>, user: UserInfo, provider: ProviderStub | object): MJGraphEdgeEntityServer {
        const edge = new MJGraphEdgeEntityServer();
        const input = makeValidEdgeInput(fields);
        edge.GraphID = input.GraphID ?? '';
        edge.EdgeTypeID = input.EdgeTypeID ?? '';
        edge.SourceEntityID = input.SourceEntityID ?? '';
        edge.SourceRecordID = input.SourceRecordID ?? '';
        edge.TargetEntityID = input.TargetEntityID ?? '';
        edge.TargetRecordID = input.TargetRecordID ?? '';
        edge.Origin = fields.Origin ?? 'Declared';
        edge.Status = fields.Status ?? 'Approved';
        const internal = edge as unknown as { IsSaved: boolean; ContextCurrentUser: UserInfo; ProviderToUse: object };
        internal.IsSaved = fields.IsSaved ?? false;
        internal.ContextCurrentUser = user;
        internal.ProviderToUse = provider;
        return edge;
    }

    /** Runs `work` the way `EntityGraphOverlayStore.UpsertEdges` saves: inside the pipeline's approval scope, bound to `user`. */
    function inPipelineScope<T>(user: UserInfo, work: () => Promise<T>): Promise<T> {
        return ServerOperationScopeManager.Instance.RunWithAuthority(
            { operationKey: GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Graph Edges'], userId: user.ID },
            work,
        );
    }

    function markSaved(edge: MJGraphEdgeEntityServer, previousStatus: string, dirty: string[] = [], storedAttributes: string | null = null): void {
        const internal = edge as unknown as { IsSaved: boolean; FieldState: Record<string, { Dirty: boolean; OldValue: unknown }> };
        internal.IsSaved = true;
        internal.FieldState = {
            Status: { Dirty: previousStatus !== edge.Status, OldValue: previousStatus },
            Attributes: { Dirty: storedAttributes !== edge.Attributes, OldValue: storedAttributes },
        };
        for (const f of dirty) {
            internal.FieldState[f] = { Dirty: true, OldValue: 'old' };
        }
    }

    function deleteCalls(edge: MJGraphEdgeEntityServer): number {
        return (edge as unknown as { DeleteCalls: number }).DeleteCalls;
    }

    it('refuses a pre-approved Declared edge created by a caller without Graph: Approve Edges', async () => {
        const edge = makeEdge({ Status: 'Approved' }, staff, makeProvider({ Authorizations: makeApproveAuthorizations() }));
        const result = await edge.ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors.some((e) => e.Source === 'Status' && e.Message.includes(GRAPH_APPROVE_EDGES_AUTHORIZATION))).toBe(true);
    });

    it('refuses approval when the authorization is unseeded', async () => {
        const edge = makeEdge({ Status: 'Approved' }, curator, makeProvider({ Authorizations: [] }));
        markSaved(edge, 'Proposed');
        const result = await edge.ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Message).toContain('not configured');
    });

    it('approves for a curator, stamps the reviewer, and checks endpoints as the caller', async () => {
        const provider = makeProvider({ Authorizations: makeApproveAuthorizations() });
        const edge = makeEdge({ Status: 'Approved' }, curator, provider);
        markSaved(edge, 'Proposed', ['SourceRecordID']);
        const result = await edge.ValidateAsync();
        expect(result.Success).toBe(true);
        const attrs = JSON.parse(edge.Attributes ?? '{}') as Record<string, unknown>;
        expect(attrs['ReviewedByUserID']).toBe(curator.ID);
        expect(provider.ReadUsers).toEqual([curator]);
        expect(engine.ConfigCalls).toHaveLength(1);
    });

    it('lets anyone save a Proposed edge', async () => {
        const result = await makeEdge({ Status: 'Proposed' }, staff, makeProvider()).ValidateAsync();
        expect(result.Success).toBe(true);
    });

    it('refuses re-pointing an Approved edge without the authorization', async () => {
        const edge = makeEdge({ Status: 'Approved', IsSaved: true }, staff, makeProvider({ Authorizations: makeApproveAuthorizations() }));
        markSaved(edge, 'Approved', ['TargetRecordID']);
        const result = await edge.ValidateAsync();
        expect(result.Success).toBe(false);
    });

    it('fails closed when graph metadata is not loaded or the edge type is unknown', async () => {
        engine.Loaded = false;
        const notLoaded = await makeEdge({ Status: 'Proposed' }, staff, makeProvider()).ValidateAsync();
        expect(notLoaded.Success).toBe(false);

        engine.Loaded = true;
        engine.EdgeTypes = [];
        const unknownType = await makeEdge({ Status: 'Proposed' }, staff, makeProvider()).ValidateAsync();
        expect(unknownType.Success).toBe(false);
        expect(unknownType.Errors.some((e) => e.Source === 'EdgeTypeID' && e.Message.includes('not a known'))).toBe(true);
    });

    it('refuses to validate against a provider that cannot run views', async () => {
        const result = await makeEdge({ Status: 'Proposed' }, staff, { Entities: [] }).ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Type).toBe(ValidationErrorType.Failure);
    });

    it('accepts a new Inferred edge that starts Approved from a caller who holds Graph: Approve Edges (IT162 SG4)', async () => {
        const result = await makeEdge({ Origin: 'Inferred', Status: 'Approved' }, curator, makeProvider({ Authorizations: makeApproveAuthorizations() })).ValidateAsync();
        expect(result.Errors.map((e) => e.Message)).toEqual([]);
        expect(result.Success).toBe(true);
    });

    it('refuses a new Inferred edge that starts Approved from a caller without the authorization, outside the pipeline scope', async () => {
        const result = await makeEdge({ Origin: 'Inferred', Status: 'Approved' }, staff, makeProvider({ Authorizations: makeApproveAuthorizations() })).ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors.some((e) => e.Source === 'Status' && e.Message.includes(GRAPH_APPROVE_EDGES_AUTHORIZATION))).toBe(true);
    });

    it('accepts the pipeline\'s policy-approved Inferred edge inside its approval scope, for a run user without the authorization', async () => {
        const edge = makeEdge({ Origin: 'Inferred', Status: 'Approved' }, staff, makeProvider({ Authorizations: makeApproveAuthorizations() }));
        const result = await inPipelineScope(staff, () => edge.ValidateAsync());
        expect(result.Errors.map((e) => e.Message)).toEqual([]);
        expect(result.Success).toBe(true);
        expect(edge.Attributes).toBeNull(); // approved by policy, not reviewed by a person: no review stamp
    });

    it('gives an API save no pipeline scope: a client CRUD boundary masks it', async () => {
        const edge = makeEdge({ Origin: 'Inferred', Status: 'Approved' }, staff, makeProvider({ Authorizations: makeApproveAuthorizations() }));
        const result = await inPipelineScope(staff, () => ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => edge.ValidateAsync()));
        expect(result.Success).toBe(false);
    });

    it('approves nothing else inside the pipeline scope: a Declared edge, an approval of a saved edge, another user', async () => {
        const authorizations = makeApproveAuthorizations();
        const declared = await inPipelineScope(staff, () => makeEdge({ Origin: 'Declared', Status: 'Approved' }, staff, makeProvider({ Authorizations: authorizations })).ValidateAsync());
        expect(declared.Success).toBe(false);

        const saved = makeEdge({ Origin: 'Inferred', Status: 'Approved', IsSaved: true }, staff, makeProvider({ Authorizations: authorizations }));
        markSaved(saved, 'Proposed');
        expect((await inPipelineScope(staff, () => saved.ValidateAsync())).Success).toBe(false);

        const otherUser = await inPipelineScope(curator, () =>
            makeEdge({ Origin: 'Inferred', Status: 'Approved' }, staff, makeProvider({ Authorizations: authorizations })).ValidateAsync(),
        );
        expect(otherUser.Success).toBe(false);
    });

    it('refuses editing an Approved edge\'s content without the authorization, and re-stamps the reviewer with it', async () => {
        const authorizations = makeApproveAuthorizations();
        const byStaff = makeEdge({ Status: 'Approved', IsSaved: true }, staff, makeProvider({ Authorizations: authorizations }));
        markSaved(byStaff, 'Approved', ['Description']);
        expect((await byStaff.ValidateAsync()).Success).toBe(false);

        const byCurator = makeEdge({ Status: 'Approved', IsSaved: true }, curator, makeProvider({ Authorizations: authorizations }));
        markSaved(byCurator, 'Approved', ['Weight']);
        expect((await byCurator.ValidateAsync()).Success).toBe(true);
        expect(JSON.parse(byCurator.Attributes ?? '{}')['ReviewedByUserID']).toBe(curator.ID);
    });

    it('refuses a save that sets, changes or removes the review stamp unless it is the reviewing save itself', async () => {
        const forgedCreate = makeEdge({ Status: 'Proposed' }, staff, makeProvider());
        forgedCreate.Attributes = JSON.stringify({ ReviewedByUserID: curator.ID, Note: 'x' });
        const created = await forgedCreate.ValidateAsync();
        expect(created.Success).toBe(false);
        expect(created.Errors.some((e) => e.Source === 'Attributes' && e.Message.includes('ReviewedByUserID'))).toBe(true);

        const stored = JSON.stringify({ ReviewedByUserID: curator.ID, ReviewedAt: '2026-11-01T00:00:00.000Z', Note: 'x' });
        const rewritten = makeEdge({ Status: 'Rejected', IsSaved: true }, staff, makeProvider());
        rewritten.Attributes = JSON.stringify({ ReviewedByUserID: staff.ID, ReviewedAt: '2026-11-01T00:00:00.000Z', Note: 'x' });
        markSaved(rewritten, 'Rejected', [], stored);
        expect((await rewritten.ValidateAsync()).Success).toBe(false);

        const unrelated = makeEdge({ Status: 'Rejected', IsSaved: true }, staff, makeProvider());
        unrelated.Attributes = JSON.stringify({ ReviewedByUserID: curator.ID, ReviewedAt: '2026-11-01T00:00:00.000Z', Note: 'edited' });
        markSaved(unrelated, 'Rejected', [], stored);
        expect((await unrelated.ValidateAsync()).Success).toBe(true);
    });

    it('refuses deleting an Approved edge without the authorization; a Proposed edge, or a curator, may delete', async () => {
        const authorizations = makeApproveAuthorizations();
        const approvedByStaff = makeEdge({ Status: 'Approved', IsSaved: true }, staff, makeProvider({ Authorizations: authorizations }));
        markSaved(approvedByStaff, 'Approved');
        expect(await approvedByStaff.Delete()).toBe(false);
        expect(deleteCalls(approvedByStaff)).toBe(0);
        expect(approvedByStaff.LatestResult?.Message).toContain(GRAPH_APPROVE_EDGES_AUTHORIZATION);

        const proposedByStaff = makeEdge({ Status: 'Proposed', IsSaved: true }, staff, makeProvider({ Authorizations: authorizations }));
        markSaved(proposedByStaff, 'Proposed');
        expect(await proposedByStaff.Delete()).toBe(true);

        const approvedByCurator = makeEdge({ Status: 'Approved', IsSaved: true }, curator, makeProvider({ Authorizations: authorizations }));
        markSaved(approvedByCurator, 'Approved');
        expect(await approvedByCurator.Delete()).toBe(true);
        expect(deleteCalls(approvedByCurator)).toBe(1);
    });

    it('reports a missing endpoint record', async () => {
        const result = await makeEdge({ Status: 'Proposed' }, staff, makeProvider({ CountsByEntity: { 'MJ: Queries': 0 } })).ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors.some((e) => e.Source === 'TargetRecordID')).toBe(true);
    });
});

// Keep the imported ValidationResult referenced so the mock factory's dynamic import has a static twin.
void ValidationResult;
