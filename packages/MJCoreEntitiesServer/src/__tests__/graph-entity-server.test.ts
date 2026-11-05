import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationResult } from '@memberjunction/core';
import {
    GraphEngine,
    MJGraphEdgeEntity,
    MJGraphEdgeProviderEntity,
    MJGraphEdgeTypeEndpointEntity,
    MJGraphEdgeTypeEntity,
} from '@memberjunction/core-entities';
import { MJGraphEdgeEntityServer } from '../custom/MJGraphEdgeEntityServer.server';
import { MJGraphEdgeTypeEntityServer } from '../custom/MJGraphEdgeTypeEntityServer.server';
import { MJGraphEdgeProviderEntityServer } from '../custom/MJGraphEdgeProviderEntityServer.server';

const GRAPH_1 = '11111111-1111-4111-8111-111111111111';
const GRAPH_2 = '22222222-2222-4222-8222-222222222222';
const ET_DIRECTED = '33333333-3333-4333-8333-333333333333';
const ET_UNDIRECTED = '44444444-4444-4444-8444-444444444444';
const ET_PROVIDER_ONLY = '55555555-5555-4555-8555-555555555555';
const ET_SCOPED_G2 = '66666666-6666-4666-8666-666666666666';
const ENT_CONCEPTS = '77777777-7777-4777-8777-777777777777';
const ENT_ABV = '88888888-8888-4888-8888-888888888888';
const ENT_QUERIES = '99999999-9999-4999-8999-999999999999';

function createValidResult(): ValidationResult {
    const r = new ValidationResult();
    r.Success = true;
    return r;
}

function attachFieldBag<T extends object>(
    instance: T,
    opts?: {
        isSaved?: boolean;
        oldValues?: Record<string, unknown>;
        contextUser?: { ID: string; Type?: string; UserRoles?: Array<{ RoleID: string; Role: string }> };
        authorizations?: unknown[];
    },
): T {
    const bag = new Map<string, unknown>();
    const oldValues = opts?.oldValues ?? {};
    const inst = instance as Record<string, unknown>;
    inst['Get'] = (fieldName: string) => bag.get(fieldName) ?? null;
    inst['Set'] = (fieldName: string, value: unknown) => {
        bag.set(fieldName, value);
    };
    inst['GetFieldByName'] = (fieldName: string) => {
        const currentVal = bag.get(fieldName) ?? null;
        const oldVal = fieldName in oldValues ? oldValues[fieldName] : currentVal;
        return {
            Name: fieldName,
            Value: currentVal,
            OldValue: oldVal,
            Dirty: currentVal !== oldVal,
        };
    };
    Object.defineProperty(instance, 'IsSaved', {
        get: () => opts?.isSaved ?? false,
        configurable: true,
    });
    Object.defineProperty(instance, 'ContextCurrentUser', {
        get: () => opts?.contextUser,
        configurable: true,
    });
    Object.defineProperty(instance, 'ProviderToUse', {
        get: () => ({ Authorizations: opts?.authorizations ?? [] }),
        configurable: true,
    });
    return instance;
}

function createEdgeDouble(init: Partial<MJGraphEdgeEntityServer> & {
    isSaved?: boolean;
    oldStatus?: string;
    contextUser?: { ID: string; Type?: string; UserRoles?: Array<{ RoleID: string; Role: string }> };
    authorizations?: unknown[];
}): MJGraphEdgeEntityServer {
    vi.spyOn(MJGraphEdgeEntity.prototype, 'Validate').mockImplementation(createValidResult);
    vi.spyOn(MJGraphEdgeEntity.prototype, 'Save').mockResolvedValue(true);

    const instance = attachFieldBag(
        Object.create(MJGraphEdgeEntityServer.prototype) as MJGraphEdgeEntityServer,
        {
            isSaved: init.isSaved,
            oldValues: init.oldStatus !== undefined ? { Status: init.oldStatus } : {},
            contextUser: init.contextUser,
            authorizations: init.authorizations,
        },
    );

    instance.GraphID = init.GraphID ?? GRAPH_1;
    instance.EdgeTypeID = init.EdgeTypeID ?? ET_DIRECTED;
    instance.SourceEntityID = init.SourceEntityID ?? ENT_ABV;
    instance.SourceRecordID = init.SourceRecordID ?? 'REC-A';
    instance.TargetEntityID = init.TargetEntityID ?? ENT_CONCEPTS;
    instance.TargetRecordID = init.TargetRecordID ?? 'REC-B';
    instance.Origin = init.Origin ?? 'Declared';
    instance.Status = init.Status ?? 'Proposed';

    return instance;
}

describe('MJGraphEdgeEntityServer, MJGraphEdgeTypeEntityServer & MJGraphEdgeProviderEntityServer', () => {
    beforeEach(() => {
        vi.restoreAllMocks();

        const ge = GraphEngine.Instance as unknown as Record<string, unknown>;
        ge['_edgeTypes'] = [
            {
                ID: ET_DIRECTED,
                GraphID: null,
                Name: 'Defines',
                IsDirected: true,
                AllowStored: true,
                Status: 'Active',
            },
            {
                ID: ET_UNDIRECTED,
                GraphID: null,
                Name: 'Related To',
                IsDirected: false,
                AllowStored: true,
                Status: 'Active',
            },
            {
                ID: ET_PROVIDER_ONLY,
                GraphID: null,
                Name: 'Subsets',
                IsDirected: true,
                AllowStored: false,
                Status: 'Active',
            },
            {
                ID: ET_SCOPED_G2,
                GraphID: GRAPH_2,
                Name: 'Graph2OnlyEdge',
                IsDirected: true,
                AllowStored: true,
                Status: 'Active',
            },
        ] as unknown as MJGraphEdgeTypeEntity[];

        ge['_edgeTypeEndpoints'] = [
            {
                ID: 'EP-SRC',
                EdgeTypeID: ET_DIRECTED,
                Side: 'Source',
                EntityID: ENT_ABV,
                IsRequired: true,
            },
            {
                ID: 'EP-TGT',
                EdgeTypeID: ET_DIRECTED,
                Side: 'Target',
                EntityID: ENT_CONCEPTS,
                IsRequired: true,
            },
        ] as unknown as MJGraphEdgeTypeEndpointEntity[];
    });

    it('MJGraphEdgeEntityServer rejects oversize RecordIDs (>400 chars) and self-loops', () => {
        const oversize = createEdgeDouble({
            SourceRecordID: 'X'.repeat(401),
        });
        const res1 = oversize.Validate();
        expect(res1.Success).toBe(false);
        expect(res1.Errors.some(e => e.Source === 'SourceRecordID')).toBe(true);

        const selfLoop = createEdgeDouble({
            SourceEntityID: ENT_ABV,
            SourceRecordID: 'SAME-ID',
            TargetEntityID: ENT_ABV,
            TargetRecordID: 'same-id',
        });
        const res2 = selfLoop.Validate();
        expect(res2.Success).toBe(false);
        expect(res2.Errors.some(e => e.Message.includes('self-loop'))).toBe(true);
    });

    it('MJGraphEdgeEntityServer rejects AllowStored=false, mismatched GraphID scope, and violated Endpoint constraints', () => {
        const providerOnly = createEdgeDouble({
            EdgeTypeID: ET_PROVIDER_ONLY,
        });
        const r1 = providerOnly.Validate();
        expect(r1.Success).toBe(false);
        expect(r1.Errors.some(e => e.Message.includes('AllowStored = 0'))).toBe(true);

        const wrongGraphScope = createEdgeDouble({
            GraphID: GRAPH_1,
            EdgeTypeID: ET_SCOPED_G2,
        });
        const r2 = wrongGraphScope.Validate();
        expect(r2.Success).toBe(false);
        expect(r2.Errors.some(e => e.Message.includes('belongs to a different graph'))).toBe(true);

        const badEndpoint = createEdgeDouble({
            EdgeTypeID: ET_DIRECTED,
            SourceEntityID: ENT_QUERIES, // not allowed for ET_DIRECTED (only ENT_ABV -> ENT_CONCEPTS is allowed)
            TargetEntityID: ENT_CONCEPTS,
        });
        const r3 = badEndpoint.Validate();
        expect(r3.Success).toBe(false);
        expect(r3.Errors.some(e => e.Message.includes('not an allowed Source endpoint'))).toBe(true);
    });

    it('MJGraphEdgeEntityServer canonicalizes undirected edge endpoint orientation on Validate() and Save()', async () => {
        const undirectedEdge = createEdgeDouble({
            EdgeTypeID: ET_UNDIRECTED,
            SourceEntityID: ENT_CONCEPTS,
            SourceRecordID: 'ZZZ-RECORD',
            TargetEntityID: ENT_CONCEPTS,
            TargetRecordID: 'AAA-RECORD',
            Status: 'Proposed',
        });

        const saved = await undirectedEdge.Save();
        expect(saved).toBe(true);
        expect(undirectedEdge.SourceRecordID).toBe('AAA-RECORD');
        expect(undirectedEdge.TargetRecordID).toBe('ZZZ-RECORD');
    });

    it('MJGraphEdgeEntityServer enforces Inferred=Proposed on create and Graph: Approve Edges authorization on approval transition', async () => {
        const authSeeds = [
            {
                ID: 'AUTH-1',
                Name: 'Graph: Approve Edges',
                ParentID: null,
                IsActive: true,
                Roles: [{ ID: 'AR-1', AuthorizationID: 'AUTH-1', RoleID: 'ROLE-STEWARD', Type: 'Allow' }],
                UserCanExecute: (u: { Type?: string }) => u?.Type === 'Owner',
            },
        ];

        // 1. Newly created Inferred edge cannot be saved directly as Approved
        const inferredApproved = createEdgeDouble({
            Origin: 'Inferred',
            Status: 'Approved',
            contextUser: { ID: 'owner-user-1', Type: 'Owner' },
            authorizations: authSeeds,
        });
        const vInferred = inferredApproved.Validate();
        expect(vInferred.Success).toBe(false);
        expect(vInferred.Errors.some(e => e.Message.includes('Status = "Proposed"'))).toBe(true);

        // 2. Non-owner user lacking Graph: Approve Edges attempting to transition Proposed -> Approved is refused
        const existingProposed = createEdgeDouble({
            isSaved: true,
            oldStatus: 'Proposed',
            Origin: 'Declared',
            Status: 'Approved',
            contextUser: { ID: 'regular-user', Type: 'User', UserRoles: [] },
            authorizations: authSeeds,
        });
        const savedTransition = await existingProposed.Save();
        expect(savedTransition).toBe(false);

        // 3. Owner user (or user with ROLE-STEWARD) is permitted to transition Status to Approved
        const ownerApproval = createEdgeDouble({
            isSaved: true,
            oldStatus: 'Proposed',
            Origin: 'Declared',
            Status: 'Approved',
            contextUser: { ID: 'owner-user-1', Type: 'Owner' },
            authorizations: authSeeds,
        });
        const savedByOwner = await ownerApproval.Save();
        expect(savedByOwner).toBe(true);
    });

    it('MJGraphEdgeTypeEntityServer enforces case-insensitive (GraphID, Name) uniqueness including when GraphID IS NULL', () => {
        vi.spyOn(MJGraphEdgeTypeEntity.prototype, 'Validate').mockImplementation(createValidResult);

        const dupGlobal = attachFieldBag(
            Object.create(MJGraphEdgeTypeEntityServer.prototype) as MJGraphEdgeTypeEntityServer,
        );
        dupGlobal.ID = 'NEW-ET-ID';
        dupGlobal.GraphID = null;
        dupGlobal.Name = 'defines'; // collides with global 'Defines'

        const resGlobal = dupGlobal.Validate();
        expect(resGlobal.Success).toBe(false);
        expect(resGlobal.Errors.some(e => e.Message.includes('global scope'))).toBe(true);

        const uniqueScoped = attachFieldBag(
            Object.create(MJGraphEdgeTypeEntityServer.prototype) as MJGraphEdgeTypeEntityServer,
        );
        uniqueScoped.ID = 'NEW-ET-ID-2';
        uniqueScoped.GraphID = GRAPH_1;
        uniqueScoped.Name = 'Graph2OnlyEdge'; // exists in GRAPH_2, so allowed in GRAPH_1

        const resScoped = uniqueScoped.Validate();
        expect(resScoped.Success).toBe(true);
    });

    it('MJGraphEdgeProviderEntityServer validates DriverClass registration and parametric Configuration JSON', () => {
        vi.spyOn(MJGraphEdgeProviderEntity.prototype, 'Validate').mockImplementation(createValidResult);

        const badDriver = attachFieldBag(
            Object.create(
                MJGraphEdgeProviderEntityServer.prototype,
            ) as MJGraphEdgeProviderEntityServer,
        );
        badDriver.DriverClass = 'NonExistentEdgeProvider';
        badDriver.Configuration = null;
        const r1 = badDriver.Validate();
        expect(r1.Success).toBe(false);
        expect(r1.Errors.some(e => e.Source === 'DriverClass')).toBe(true);

        const validMetadataProvider = attachFieldBag(
            Object.create(
                MJGraphEdgeProviderEntityServer.prototype,
            ) as MJGraphEdgeProviderEntityServer,
        );
        validMetadataProvider.DriverClass = 'AlternateBaseViewEdgeProvider';
        validMetadataProvider.Configuration = null;
        const r2 = validMetadataProvider.Validate();
        expect(r2.Success).toBe(true);

        const missingFKField = attachFieldBag(
            Object.create(
                MJGraphEdgeProviderEntityServer.prototype,
            ) as MJGraphEdgeProviderEntityServer,
        );
        missingFKField.DriverClass = 'ForeignKeyEdgeProvider';
        missingFKField.Configuration = JSON.stringify({});
        const r3 = missingFKField.Validate();
        expect(r3.Success).toBe(false);
        expect(r3.Errors.some(e => e.Message.includes("'FieldName'"))).toBe(true);

        const validFK = attachFieldBag(
            Object.create(
                MJGraphEdgeProviderEntityServer.prototype,
            ) as MJGraphEdgeProviderEntityServer,
        );
        validFK.DriverClass = 'ForeignKeyEdgeProvider';
        validFK.Configuration = JSON.stringify({ FieldName: 'MemberID' });
        const r4 = validFK.Validate();
        expect(r4.Success).toBe(true);
    });
});
