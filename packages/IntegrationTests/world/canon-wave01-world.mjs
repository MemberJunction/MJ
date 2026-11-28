/**
 * Deterministic real-world multi-entity domain seed fixtures for Wave 0.1 Canon Full-Run Schema
 * dual-DBMS integration checks (SQL Server + PostgreSQL).
 *
 * Covers interconnected organizations, roles, users, graphs, authorities, search scopes,
 * AI agents, learning cycles, proposals, sources, notes, note lineage, and context items.
 */
export const CANON_WAVE01_WORLD = {
    seedTag: 'canon-wave01-world-v1',
    company: {
        ID: 'ca010001-7001-4001-8001-000000000001',
        Name: 'Northstar Systems (Canon Wave 0.1 Seed)',
        Description: 'Enterprise fixture company for Canon Wave 0.1 schema checks.',
        Website: 'https://northstar-canon.example.com',
    },
    roles: [
        {
            ID: 'ca020001-7001-4001-8001-000000000001',
            Name: 'Canon_Wave01_Reader_Role',
            Description: 'Role A for GraphPermission filtered unique role index parity check.',
        },
        {
            ID: 'ca020001-7001-4001-8001-000000000002',
            Name: 'Canon_Wave01_Approver_Role',
            Description: 'Role B for GraphPermission filtered unique role index parity check.',
        },
    ],
    users: [
        {
            ID: 'ca030001-7001-4001-8001-000000000001',
            Name: 'Ada Lovelace (Canon Seed Steward)',
            FirstName: 'Ada',
            LastName: 'Lovelace',
            Email: 'canon.ada@example.com',
        },
        {
            ID: 'ca030001-7001-4001-8001-000000000002',
            Name: 'Grace Hopper (Canon Seed Reviewer)',
            FirstName: 'Grace',
            LastName: 'Hopper',
            Email: 'canon.grace@example.com',
        },
    ],
    graph: {
        ID: 'ca040001-7001-4001-8001-000000000001',
        Name: 'Canon_Wave01_Test_Graph',
        Description: 'Test graph validating StaleMemberPolicy and PublishNonHumanApprovals.',
    },
    graphConcepts: [
        {
            ID: 'ca050001-7001-4001-8001-000000000001',
            Name: 'Wave01_Provisional_Policy_Concept',
            Description: 'Concept testing Provisional status and valid EffectiveFrom/EffectiveTo window.',
            Status: 'Provisional',
            EffectiveFrom: '2026-01-01T00:00:00Z',
            EffectiveTo: '2027-12-31T23:59:59Z',
        },
        {
            ID: 'ca050001-7001-4001-8001-000000000002',
            Name: 'Wave01_Target_Standard_Concept',
            Description: 'Approved target concept for GraphEdge Provisional and AuthorityTierID checks.',
            Status: 'Approved',
        },
    ],
    graphEdges: {
        validProvisionalID: 'ca060001-7001-4001-8001-000000000001',
    },
    graphPermissions: {
        userPermID: 'ca070001-7001-4001-8001-000000000001',
        rolePerm1ID: 'ca070001-7001-4001-8001-000000000002',
        rolePerm2ID: 'ca070001-7001-4001-8001-000000000003',
        invalidDualID: 'ca070001-7001-4001-8001-000000000091',
        invalidNullID: 'ca070001-7001-4001-8001-000000000092',
        invalidLevelID: 'ca070001-7001-4001-8001-000000000093',
    },
    searchScope: {
        ID: 'ca080001-7001-4001-8001-000000000001',
        Name: 'Canon_Wave01_Test_Scope',
        Description: 'Search scope validating SearchScopeGraph lane linkage.',
    },
    searchScopeGraphs: {
        validID: 'ca081001-7001-4001-8001-000000000001',
        dupID: 'ca081001-7001-4001-8001-000000000091',
    },
    aiAgent: {
        ID: 'ca090001-7001-4001-8001-000000000001',
        Name: 'Canon_Wave01_Memory_Agent',
        Description: 'Agent fixture testing AllowInFlightMemorySearch and learning cycle linkage.',
    },
    aiSkill: {
        ID: 'ca095001-7001-4001-8001-000000000001',
        Name: 'Canon_Wave01_Procedural_Skill',
        Instructions: 'Always cite approved graph concepts when answering policy questions.',
    },
    learningCycle: {
        ID: 'ca0a0001-7001-4001-8001-000000000001',
    },
    proposals: {
        mainID: 'ca0b0001-7001-4001-8001-000000000001',
        followupID: 'ca0b0001-7001-4001-8001-000000000002',
    },
    proposalSources: {
        noteSourceID: 'ca0c0001-7001-4001-8001-000000000001',
        polySourceID: 'ca0c0001-7001-4001-8001-000000000002',
        invalidDualID: 'ca0c0001-7001-4001-8001-000000000091',
    },
    notes: {
        source1ID: 'ca0d0001-7001-4001-8001-000000000001',
        source2ID: 'ca0d0001-7001-4001-8001-000000000002',
        consolidatedID: 'ca0d0001-7001-4001-8001-000000000003',
    },
    noteSources: {
        edge1ID: 'ca0e0001-7001-4001-8001-000000000001',
        edge2ID: 'ca0e0001-7001-4001-8001-000000000002',
        invalidSelfID: 'ca0e0001-7001-4001-8001-000000000091',
    },
    agentRun: {
        ID: 'ca0f0001-7001-4001-8001-000000000001',
    },
    contextItems: {
        noteInjectedID: 'ca100001-7001-4001-8001-000000000001',
        polyInjectedID: 'ca100001-7001-4001-8001-000000000002',
        invalidNoAnchorID: 'ca100001-7001-4001-8001-000000000091',
        invalidTwoTargetsID: 'ca100001-7001-4001-8001-000000000092',
    },
};
