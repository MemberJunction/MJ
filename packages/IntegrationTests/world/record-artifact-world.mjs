/**
 * Deterministic real-world multi-entity domain seed fixtures for Phase 0
 * MJ Docs Unification integration tests (`RecordArtifact` + delegated permissions).
 *
 * Covers 34 realistic domain records spanning:
 * - 3 Organizations (Companies)
 * - 4 Users (Owner, Editor, Reader, Restricted)
 * - 3 Roles + 3 UserRole assignments + 3 EntityPermission grants
 * - 6 Artifacts (delegated to Companies, custom-delegated, standalone)
 * - 6 ArtifactVersions (v1 and v2 immutable snapshots)
 * - 6 RecordArtifact polymorphic links across entities, roles, sequences, and pinned versions
 */

export const RECORD_ARTIFACT_WORLD = {
    seedRunTag: 'p01-record-artifact-world-v1',
    companies: [
        {
            ID: '11000001-7001-4001-8001-000000000001',
            Name: 'Acme Global Ventures (P01 Seed)',
            Description: 'Enterprise aerospace and industrial robotics partner.',
            Website: 'https://acme-ventures.example.com',
        },
        {
            ID: '11000001-7001-4001-8001-000000000002',
            Name: 'Northstar BioLabs (P01 Seed)',
            Description: 'Clinical diagnostics and genomics research organization.',
            Website: 'https://northstar-biolabs.example.com',
        },
        {
            ID: '11000001-7001-4001-8001-000000000003',
            Name: 'Meridian Logistics Group (P01 Seed)',
            Description: 'Global freight orchestration and cold-chain logistics.',
            Website: 'https://meridian-logistics.example.com',
        },
    ],
    roles: [
        {
            ID: '22000001-7001-4001-8001-000000000001',
            Name: 'P01_Company_Editor',
            Description: 'Read + Update permission on MJ: Companies for default delegation fallback tests.',
            CanRead: true,
            CanCreate: true,
            CanUpdate: true,
            CanDelete: false,
        },
        {
            ID: '22000001-7001-4001-8001-000000000002',
            Name: 'P01_Company_Reader',
            Description: 'Read-only permission on MJ: Companies for default delegation fallback tests.',
            CanRead: true,
            CanCreate: false,
            CanUpdate: false,
            CanDelete: false,
        },
        {
            ID: '22000001-7001-4001-8001-000000000003',
            Name: 'P01_Company_NoAccess',
            Description: 'Zero read permission on MJ: Companies for fail-closed delegation tests.',
            CanRead: false,
            CanCreate: false,
            CanUpdate: false,
            CanDelete: false,
        },
    ],
    users: [
        {
            ID: '33000001-7001-4001-8001-000000000001',
            Name: 'David Kim (P01 Owner)',
            FirstName: 'David',
            LastName: 'Kim',
            Email: 'p01.david.kim@example.com',
            RoleID: null,
        },
        {
            ID: '33000001-7001-4001-8001-000000000002',
            Name: 'Elena Vance (P01 Editor)',
            FirstName: 'Elena',
            LastName: 'Vance',
            Email: 'p01.elena.vance@example.com',
            RoleID: '22000001-7001-4001-8001-000000000001',
        },
        {
            ID: '33000001-7001-4001-8001-000000000003',
            Name: 'Marcus Chen (P01 Reader)',
            FirstName: 'Marcus',
            LastName: 'Chen',
            Email: 'p01.marcus.chen@example.com',
            RoleID: '22000001-7001-4001-8001-000000000002',
        },
        {
            ID: '33000001-7001-4001-8001-000000000004',
            Name: 'Priya Patel (P01 Restricted)',
            FirstName: 'Priya',
            LastName: 'Patel',
            Email: 'p01.priya.patel@example.com',
            RoleID: '22000001-7001-4001-8001-000000000003',
        },
    ],
    artifacts: [
        {
            ID: '44000001-7001-4001-8001-000000000001',
            Name: 'Acme Q4 Account Strategy Brief',
            Description: 'Executive account strategy delegated to Acme Global Ventures.',
            OwnerUserID: '33000001-7001-4001-8001-000000000001',
            DelegateEntityName: 'MJ: Companies',
            DelegateRecordID: '11000001-7001-4001-8001-000000000001',
        },
        {
            ID: '44000001-7001-4001-8001-000000000002',
            Name: 'Acme Technical Architecture Proposal',
            Description: 'Joint systems integration blueprint for Acme Global Ventures.',
            OwnerUserID: '33000001-7001-4001-8001-000000000001',
            DelegateEntityName: 'MJ: Companies',
            DelegateRecordID: '11000001-7001-4001-8001-000000000001',
        },
        {
            ID: '44000001-7001-4001-8001-000000000003',
            Name: 'Northstar Clinical Compliance Spec',
            Description: 'HIPAA & FDA Part 11 data governance specification.',
            OwnerUserID: '33000001-7001-4001-8001-000000000001',
            DelegateEntityName: 'MJ: Companies',
            DelegateRecordID: '11000001-7001-4001-8001-000000000002',
        },
        {
            ID: '44000001-7001-4001-8001-000000000004',
            Name: 'Meridian Cold-Chain SLA Review',
            Description: 'Quarterly service level review and telemetry audit.',
            OwnerUserID: '33000001-7001-4001-8001-000000000001',
            DelegateEntityName: 'MJ: Companies',
            DelegateRecordID: '11000001-7001-4001-8001-000000000003',
        },
        {
            ID: '44000001-7001-4001-8001-000000000005',
            Name: 'Northstar Missing Host Record Doc',
            Description: 'Artifact pointing to a nonexistent company record ID to verify fail-closed RLS.',
            OwnerUserID: '33000001-7001-4001-8001-000000000001',
            DelegateEntityName: 'MJ: Companies',
            DelegateRecordID: '11000001-7001-4001-8001-999999999999',
        },
        {
            ID: '44000001-7001-4001-8001-000000000006',
            Name: 'Standalone Private Executive Memo',
            Description: 'Non-delegated artifact owned solely by David Kim.',
            OwnerUserID: '33000001-7001-4001-8001-000000000001',
            DelegateEntityName: null,
            DelegateRecordID: null,
        },
    ],
    artifactVersions: [
        {
            ID: '55000001-7001-4001-8001-000000000001',
            ArtifactID: '44000001-7001-4001-8001-000000000001',
            VersionNumber: 1,
            Content: '# Acme Q4 Account Strategy\n\nInitial strategy brief targeting robotic assembly expansion.',
            UserID: '33000001-7001-4001-8001-000000000001',
        },
        {
            ID: '55000001-7001-4001-8001-000000000002',
            ArtifactID: '44000001-7001-4001-8001-000000000001',
            VersionNumber: 2,
            Content: '# Acme Q4 Account Strategy (Revised)\n\nUpdated with executive sponsor alignment.',
            UserID: '33000001-7001-4001-8001-000000000002',
        },
        {
            ID: '55000001-7001-4001-8001-000000000003',
            ArtifactID: '44000001-7001-4001-8001-000000000002',
            VersionNumber: 1,
            Content: '# Acme Architecture Proposal\n\nEvent-driven ERP and telemetry ingestion pipeline.',
            UserID: '33000001-7001-4001-8001-000000000001',
        },
        {
            ID: '55000001-7001-4001-8001-000000000004',
            ArtifactID: '44000001-7001-4001-8001-000000000003',
            VersionNumber: 1,
            Content: '# Northstar Clinical Compliance Spec\n\nAudit trail and e-signature retention rules.',
            UserID: '33000001-7001-4001-8001-000000000001',
        },
        {
            ID: '55000001-7001-4001-8001-000000000005',
            ArtifactID: '44000001-7001-4001-8001-000000000004',
            VersionNumber: 1,
            Content: '# Meridian Cold-Chain SLA Review\n\n99.94% thermal compliance across 14 hubs.',
            UserID: '33000001-7001-4001-8001-000000000001',
        },
        {
            ID: '55000001-7001-4001-8001-000000000006',
            ArtifactID: '44000001-7001-4001-8001-000000000006',
            VersionNumber: 1,
            Content: '# Private Executive Memo\n\nInternal board preparation notes.',
            UserID: '33000001-7001-4001-8001-000000000001',
        },
    ],
    recordArtifacts: [
        {
            ID: '66000001-7001-4001-8001-000000000001',
            EntityName: 'MJ: Companies',
            RecordID: '11000001-7001-4001-8001-000000000001',
            ArtifactID: '44000001-7001-4001-8001-000000000001',
            PinnedArtifactVersionID: null,
            Role: null, // omitted on insert to verify DB DEFAULT 'General'
            Sequence: 1,
            ContextDescription: 'Primary account strategy brief pinned to Acme Global Ventures.',
            LinkedByUserID: '33000001-7001-4001-8001-000000000001',
        },
        {
            ID: '66000001-7001-4001-8001-000000000002',
            EntityName: 'MJ: Companies',
            RecordID: '11000001-7001-4001-8001-000000000001',
            ArtifactID: '44000001-7001-4001-8001-000000000001',
            PinnedArtifactVersionID: '55000001-7001-4001-8001-000000000001',
            Role: 'BoardSnapshot',
            Sequence: 2,
            ContextDescription: 'Immutable v1 snapshot attached under distinct semantic role.',
            LinkedByUserID: '33000001-7001-4001-8001-000000000002',
        },
        {
            ID: '66000001-7001-4001-8001-000000000003',
            EntityName: 'MJ: Companies',
            RecordID: '11000001-7001-4001-8001-000000000001',
            ArtifactID: '44000001-7001-4001-8001-000000000002',
            PinnedArtifactVersionID: '55000001-7001-4001-8001-000000000003',
            Role: 'Proposal',
            Sequence: 3,
            ContextDescription: 'Technical proposal for Q4 systems integration.',
            LinkedByUserID: '33000001-7001-4001-8001-000000000002',
        },
        {
            ID: '66000001-7001-4001-8001-000000000004',
            EntityName: 'MJ: Companies',
            RecordID: '11000001-7001-4001-8001-000000000002',
            ArtifactID: '44000001-7001-4001-8001-000000000003',
            PinnedArtifactVersionID: null,
            Role: 'Spec',
            Sequence: 1,
            ContextDescription: 'Active living clinical compliance specification.',
            LinkedByUserID: '33000001-7001-4001-8001-000000000001',
        },
        {
            ID: '66000001-7001-4001-8001-000000000005',
            EntityName: 'MJ: Companies',
            RecordID: '11000001-7001-4001-8001-000000000003',
            ArtifactID: '44000001-7001-4001-8001-000000000004',
            PinnedArtifactVersionID: '55000001-7001-4001-8001-000000000005',
            Role: 'Review',
            Sequence: 1,
            ContextDescription: 'Quarterly cold-chain SLA audit.',
            LinkedByUserID: '33000001-7001-4001-8001-000000000003',
        },
        {
            ID: '66000001-7001-4001-8001-000000000006',
            EntityName: 'MJ: Users',
            RecordID: '11000001-7001-4001-8001-000000000001', // same RecordID + ArtifactID + Role ('General') under a DIFFERENT EntityID
            ArtifactID: '44000001-7001-4001-8001-000000000001',
            PinnedArtifactVersionID: null,
            Role: 'General',
            Sequence: 1,
            ContextDescription: 'Proves EntityID participates in UQ_RecordArtifact_Record_Artifact_Role.',
            LinkedByUserID: '33000001-7001-4001-8001-000000000001',
        },
    ],
};

export function countSeededWorldRecords() {
    const userRoleAssignments = RECORD_ARTIFACT_WORLD.users.filter((u) => u.RoleID !== null).length;
    const entityPermissions = RECORD_ARTIFACT_WORLD.roles.length;
    return (
        RECORD_ARTIFACT_WORLD.companies.length +
        RECORD_ARTIFACT_WORLD.roles.length +
        RECORD_ARTIFACT_WORLD.users.length +
        userRoleAssignments +
        entityPermissions +
        RECORD_ARTIFACT_WORLD.artifacts.length +
        RECORD_ARTIFACT_WORLD.artifactVersions.length +
        RECORD_ARTIFACT_WORLD.recordArtifacts.length
    );
}
