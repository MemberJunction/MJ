import { describe, it, expect } from 'vitest';
import { ValidationErrorType } from '@memberjunction/core';
import {
    CanonicalizeUndirectedEdgeEndpoints,
    MAX_GRAPH_EDGE_RECORD_ID_LENGTH,
    ValidateGraphEdgeInvariants,
    type GraphEdgeValidationInput,
} from '../custom/MJGraphEdgeEntityServer.server';
import { ValidateGraphEdgeTypeUniqueness } from '../custom/MJGraphEdgeTypeEntityServer.server';
import {
    ValidateGraphEdgeProviderConfigurationJson,
    ValidateGraphEdgeProviderDriverClass,
} from '../custom/MJGraphEdgeProviderEntityServer.server';

const GRAPH_ID = 'E0000001-0000-0000-0000-000000000001';
const OTHER_GRAPH_ID = 'E0000001-0000-0000-0000-000000000099';
const EDGE_TYPE_STORED_ID = 'D0000001-0000-0000-0000-000000000001';
const EDGE_TYPE_PROVIDER_ONLY_ID = 'D0000001-0000-0000-0000-000000000002';
const ENTITY_CONCEPTS_ID = 'A0000001-0000-0000-0000-000000000001';
const ENTITY_QUERIES_ID = 'B0000001-0000-0000-0000-000000000002';

function makeValidEdgeInput(overrides: Partial<GraphEdgeValidationInput> = {}): GraphEdgeValidationInput {
    return {
        GraphID: GRAPH_ID,
        EdgeTypeID: EDGE_TYPE_STORED_ID,
        SourceEntityID: ENTITY_CONCEPTS_ID,
        SourceRecordID: 'F0000001-0000-0000-0000-000000000001',
        TargetEntityID: ENTITY_QUERIES_ID,
        TargetRecordID: 'F0000001-0000-0000-0000-000000000002',
        Origin: 'Declared',
        Status: 'Approved',
        IsSaved: false,
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

    it('refuses a new Inferred edge created with Status = Approved (requires Proposed)', () => {
        const rejectedErrors = ValidateGraphEdgeInvariants(
            makeValidEdgeInput({ Origin: 'Inferred', Status: 'Approved', IsSaved: false }),
            storedEdgeType,
            () => true,
        );
        expect(rejectedErrors).toHaveLength(1);
        expect(rejectedErrors[0].Source).toBe('Status');
        expect(rejectedErrors[0].Message).toContain('Status = "Proposed"');

        const proposedErrors = ValidateGraphEdgeInvariants(
            makeValidEdgeInput({ Origin: 'Inferred', Status: 'Proposed', IsSaved: false }),
            storedEdgeType,
            () => true,
        );
        expect(proposedErrors).toEqual([]);

        // Promoting an already-saved Inferred edge to Approved is allowed
        const savedPromotionErrors = ValidateGraphEdgeInvariants(
            makeValidEdgeInput({ Origin: 'Inferred', Status: 'Approved', IsSaved: true }),
            storedEdgeType,
            () => true,
        );
        expect(savedPromotionErrors).toEqual([]);
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

    it('gates Proposed -> Approved/Rejected transitions on Graph: Approve Edges authorization and flags review stamping', async () => {
        const { EvaluateGraphEdgeReviewTransition, CheckGraphEdgeEndpointsExist } = await import(
            '../custom/MJGraphEdgeEntityServer.server'
        );

        const unauthorized = EvaluateGraphEdgeReviewTransition({
            PreviousStatus: 'Proposed',
            NextStatus: 'Approved',
            IsSaved: true,
            User: { ID: 'u-1', Type: 'User', UserRoles: [] } as unknown as Parameters<
                typeof EvaluateGraphEdgeReviewTransition
            >[0]['User'],
            Authorizations: [
                {
                    ID: 'auth-1',
                    Name: 'Graph: Approve Edges',
                    ParentID: null,
                    UserCanExecute: () => false,
                } as unknown as NonNullable<Parameters<typeof EvaluateGraphEdgeReviewTransition>[0]['Authorizations']>[0],
            ],
        });
        expect(unauthorized.Error).not.toBeNull();
        expect(unauthorized.Error?.Source).toBe('Status');
        expect(unauthorized.ShouldStampReview).toBe(false);

        const authorized = EvaluateGraphEdgeReviewTransition({
            PreviousStatus: 'Proposed',
            NextStatus: 'Approved',
            IsSaved: true,
            User: { ID: 'u-curator', Type: 'User', UserRoles: [] } as unknown as Parameters<
                typeof EvaluateGraphEdgeReviewTransition
            >[0]['User'],
            Authorizations: [
                {
                    ID: 'auth-1',
                    Name: 'Graph: Approve Edges',
                    ParentID: null,
                    UserCanExecute: () => true,
                } as unknown as NonNullable<Parameters<typeof EvaluateGraphEdgeReviewTransition>[0]['Authorizations']>[0],
            ],
        });
        expect(authorized.Error).toBeNull();
        expect(authorized.ShouldStampReview).toBe(true);

        // Batched count_only endpoint existence check
        const existenceErrors = await CheckGraphEdgeEndpointsExist(
            {
                SourceEntityID: ENTITY_CONCEPTS_ID,
                SourceRecordID: 'exists-1',
                TargetEntityID: ENTITY_QUERIES_ID,
                TargetRecordID: 'missing-2',
            },
            {
                Entities: [
                    { ID: ENTITY_CONCEPTS_ID, Name: 'MJ: Graph Concepts', FirstPrimaryKey: { Name: 'ID' } },
                    { ID: ENTITY_QUERIES_ID, Name: 'MJ: Queries', FirstPrimaryKey: { Name: 'ID' } },
                ],
                RunViews: async () => [
                    { Success: true, TotalRowCount: 1, RowCount: 0, Results: [] },
                    { Success: true, TotalRowCount: 0, RowCount: 0, Results: [] },
                ],
            } as unknown as Parameters<typeof CheckGraphEdgeEndpointsExist>[1],
            { ID: 'u-curator', Type: 'User', UserRoles: [] } as unknown as Parameters<
                typeof CheckGraphEdgeEndpointsExist
            >[2],
        );
        expect(existenceErrors).toHaveLength(1);
        expect(existenceErrors[0].Source).toBe('TargetRecordID');
        expect(existenceErrors[0].Message).toContain('does not exist');
    });
});

describe('MJGraphEdgeTypeEntityServer (uniqueness invariants)', () => {
    const existingTypes = [
        { ID: 'D0000001-0000-0000-0000-000000000001', GraphID: null, Name: 'Broader Than' },
        { ID: 'D0000001-0000-0000-0000-000000000002', GraphID: GRAPH_ID, Name: 'CustomScopedEdge' },
    ];

    it('refuses a duplicate global (GraphID = null) edge type name case-insensitively', () => {
        const err = ValidateGraphEdgeTypeUniqueness(
            { ID: 'D0000001-0000-0000-0000-000000000099', GraphID: null, Name: 'broader than' },
            existingTypes,
        );
        expect(err).not.toBeNull();
        expect(err?.Source).toBe('Name');
        expect(err?.Message).toContain('global edge types');
    });

    it('refuses a duplicate graph-scoped edge type name in the same graph', () => {
        const err = ValidateGraphEdgeTypeUniqueness(
            { ID: 'D0000001-0000-0000-0000-000000000099', GraphID: GRAPH_ID.toLowerCase(), Name: 'CUSTOMSCOPEDEDGE' },
            existingTypes,
        );
        expect(err).not.toBeNull();
        expect(err?.Source).toBe('Name');
    });

    it('allows the same name in a different graph or when updating the same row', () => {
        expect(
            ValidateGraphEdgeTypeUniqueness(
                { ID: 'D0000001-0000-0000-0000-000000000099', GraphID: OTHER_GRAPH_ID, Name: 'CustomScopedEdge' },
                existingTypes,
            ),
        ).toBeNull();

        expect(
            ValidateGraphEdgeTypeUniqueness(
                { ID: 'D0000001-0000-0000-0000-000000000001', GraphID: null, Name: 'Broader Than' },
                existingTypes,
            ),
        ).toBeNull();
    });
});

describe('MJGraphEdgeProviderEntityServer (DriverClass & Configuration invariants)', () => {
    it('accepts a registered BaseGraphEdgeProvider DriverClass and valid JSON Configuration', () => {
        expect(ValidateGraphEdgeProviderDriverClass('QueryMetadataEdgeProvider', () => true)).toBeNull();
        expect(ValidateGraphEdgeProviderConfigurationJson(null)).toBeNull();
        expect(ValidateGraphEdgeProviderConfigurationJson('{"minCount": 5}')).toBeNull();
    });

    it('refuses an unregistered or blank DriverClass', () => {
        const blankErr = ValidateGraphEdgeProviderDriverClass('   ', () => true);
        expect(blankErr?.Source).toBe('DriverClass');

        const unregErr = ValidateGraphEdgeProviderDriverClass('NonExistentEdgeProvider', () => false);
        expect(unregErr).not.toBeNull();
        expect(unregErr?.Source).toBe('DriverClass');
        expect(unregErr?.Message).toContain('not registered under BaseGraphEdgeProvider');
    });

    it('refuses malformed JSON or non-object JSON in Configuration', () => {
        expect(ValidateGraphEdgeProviderConfigurationJson('{invalid')?.Source).toBe('Configuration');
        expect(ValidateGraphEdgeProviderConfigurationJson('[1, 2, 3]')?.Message).toContain('must be a JSON object');
        expect(ValidateGraphEdgeProviderConfigurationJson('"string"')?.Message).toContain('must be a JSON object');
    });
});
