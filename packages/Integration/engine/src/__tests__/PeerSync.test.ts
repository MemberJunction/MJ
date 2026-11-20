import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    BaseEntity,
    BaseEntityEvent,
    EntityInfo,
    IMetadataProvider,
    IRunViewProvider,
    RunViewResult,
    SyncContext,
    UserInfo,
} from '@memberjunction/core';
import {
    BuildCompositeWatermarkWhereClause,
    CoalesceRecordChanges,
    CompareCompositeCursor,
    ComputePairingID,
    ComputeThreeWayFieldMerge,
    InProcessPeerSyncTransport,
    MemberJunctionConnector,
    OrderChangesBySelfReference,
    ParseMatchStrategy,
    PeerDoorbellNotification,
    PeerEntitySchemaFingerprint,
    PeerIdentityGate,
    PeerManifest,
    PeerRecordChangeEntry,
    PeerSyncApplier,
    PeerSyncDoorbell,
    PeerSyncEndpointService,
    PlanPeerEntityOrder,
    SchemaPlanner,
} from '../index.js';
import { UUIDsEqual } from '@memberjunction/global';
import type { ICompanyIntegrationEntityMap, ICompanyIntegrationFieldMap } from '../entity-types.js';
import type { SyncResult } from '../types.js';
import type {
    MJCompanyIntegrationEntity,
    MJCompanyIntegrationRunEntity,
} from '@memberjunction/core-entities';

const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const ENTITY_CONTACTS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENTITY_COMPANIES_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createContextUser(): UserInfo {
    return {
        ID: '99999999-9999-4999-8999-999999999999',
        Name: 'Sync Bot',
        Email: 'syncbot@example.com',
    } as UserInfo;
}

function buildSampleFingerprint(
    overrides?: Partial<PeerEntitySchemaFingerprint>
): PeerEntitySchemaFingerprint {
    const planner = new SchemaPlanner();
    const base: PeerEntitySchemaFingerprint = {
        EntityName: 'Contacts',
        SchemaName: 'crm',
        BaseTable: 'Contact',
        BaseView: 'vwContacts',
        PrimaryKeyFieldNames: ['ID'],
        TrackRecordChanges: true,
        FingerprintHash: '',
        Fields: [
            {
                Name: 'ID',
                Type: 'uniqueidentifier',
                SQLFullType: 'uniqueidentifier',
                AllowsNull: false,
                MaxLength: null,
                Precision: null,
                Scale: null,
                DefaultValue: 'newsequentialid()',
                IsPrimaryKey: true,
                IsVirtual: false,
                RelatedEntityName: null,
                RelatedEntityFieldName: null,
            },
            {
                Name: 'Email',
                Type: 'nvarchar',
                SQLFullType: 'nvarchar(255)',
                AllowsNull: false,
                MaxLength: 255,
                Precision: null,
                Scale: null,
                DefaultValue: null,
                IsPrimaryKey: false,
                IsVirtual: false,
                RelatedEntityName: null,
                RelatedEntityFieldName: null,
            },
            {
                Name: 'FirstName',
                Type: 'nvarchar',
                SQLFullType: 'nvarchar(100)',
                AllowsNull: true,
                MaxLength: 100,
                Precision: null,
                Scale: null,
                DefaultValue: null,
                IsPrimaryKey: false,
                IsVirtual: false,
                RelatedEntityName: null,
                RelatedEntityFieldName: null,
            },
        ],
        ...overrides,
    };
    base.FingerprintHash = planner.ComputeEntityHash(base);
    return base;
}

function buildManifest(instanceID: string, version = '5.27.0'): PeerManifest {
    return {
        InstanceID: instanceID,
        InstanceName: `Peer-${instanceID.slice(0, 4)}`,
        MJCoreVersion: version,
        DatabaseEngine: 'SQLServer',
        ServerTimestamp: '2026-04-20T00:00:00.000Z',
        SupportedCapabilities: ['SchemaFingerprint', 'ChangeCoalescing', 'ThreeWayMerge'],
        AllowedEntityNames: ['Contacts', 'Companies'],
    };
}

describe('MJ Peer Sync — Phase 1–4 Suite', () => {
    describe('ComputePairingID & SchemaPlanner', () => {
        it('computes an identical PairingID regardless of peer argument order or UUID casing', () => {
            const idAB = ComputePairingID(INSTANCE_A.toUpperCase(), INSTANCE_B.toLowerCase());
            const idBA = ComputePairingID(INSTANCE_B.toUpperCase(), INSTANCE_A.toLowerCase());
            expect(idAB).toBe(idBA);
            expect(idAB).toMatch(/^[0-9a-f]{64}$/);
        });

        it('returns Identical when both peers have matching entity schemas', () => {
            const planner = new SchemaPlanner();
            const fpA = buildSampleFingerprint();
            const fpB = buildSampleFingerprint();
            const plan = planner.BuildReconciliationPlan(
                buildManifest(INSTANCE_A),
                buildManifest(INSTANCE_B),
                [fpA],
                [fpB]
            );

            expect(plan.OverallVerdict).toBe('Identical');
            expect(plan.CoreVersionCompatible).toBe(true);
            expect(plan.BlockedEntities).toHaveLength(0);
            expect(plan.EntityResults[0].Diffs).toHaveLength(0);
        });

        it('classifies optional remote-only fields as CompatibleSuperset and required remote-only fields without default as IncompatibleConstraint', () => {
            const planner = new SchemaPlanner();
            const localFp = buildSampleFingerprint();
            const remoteWithOptional = buildSampleFingerprint({
                Fields: [
                    ...localFp.Fields,
                    {
                        Name: 'MiddleName',
                        Type: 'nvarchar',
                        SQLFullType: 'nvarchar(100)',
                        AllowsNull: true,
                        MaxLength: 100,
                        Precision: null,
                        Scale: null,
                        DefaultValue: null,
                        IsPrimaryKey: false,
                        IsVirtual: false,
                        RelatedEntityName: null,
                        RelatedEntityFieldName: null,
                    },
                ],
            });

            const planSuperset = planner.BuildReconciliationPlan(
                buildManifest(INSTANCE_A),
                buildManifest(INSTANCE_B),
                [localFp],
                [remoteWithOptional]
            );
            expect(planSuperset.OverallVerdict).toBe('CompatibleSuperset');
            expect(planSuperset.BlockedEntities).toHaveLength(0);

            const remoteWithRequiredNoDefault = buildSampleFingerprint({
                Fields: [
                    ...localFp.Fields,
                    {
                        Name: 'TaxID',
                        Type: 'nvarchar',
                        SQLFullType: 'nvarchar(50)',
                        AllowsNull: false,
                        MaxLength: 50,
                        Precision: null,
                        Scale: null,
                        DefaultValue: null,
                        IsPrimaryKey: false,
                        IsVirtual: false,
                        RelatedEntityName: null,
                        RelatedEntityFieldName: null,
                    },
                ],
            });

            const planBlocked = planner.BuildReconciliationPlan(
                buildManifest(INSTANCE_A),
                buildManifest(INSTANCE_B),
                [localFp],
                [remoteWithRequiredNoDefault]
            );
            expect(planBlocked.OverallVerdict).toBe('IncompatibleConstraint');
            expect(planBlocked.BlockedEntities).toContain('Contacts');
        });

        it('detects TypeWidening when remote string length exceeds local string length and IncompatibleType on family mismatch', () => {
            const planner = new SchemaPlanner();
            const localFp = buildSampleFingerprint();
            const remoteWider = buildSampleFingerprint({
                Fields: localFp.Fields.map(f =>
                    f.Name === 'FirstName'
                        ? { ...f, MaxLength: 500, SQLFullType: 'nvarchar(500)' }
                        : f
                ),
            });

            const widenPlan = planner.BuildReconciliationPlan(
                buildManifest(INSTANCE_A),
                buildManifest(INSTANCE_B),
                [localFp],
                [remoteWider]
            );
            expect(widenPlan.OverallVerdict).toBe('AutoEvolvable');
            expect(widenPlan.AutoEvolvableEntities).toContain('Contacts');
            expect(widenPlan.EntityResults[0].Diffs[0].Kind).toBe('TypeWidening');

            const remoteIncompatible = buildSampleFingerprint({
                Fields: localFp.Fields.map(f =>
                    f.Name === 'FirstName' ? { ...f, Type: 'int', SQLFullType: 'int' } : f
                ),
            });
            const incompatPlan = planner.BuildReconciliationPlan(
                buildManifest(INSTANCE_A),
                buildManifest(INSTANCE_B),
                [localFp],
                [remoteIncompatible]
            );
            expect(incompatPlan.OverallVerdict).toBe('IncompatibleType');
            expect(incompatPlan.BlockedEntities).toContain('Contacts');
        });

        it('detects CoreVersionMismatch when major versions differ', () => {
            const planner = new SchemaPlanner();
            const fp = buildSampleFingerprint();
            const plan = planner.BuildReconciliationPlan(
                buildManifest(INSTANCE_A, '5.27.0'),
                buildManifest(INSTANCE_B, '6.0.0'),
                [fp],
                [fp]
            );
            expect(plan.CoreVersionCompatible).toBe(false);
            expect(plan.OverallVerdict).toBe('CoreVersionMismatch');
        });
    });

    describe('ChangeSetPlanner — Coalescing, Cursors & Tarjan SCC Ordering', () => {
        it('builds composite watermark WHERE clauses that filter out Source = Sync and tie-break on ID', () => {
            const initialSql = BuildCompositeWatermarkWhereClause(ENTITY_CONTACTS_ID, null);
            expect(initialSql).toContain(`EntityID='${ENTITY_CONTACTS_ID}'`);
            expect(initialSql).toContain(`(Source IS NULL OR Source <> 'Sync')`);

            const cursorSql = BuildCompositeWatermarkWhereClause(ENTITY_CONTACTS_ID, {
                ChangedAt: '2026-04-20T12:00:00.000Z',
                ChangeID: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            });
            expect(cursorSql).toContain(
                `ChangedAt > '2026-04-20T12:00:00.000Z' OR (ChangedAt = '2026-04-20T12:00:00.000Z' AND ID > 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')`
            );

            expect(
                CompareCompositeCursor(
                    { ChangedAt: '2026-04-20T12:00:00.000Z', ChangeID: '0001' },
                    { ChangedAt: '2026-04-20T12:00:00.000Z', ChangeID: '0002' }
                )
            ).toBeLessThan(0);
        });

        it('coalesces Create+Update->Create, Create+Delete->elided, Update+Update->Update with earliest AncestorData, and skips Source=Sync', () => {
            const rawChanges: PeerRecordChangeEntry[] = [
                // Record 1: Create then Update -> net Create with updated title
                {
                    ID: '00000001',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'rec-1',
                    Type: 'Create',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T10:00:00.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({
                        ID: 'rec-1',
                        FirstName: 'Ada',
                        Title: 'Engineer',
                    }),
                },
                {
                    ID: '00000002',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'rec-1',
                    Type: 'Update',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T10:01:00.000Z',
                    ChangesJSON: JSON.stringify({
                        Title: {
                            fieldName: 'Title',
                            oldValue: 'Engineer',
                            newValue: 'Principal Engineer',
                        },
                    }),
                    FullRecordJSON: JSON.stringify({
                        ID: 'rec-1',
                        FirstName: 'Ada',
                        Title: 'Principal Engineer',
                    }),
                },
                // Record 2: Create then Delete in same window -> elided completely
                {
                    ID: '00000003',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'rec-2',
                    Type: 'Create',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T10:02:00.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({ ID: 'rec-2', FirstName: 'Temp' }),
                },
                {
                    ID: '00000004',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'rec-2',
                    Type: 'Delete',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T10:03:00.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({ ID: 'rec-2', FirstName: 'Temp' }),
                },
                // Record 3: Two Updates -> net Update with earliest oldValue in AncestorData
                {
                    ID: '00000005',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'rec-3',
                    Type: 'Update',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T10:04:00.000Z',
                    ChangesJSON: JSON.stringify({
                        City: { fieldName: 'City', oldValue: 'Boston', newValue: 'Austin' },
                    }),
                    FullRecordJSON: JSON.stringify({
                        ID: 'rec-3',
                        FirstName: 'Grace',
                        City: 'Austin',
                    }),
                },
                {
                    ID: '00000006',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'rec-3',
                    Type: 'Update',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T10:05:00.000Z',
                    ChangesJSON: JSON.stringify({
                        City: { fieldName: 'City', oldValue: 'Austin', newValue: 'Seattle' },
                    }),
                    FullRecordJSON: JSON.stringify({
                        ID: 'rec-3',
                        FirstName: 'Grace',
                        City: 'Seattle',
                    }),
                },
                // Record 4: Inbound Sync change -> must be ignored
                {
                    ID: '00000007',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'rec-4',
                    Type: 'Create',
                    Source: 'Sync',
                    ChangedAt: '2026-04-20T10:06:00.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({ ID: 'rec-4', FirstName: 'Echo' }),
                },
            ];

            const coalesced = CoalesceRecordChanges(rawChanges);
            expect(coalesced).toHaveLength(2);

            const rec1 = coalesced.find(c => c.SourceRecordID === 'rec-1')!;
            expect(rec1.Operation).toBe('Create');
            expect(rec1.RecordData['Title']).toBe('Principal Engineer');
            expect(rec1.AncestorData).toBeNull();

            const rec3 = coalesced.find(c => c.SourceRecordID === 'rec-3')!;
            expect(rec3.Operation).toBe('Update');
            expect(rec3.RecordData['City']).toBe('Seattle');
            expect(rec3.AncestorData?.['City']).toBe('Boston');
            expect(rec3.ChangedFields).toContain('City');
        });

        it('plans entity dependency order via Tarjan SCC and breaks cycles using nullable FKs', () => {
            const mockEntities: EntityInfo[] = [
                {
                    ID: ENTITY_COMPANIES_ID,
                    Name: 'Companies',
                    Fields: [
                        {
                            Name: 'PrimaryContactID',
                            RelatedEntityID: ENTITY_CONTACTS_ID,
                            AllowsNull: true,
                        },
                    ],
                    ParentEntityInfo: null,
                    GetUserPermisions: () => ({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true }),
                    GetEffectiveRowFilterWhereClause: () => '',
                } as unknown as EntityInfo,
                {
                    ID: ENTITY_CONTACTS_ID,
                    Name: 'Contacts',
                    Fields: [
                        {
                            Name: 'CompanyID',
                            RelatedEntityID: ENTITY_COMPANIES_ID,
                            AllowsNull: false,
                        },
                        {
                            Name: 'ReportsToID',
                            RelatedEntityID: ENTITY_CONTACTS_ID,
                            AllowsNull: true,
                        },
                    ],
                    ParentEntityInfo: null,
                    GetUserPermisions: () => ({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true }),
                    GetEffectiveRowFilterWhereClause: () => '',
                } as unknown as EntityInfo,
            ];

            const mockProvider = { Entities: mockEntities } as unknown as IMetadataProvider;
            const plan = PlanPeerEntityOrder(
                [ENTITY_CONTACTS_ID, ENTITY_COMPANIES_ID],
                mockProvider
            );

            // Since Contacts.CompanyID is NOT NULL and Companies.PrimaryContactID IS NULLABLE,
            // Companies.PrimaryContactID is deferred to Pass 2 so Companies is synced before Contacts!
            expect(plan.UnresolvableCycles).toHaveLength(0);
            expect(plan.DeferredNullableFields).toHaveLength(1);
            expect(plan.DeferredNullableFields[0].FieldName).toBe('PrimaryContactID');
            expect(plan.OrderedEntityIDs).toEqual([ENTITY_COMPANIES_ID, ENTITY_CONTACTS_ID]);
            expect(plan.SelfReferencingFields).toHaveLength(1);
            expect(plan.SelfReferencingFields[0].FieldName).toBe('ReportsToID');
        });

        it('orders self-referencing records parent-before-child on Create/Update and child-before-parent on Delete', () => {
            const ordered = OrderChangesBySelfReference(
                [
                    {
                        EntityName: 'Contacts',
                        SourceRecordID: 'child-id',
                        Operation: 'Create',
                        RecordData: { ID: 'child-id', ReportsToID: 'parent-id' },
                        AncestorData: null,
                        ChangedFields: [],
                        LatestChangedAt: '2026-04-20T10:00:00.000Z',
                        LatestChangeID: 'c2',
                    },
                    {
                        EntityName: 'Contacts',
                        SourceRecordID: 'parent-id',
                        Operation: 'Create',
                        RecordData: { ID: 'parent-id', ReportsToID: null },
                        AncestorData: null,
                        ChangedFields: [],
                        LatestChangedAt: '2026-04-20T10:00:00.000Z',
                        LatestChangeID: 'c1',
                    },
                ],
                'ID',
                ['ReportsToID']
            );

            expect(ordered.map(c => c.SourceRecordID)).toEqual(['parent-id', 'child-id']);
        });
    });

    describe('ThreeWayMerge & ParseMatchStrategy', () => {
        it('merges non-overlapping field edits cleanly and honors Manual conflict quarantine', () => {
            const mappings = [
                { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
                { SourceFieldName: 'Title', DestinationFieldName: 'Title' },
            ];

            // Non-overlapping: local changed FirstName, remote changed Title
            const cleanMerge = ComputeThreeWayFieldMerge({
                Base: { FirstName: 'Ada', Title: 'Engineer' },
                Ours: { FirstName: 'Augusta', Title: 'Engineer' },
                Theirs: { FirstName: 'Ada', Title: 'CTO' },
                FieldMappings: mappings,
                ConflictResolution: 'SourceWins',
                OutputKeyMode: 'destination',
            });

            expect(cleanMerge.Action).toBe('proceed');
            expect(cleanMerge.ConflictFields).toHaveLength(0);
            expect(cleanMerge.MergedFields).toEqual({
                FirstName: 'Augusta',
                Title: 'CTO',
            });

            // Overlapping conflict under Manual policy -> Action === 'skip'
            const manualConflict = ComputeThreeWayFieldMerge({
                Base: { FirstName: 'Ada', Title: 'Engineer' },
                Ours: { FirstName: 'Ada', Title: 'VP Engineering' },
                Theirs: { FirstName: 'Ada', Title: 'CTO' },
                FieldMappings: mappings,
                ConflictResolution: 'Manual',
                OutputKeyMode: 'destination',
            });

            expect(manualConflict.Action).toBe('skip');
            expect(manualConflict.ManualConflict).toBe(true);
            expect(manualConflict.ConflictFields).toEqual(['Title']);
        });

        it('parses MatchStrategy JSON with safe defaults', () => {
            const defaultStrategy = ParseMatchStrategy(null);
            expect(defaultStrategy.Mode).toBe('KeyFields');
            expect(defaultStrategy.OnAmbiguousMatch).toBe('FirstMatch');

            const hybridStrategy = ParseMatchStrategy(JSON.stringify({ Mode: 'Hybrid' }));
            expect(hybridStrategy.Mode).toBe('Hybrid');
            expect(hybridStrategy.OnAmbiguousMatch).toBe('SkipAndQuarantine');
        });
    });

    describe('PeerIdentityGate — 5-Step Hybrid Cascade', () => {
        const user = createContextUser();
        const baseChange = {
            EntityName: 'Contacts',
            SourceRecordID: 'remote-contact-1',
            Operation: 'Create' as const,
            RecordData: { ID: 'remote-contact-1', Email: 'ada@example.com' },
            AncestorData: null,
            ChangedFields: ['Email'],
            LatestChangedAt: '2026-04-20T12:00:00.000Z',
            LatestChangeID: 'chg-1',
        };

        it('matches immediately on Step 1 when SourceRecordID is in CompanyIntegrationRecordMap', async () => {
            const gate = new PeerIdentityGate();
            const lookup = new Map<string, string>([['remote-contact-1', 'local-contact-99']]);

            const res = await gate.ResolveIdentity({
                CompanyIntegrationID: 'ci-1',
                EntityID: ENTITY_CONTACTS_ID,
                EntityName: 'Contacts',
                PrimaryKeyFieldName: 'ID',
                Change: baseChange,
                DestinationValues: { Email: 'ada@example.com' },
                FieldMaps: [],
                MatchStrategyJSON: null,
                RecordMapLookup: lookup,
                PreservePrimaryKeys: false,
                DuplicateThreshold: 0.92,
                PotentialMatchThreshold: 0.75,
                ContextUser: user,
            });

            expect(res.Outcome).toBe('Matched');
            expect(res.MatchedBy).toBe('RecordMap');
            expect(res.LocalRecordID).toBe('local-contact-99');
        });

        it('auto-links on Step 4 when DuplicateFinder score >= DuplicateThreshold and quarantines when in [PotentialMatchThreshold, DuplicateThreshold)', async () => {
            const gate = new PeerIdentityGate();

            const highConfidenceFinder = {
                FindCandidatesForValues: vi.fn().mockResolvedValue([
                    { RecordID: 'local-dup-1', ProbabilityScore: 0.96 },
                ]),
            };

            const matched = await gate.ResolveIdentity({
                CompanyIntegrationID: 'ci-1',
                EntityID: ENTITY_CONTACTS_ID,
                EntityName: 'Contacts',
                PrimaryKeyFieldName: 'ID',
                Change: baseChange,
                DestinationValues: { Email: 'ada@example.com' },
                FieldMaps: [],
                MatchStrategyJSON: JSON.stringify({ Mode: 'DuplicateDetection' }),
                RecordMapLookup: new Map(),
                PreservePrimaryKeys: false,
                DuplicateThreshold: 0.92,
                PotentialMatchThreshold: 0.75,
                DuplicateFinder: highConfidenceFinder,
                ContextUser: user,
            });

            expect(matched.Outcome).toBe('Matched');
            expect(matched.MatchedBy).toBe('DuplicateDetection');
            expect(matched.LocalRecordID).toBe('local-dup-1');

            const greyZoneFinder = {
                FindCandidatesForValues: vi.fn().mockResolvedValue([
                    { RecordID: 'local-maybe-1', ProbabilityScore: 0.81 },
                ]),
            };

            const quarantined = await gate.ResolveIdentity({
                CompanyIntegrationID: 'ci-1',
                EntityID: ENTITY_CONTACTS_ID,
                EntityName: 'Contacts',
                PrimaryKeyFieldName: 'ID',
                Change: baseChange,
                DestinationValues: { Email: 'ada@example.com' },
                FieldMaps: [],
                MatchStrategyJSON: JSON.stringify({ Mode: 'DuplicateDetection' }),
                RecordMapLookup: new Map(),
                PreservePrimaryKeys: false,
                DuplicateThreshold: 0.92,
                PotentialMatchThreshold: 0.75,
                DuplicateFinder: greyZoneFinder,
                ContextUser: user,
            });

            expect(quarantined.Outcome).toBe('Quarantined');
            expect(quarantined.MatchedBy).toBe('DuplicateDetection');
            expect(quarantined.CandidateIDs).toEqual(['local-maybe-1']);
        });
    });

    describe('PeerSyncDoorbell — Loop Prevention, Debounce & Backoff', () => {
        beforeEach(() => {
            PeerSyncDoorbell.Instance.StopAll();
        });

        afterEach(() => {
            PeerSyncDoorbell.Instance.StopAll();
        });

        it('ignores entity save events carrying SyncContext and coalesces local saves into NotifyChangeBatch', async () => {
            const notifications: PeerDoorbellNotification[] = [];
            const mockTransport = {
                GetManifest: vi.fn(),
                GetSchemaFingerprint: vi.fn(),
                PreviewSchemaPlan: vi.fn(),
                FetchChangeBatch: vi.fn(),
                ApplyChangeBatch: vi.fn(),
                FlushDeferredForeignKeys: vi.fn().mockResolvedValue({ updatedCount: 0, errorCount: 0, errors: [] }),
                NotifyChangeBatch: vi.fn(async (n: PeerDoorbellNotification) => {
                    notifications.push(n);
                    return { Accepted: true, TriggeredRunID: 'run-1' };
                }),
            };

            const pairingID = ComputePairingID(INSTANCE_A, INSTANCE_B);
            PeerSyncDoorbell.Instance.RegisterPairing({
                PairingID: pairingID,
                LocalInstanceID: INSTANCE_A,
                Transport: mockTransport,
                WatchedEntityNames: ['Contacts', 'Companies'],
                DebounceMs: 5000,
            });

            // 1. Event with SyncContext present -> MUST be ignored
            const syncEvt = new BaseEntityEvent();
            syncEvt.type = 'save';
            syncEvt.entityName = 'Contacts';
            syncEvt.baseEntity = {
                EntityInfo: { Name: 'Contacts' },
                SyncContext: {
                    OriginDeploymentID: INSTANCE_B,
                    PairingID: pairingID,
                    RunID: 'run-inbound',
                    OriginChangeIDs: ['chg-1'],
                    OriginUserEmail: 'bot@example.com',
                },
            } as unknown as BaseEntity;

            PeerSyncDoorbell.Instance.HandleEntityEvent(syncEvt);
            expect(
                PeerSyncDoorbell.Instance.GetPairingStats(pairingID)?.PendingEntityNames
            ).toHaveLength(0);

            // 2. Local user saves on Contacts and Companies -> queued and coalesced
            const localContactEvt = new BaseEntityEvent();
            localContactEvt.type = 'save';
            localContactEvt.entityName = 'Contacts';
            localContactEvt.baseEntity = null;
            PeerSyncDoorbell.Instance.HandleEntityEvent(localContactEvt);

            const localCompanyEvt = new BaseEntityEvent();
            localCompanyEvt.type = 'delete';
            localCompanyEvt.entityName = 'Companies';
            localCompanyEvt.baseEntity = null;
            PeerSyncDoorbell.Instance.HandleEntityEvent(localCompanyEvt);

            const flushed = await PeerSyncDoorbell.Instance.FlushPairing(pairingID);
            expect(flushed).toBe(true);
            expect(notifications).toHaveLength(1);
            expect(notifications[0].ChangedEntityNames).toEqual(['Contacts', 'Companies']);
        });
    });

    describe('End-to-End Bidirectional Sync via MemberJunctionConnector & PeerSyncEndpointService', () => {
        it('executes full bidirectional Pull + Push between Peer A and Peer B while tagging inbound writes with SyncContext', async () => {
            const user = createContextUser();
            const contactEntityInfo = {
                ID: ENTITY_CONTACTS_ID,
                Name: 'Contacts',
                SchemaName: 'crm',
                BaseTable: 'Contact',
                BaseView: 'vwContacts',
                TrackRecordChanges: true,
                PrimaryKeys: [{ Name: 'ID' }],
                FirstPrimaryKey: { Name: 'ID' },
                ParentEntityInfo: null,
                GetUserPermisions: () => ({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true }),
                GetEffectiveRowFilterWhereClause: () => '',
                Fields: [
                    {
                        Name: 'ID',
                        DisplayNameOrName: 'ID',
                        Type: 'uniqueidentifier',
                        SQLFullType: 'uniqueidentifier',
                        AllowsNull: false,
                        MaxLength: 0,
                        Precision: 0,
                        Scale: 0,
                        DefaultValue: null,
                        IsPrimaryKey: true,
                        IsVirtual: false,
                        ReadOnly: false,
                        HasDefaultValue: true,
                        RelatedEntityID: null,
                        RelatedEntity: null,
                        RelatedEntityFieldName: null,
                    },
                    {
                        Name: 'Email',
                        DisplayNameOrName: 'Email',
                        Type: 'nvarchar',
                        SQLFullType: 'nvarchar(255)',
                        AllowsNull: false,
                        MaxLength: 255,
                        Precision: 0,
                        Scale: 0,
                        DefaultValue: null,
                        IsPrimaryKey: false,
                        IsVirtual: false,
                        ReadOnly: false,
                        HasDefaultValue: false,
                        RelatedEntityID: null,
                        RelatedEntity: null,
                        RelatedEntityFieldName: null,
                    },
                    {
                        Name: 'FirstName',
                        DisplayNameOrName: 'FirstName',
                        Type: 'nvarchar',
                        SQLFullType: 'nvarchar(100)',
                        AllowsNull: true,
                        MaxLength: 100,
                        Precision: 0,
                        Scale: 0,
                        DefaultValue: null,
                        IsPrimaryKey: false,
                        IsVirtual: false,
                        ReadOnly: false,
                        HasDefaultValue: false,
                        RelatedEntityID: null,
                        RelatedEntity: null,
                        RelatedEntityFieldName: null,
                    },
                ],
            } as unknown as EntityInfo;

            interface SavedWrite {
                entityName: string;
                fields: Record<string, string | number | boolean | null>;
                syncContextAtSave: SyncContext | null;
            }

            const createPeerHarness = (
                instanceID: string,
                initialChanges: PeerRecordChangeEntry[]
            ) => {
                const savedWrites: SavedWrite[] = [];
                const savedWatermarks: Array<{ Direction: string; WatermarkValue: string | null }> = [];
                const savedRecordMaps: Array<{ ExternalSystemRecordID: string; EntityRecordID: string }> = [];

                const runViewProvider: IRunViewProvider = {
                    RunView: vi.fn(async (params) => {
                        if (params.EntityName === 'MJ: Record Changes') {
                            return {
                                Success: true,
                                Results: initialChanges,
                                RowCount: initialChanges.length,
                                TotalRowCount: initialChanges.length,
                                ExecutionTime: 1,
                                ErrorMessage: '',
                            } as RunViewResult;
                        }
                        if (params.EntityName === 'MJ: Company Integration Record Maps') {
                            return {
                                Success: true,
                                Results: savedRecordMaps,
                                RowCount: savedRecordMaps.length,
                                TotalRowCount: savedRecordMaps.length,
                                ExecutionTime: 1,
                                ErrorMessage: '',
                            } as RunViewResult;
                        }
                        return {
                            Success: true,
                            Results: [],
                            RowCount: 0,
                            TotalRowCount: 0,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                        } as RunViewResult;
                    }),
                    RunViews: vi.fn(async () => []),
                };

                const metadataProvider = {
                    Entities: [contactEntityInfo],
                    EntityByName: (name: string) =>
                        name.toLowerCase() === 'contacts' ? contactEntityInfo : undefined,
                    EntityByID: (id: string) => (UUIDsEqual(id, contactEntityInfo.ID) ? contactEntityInfo : undefined),
                    GetEntityObject: vi.fn(async (entityName: string) => {
                        if (entityName === 'MJ: Company Integration Record Maps') {
                            const rm = {
                                CompanyIntegrationID: '',
                                EntityID: '',
                                ExternalSystemRecordID: '',
                                EntityRecordID: '',
                                NewRecord: vi.fn(),
                                InnerLoad: vi.fn().mockResolvedValue(true),
                                Save: vi.fn(async () => {
                                    savedRecordMaps.push({
                                        ExternalSystemRecordID: rm.ExternalSystemRecordID,
                                        EntityRecordID: rm.EntityRecordID,
                                    });
                                    return true;
                                }),
                            };
                            return rm;
                        }
                        if (entityName === 'MJ: Company Integration Sync Watermarks') {
                            const wm = {
                                EntityMapID: '',
                                Direction: 'Pull',
                                WatermarkType: 'Cursor',
                                WatermarkValue: null as string | null,
                                LastSyncAt: new Date(),
                                RecordsSynced: 0,
                                NewRecord: vi.fn(),
                                InnerLoad: vi.fn().mockResolvedValue(true),
                                Save: vi.fn(async () => {
                                    savedWatermarks.push({
                                        Direction: wm.Direction,
                                        WatermarkValue: wm.WatermarkValue,
                                    });
                                    return true;
                                }),
                            };
                            return wm;
                        }

                        // Simulated Contact BaseEntity
                        let currentSyncContext: SyncContext | null = null;
                        const fieldObjs = contactEntityInfo.Fields.map(f => ({
                            Name: f.Name,
                            Value: null as string | number | boolean | null,
                        }));

                        const contactEntity = {
                            EntityInfo: contactEntityInfo,
                            Fields: fieldObjs,
                            get SyncContext(): SyncContext | null {
                                return currentSyncContext;
                            },
                            SetSyncContext(ctx: SyncContext): void {
                                currentSyncContext = ctx;
                            },
                            ClearSyncContext(): void {
                                currentSyncContext = null;
                            },
                            NewRecord: vi.fn(),
                            InnerLoad: vi.fn().mockResolvedValue(false),
                            Save: vi.fn(async () => {
                                const snapshot: Record<string, string | number | boolean | null> = {};
                                for (const f of fieldObjs) {
                                    snapshot[f.Name] = f.Value;
                                }
                                savedWrites.push({
                                    entityName,
                                    fields: snapshot,
                                    syncContextAtSave: currentSyncContext,
                                });
                                return true;
                            }),
                        };
                        return contactEntity;
                    }),
                } as unknown as IMetadataProvider;

                const endpoint = new PeerSyncEndpointService({
                    InstanceID: instanceID,
                    InstanceName: `Peer-${instanceID.slice(0, 4)}`,
                    MJCoreVersion: '5.27.0',
                    DatabaseEngine: 'SQLServer',
                    CompanyIntegrationID: `ci-${instanceID.slice(0, 4)}`,
                    AllowedEntityNames: ['Contacts'],
                    PreservePrimaryKeys: true,
                    MetadataProvider: metadataProvider,
                    RunViewProvider: runViewProvider,
                });

                return {
                    endpoint,
                    metadataProvider,
                    runViewProvider,
                    savedWrites,
                    savedWatermarks,
                    savedRecordMaps,
                };
            };

            // Peer A has created contact-a1; Peer B has created contact-b1
            const peerA = createPeerHarness(INSTANCE_A, [
                {
                    ID: 'chg-a1',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'contact-a1',
                    Type: 'Create',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T11:00:00.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({
                        ID: 'contact-a1',
                        Email: 'alice@peer-a.com',
                        FirstName: 'Alice',
                    }),
                },
            ]);

            const peerB = createPeerHarness(INSTANCE_B, [
                {
                    ID: 'chg-b1',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'contact-b1',
                    Type: 'Create',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T11:05:00.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({
                        ID: 'contact-b1',
                        Email: 'bob@peer-b.com',
                        FirstName: 'Bob',
                    }),
                },
            ]);

            const transportToB = new InProcessPeerSyncTransport(peerB.endpoint, user);
            const connectorA = new MemberJunctionConnector({
                Transport: transportToB,
                LocalInstanceID: INSTANCE_A,
                LocalInstanceName: 'Peer-A',
                LocalMJCoreVersion: '5.27.0',
                LocalDatabaseEngine: 'SQLServer',
                MetadataProvider: peerA.metadataProvider,
                RunViewProvider: peerA.runViewProvider,
            });

            const entityMap: ICompanyIntegrationEntityMap = {
                ID: 'em-contacts',
                CompanyIntegrationID: 'ci-1111',
                ExternalObjectName: 'Contacts',
                ExternalObjectLabel: 'Contacts',
                EntityID: ENTITY_CONTACTS_ID,
                SyncDirection: 'Bidirectional',
                SyncEnabled: true,
                MatchStrategy: JSON.stringify({ Mode: 'Hybrid' }),
                ConflictResolution: 'SourceWins',
                Priority: 1,
                DeleteBehavior: 'SoftDelete',
                Status: 'Active',
                Configuration: null,
                Entity: 'Contacts',
                Get: () => null,
            };

            const syncResult = await connectorA.RunPipeline({
                CompanyIntegration: {
                    ID: 'ci-1111',
                    Configuration: JSON.stringify({
                        PeerInstanceID: INSTANCE_A,
                        PreservePrimaryKeys: true,
                        SchemaDriftPolicy: 'Strict',
                    }),
                    ExternalSystemID: '',
                } as unknown as MJCompanyIntegrationEntity,
                Run: { ID: 'run-bidirectional-1' } as unknown as MJCompanyIntegrationRunEntity,
                EntityMaps: [entityMap],
                FieldMapsByEntityMapID: new Map<string, ICompanyIntegrationFieldMap[]>(),
                FullSync: false,
                ContextUser: user,
            });

            expect(syncResult.Success).toBe(true);
            expect(syncResult.RecordsProcessed).toBe(2);
            expect(syncResult.RecordsCreated).toBe(2);
            expect(syncResult.RecordsErrored).toBe(0);

            // Verify Peer A received Bob from Peer B with SyncContext set to OriginDeploymentID = INSTANCE_B
            expect(peerA.savedWrites).toHaveLength(1);
            expect(peerA.savedWrites[0].fields['Email']).toBe('bob@peer-b.com');
            expect(peerA.savedWrites[0].syncContextAtSave?.OriginDeploymentID).toBe(INSTANCE_B);
            expect(peerA.savedWrites[0].syncContextAtSave?.OriginChangeIDs).toEqual(['chg-b1']);

            // Verify Peer B received Alice from Peer A with SyncContext set to OriginDeploymentID = INSTANCE_A
            expect(peerB.savedWrites).toHaveLength(1);
            expect(peerB.savedWrites[0].fields['Email']).toBe('alice@peer-a.com');
            expect(peerB.savedWrites[0].syncContextAtSave?.OriginDeploymentID).toBe(INSTANCE_A);
            expect(peerB.savedWrites[0].syncContextAtSave?.OriginChangeIDs).toEqual(['chg-a1']);

            // Verify both Pull and Push composite watermarks were saved on Peer A
            expect(peerA.savedWatermarks).toHaveLength(2);
            expect(peerA.savedWatermarks.map(w => w.Direction).sort()).toEqual(['Pull', 'Push']);
        });
    });

    describe('Review Regression Suite — Source-Mode 3-Way Merge, Doorbell Retry, Pass 2 FK Errors & PK Guards', () => {
        it('ComputeThreeWayFieldMerge in OutputKeyMode: source emits ourVal on local-only edits, omits remote-only edits, and resolves conflicts accurately', () => {
            const mappings = [
                { SourceFieldName: 'remote_email', DestinationFieldName: 'Email' },
                { SourceFieldName: 'remote_title', DestinationFieldName: 'Title' },
                { SourceFieldName: 'remote_phone', DestinationFieldName: 'Phone' },
            ];

            // 1. DestWins (local wins true conflicts):
            // - Email: only Ours changed ('ada.new@example.com' vs base 'ada@example.com') -> emits ourVal ('ada.new@example.com')
            // - Title: only Theirs changed ('CTO' vs base 'VP') -> omitted in source mode so outbound push preserves remote edit
            // - Phone: both changed differently (Ours '111', Theirs '222', Base '000') -> DestWins emits ourVal ('111')
            const destWinsResult = ComputeThreeWayFieldMerge({
                Base: { Email: 'ada@example.com', Title: 'VP', Phone: '000' },
                Ours: { Email: 'ada.new@example.com', Title: 'VP', Phone: '111' },
                Theirs: { remote_email: 'ada@example.com', remote_title: 'CTO', remote_phone: '222' },
                FieldMappings: mappings,
                ConflictResolution: 'DestWins',
                OutputKeyMode: 'source',
            });

            expect(destWinsResult.Action).toBe('proceed');
            expect(destWinsResult.ManualConflict).toBe(false);
            expect(destWinsResult.ConflictFields).toEqual(['Phone']);
            expect(destWinsResult.MergedFields).toEqual({
                remote_email: 'ada.new@example.com',
                remote_phone: '111',
            });
            expect('remote_title' in destWinsResult.MergedFields).toBe(false);

            // 2. SourceWins (remote wins true conflicts): conflicting Phone is omitted so remote keeps '222'
            const sourceWinsResult = ComputeThreeWayFieldMerge({
                Base: { Email: 'ada@example.com', Title: 'VP', Phone: '000' },
                Ours: { Email: 'ada.new@example.com', Title: 'VP', Phone: '111' },
                Theirs: { remote_email: 'ada@example.com', remote_title: 'CTO', remote_phone: '222' },
                FieldMappings: mappings,
                ConflictResolution: 'SourceWins',
                OutputKeyMode: 'source',
            });

            expect(sourceWinsResult.Action).toBe('proceed');
            expect(sourceWinsResult.ConflictFields).toEqual(['Phone']);
            expect(sourceWinsResult.MergedFields).toEqual({
                remote_email: 'ada.new@example.com',
            });

            // 3. Manual policy quarantines true conflicts
            const manualResult = ComputeThreeWayFieldMerge({
                Base: { Email: 'ada@example.com', Title: 'VP', Phone: '000' },
                Ours: { Email: 'ada.new@example.com', Title: 'VP', Phone: '111' },
                Theirs: { remote_email: 'ada@example.com', remote_title: 'CTO', remote_phone: '222' },
                FieldMappings: mappings,
                ConflictResolution: 'Manual',
                OutputKeyMode: 'source',
            });

            expect(manualResult.Action).toBe('skip');
            expect(manualResult.ManualConflict).toBe(true);
            expect(manualResult.ResolutionSummary).toBe('quarantined');
        });

        it('PeerSyncDoorbell automatically retries after transport failure once exponential backoff elapses', async () => {
            vi.useFakeTimers();
            try {
                PeerSyncDoorbell.Instance.StopAll();
                let attempts = 0;
                const delivered: PeerDoorbellNotification[] = [];

                const flakyTransport = {
                    GetManifest: vi.fn(),
                    GetSchemaFingerprint: vi.fn(),
                    PreviewSchemaPlan: vi.fn(),
                    FetchChangeBatch: vi.fn(),
                    ApplyChangeBatch: vi.fn(),
                    FlushDeferredForeignKeys: vi.fn().mockResolvedValue({ updatedCount: 0, errorCount: 0, errors: [] }),
                    NotifyChangeBatch: vi.fn(async (n: PeerDoorbellNotification) => {
                        attempts++;
                        if (attempts === 1) {
                            throw new Error('transient network timeout');
                        }
                        delivered.push(n);
                        return { Accepted: true, TriggeredRunID: 'run-retry-ok' };
                    }),
                };

                const pairingID = ComputePairingID(INSTANCE_A, INSTANCE_B);
                PeerSyncDoorbell.Instance.RegisterPairing({
                    PairingID: pairingID,
                    LocalInstanceID: INSTANCE_A,
                    Transport: flakyTransport,
                    WatchedEntityNames: ['Contacts'],
                    DebounceMs: 100,
                    InitialBackoffMs: 1000,
                    MaxBackoffMs: 5000,
                });

                const evt = new BaseEntityEvent();
                evt.type = 'save';
                evt.entityName = 'Contacts';
                evt.baseEntity = null;
                PeerSyncDoorbell.Instance.HandleEntityEvent(evt);

                // First debounce fires at 100ms and fails -> schedules backoff retry at +1000ms
                await vi.advanceTimersByTimeAsync(150);
                expect(attempts).toBe(1);
                expect(delivered).toHaveLength(0);
                expect(
                    PeerSyncDoorbell.Instance.GetPairingStats(pairingID)?.ConsecutiveFailures
                ).toBe(1);

                // Advance past the 1000ms backoff with NO new entity events -> automatic retry succeeds!
                await vi.advanceTimersByTimeAsync(1100);
                expect(attempts).toBe(2);
                expect(delivered).toHaveLength(1);
                expect(delivered[0].ChangedEntityNames).toEqual(['Contacts']);
                expect(
                    PeerSyncDoorbell.Instance.GetPairingStats(pairingID)?.ConsecutiveFailures
                ).toBe(0);
            } finally {
                PeerSyncDoorbell.Instance.StopAll();
                vi.useRealTimers();
            }
        });

        it('ApplyDeferredForeignKeys and MemberJunctionConnector.RunPipeline count Pass 2 save, load, and unresolved-FK failures instead of reporting green', async () => {
            const user = createContextUser();
            const applier = new PeerSyncApplier();

            const companyEntityInfo = {
                ID: ENTITY_COMPANIES_ID,
                Name: 'Companies',
                PrimaryKeys: [{ Name: 'ID' }],
                FirstPrimaryKey: { Name: 'ID' },
                Fields: [
                    { Name: 'ID', IsPrimaryKey: true, RelatedEntityID: null, AllowsNull: false },
                    { Name: 'PrimaryContactID', IsPrimaryKey: false, RelatedEntityID: ENTITY_CONTACTS_ID, AllowsNull: true },
                ],
                ParentEntityInfo: null,
                GetUserPermisions: () => ({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true }),
                GetEffectiveRowFilterWhereClause: () => '',
            } as unknown as EntityInfo;

            const contactEntityInfo = {
                ID: ENTITY_CONTACTS_ID,
                Name: 'Contacts',
                PrimaryKeys: [{ Name: 'ID' }],
                FirstPrimaryKey: { Name: 'ID' },
                Fields: [
                    { Name: 'ID', IsPrimaryKey: true, RelatedEntityID: null, AllowsNull: false },
                    { Name: 'CompanyID', IsPrimaryKey: false, RelatedEntityID: ENTITY_COMPANIES_ID, AllowsNull: false },
                ],
                ParentEntityInfo: null,
                GetUserPermisions: () => ({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true }),
                GetEffectiveRowFilterWhereClause: () => '',
            } as unknown as EntityInfo;

            const emptyRunView: IRunViewProvider = {
                RunView: vi.fn(async () => ({
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                } as RunViewResult)),
                RunViews: vi.fn(async () => []),
            };

            const failingMetadata = {
                Entities: [companyEntityInfo, contactEntityInfo],
                EntityByName: (name: string) =>
                    name.toLowerCase() === 'companies'
                        ? companyEntityInfo
                        : name.toLowerCase() === 'contacts'
                            ? contactEntityInfo
                            : undefined,
                GetEntityObject: vi.fn(async () => ({
                    Fields: [{ Name: 'ID', Value: null }, { Name: 'PrimaryContactID', Value: null }],
                    LatestResult: { CompleteMessage: 'FK constraint violation' },
                    SetSyncContext: vi.fn(),
                    ClearSyncContext: vi.fn(),
                    InnerLoad: vi.fn(async (key: { KeyValuePairs: Array<{ Value: unknown }> }) =>
                        key.KeyValuePairs[0]?.Value !== 'missing-local-row'
                    ),
                    Save: vi.fn(async () => false),
                })),
            } as unknown as IMetadataProvider;

            // Direct unit check on ApplyDeferredForeignKeys:
            // 1. Save() returns false -> errorCount++
            // 2. InnerLoad() returns false -> errorCount++
            // 3. Unresolved FK when PreservePrimaryKeys is false -> errorCount++
            const pass2Result = await applier.ApplyDeferredForeignKeys(
                [
                    {
                        EntityName: 'Companies',
                        LocalRecordID: 'comp-1',
                        FieldName: 'PrimaryContactID',
                        SourceForeignKeyValue: 'contact-1',
                        RelatedEntityID: ENTITY_CONTACTS_ID,
                    },
                    {
                        EntityName: 'Companies',
                        LocalRecordID: 'missing-local-row',
                        FieldName: 'PrimaryContactID',
                        SourceForeignKeyValue: 'contact-1',
                        RelatedEntityID: ENTITY_CONTACTS_ID,
                    },
                ],
                { PairingID: 'pair-1', OriginInstanceID: INSTANCE_B, RunID: 'run-1' },
                {
                    CompanyIntegrationID: 'ci-1',
                    PreservePrimaryKeys: true,
                    DuplicateThreshold: 0.92,
                    PotentialMatchThreshold: 0.75,
                    ContextUser: user,
                    MetadataProvider: failingMetadata,
                    RunViewProvider: emptyRunView,
                }
            );

            expect(pass2Result.updatedCount).toBe(0);
            expect(pass2Result.errorCount).toBe(2);
            expect(pass2Result.errors).toHaveLength(2);

            const unresolvedPass2 = await applier.ApplyDeferredForeignKeys(
                [
                    {
                        EntityName: 'Companies',
                        LocalRecordID: 'comp-1',
                        FieldName: 'PrimaryContactID',
                        SourceForeignKeyValue: 'unmapped-contact-id',
                        RelatedEntityID: ENTITY_CONTACTS_ID,
                    },
                ],
                { PairingID: 'pair-1', OriginInstanceID: INSTANCE_B, RunID: 'run-1' },
                {
                    CompanyIntegrationID: 'ci-1',
                    PreservePrimaryKeys: false,
                    DuplicateThreshold: 0.92,
                    PotentialMatchThreshold: 0.75,
                    ContextUser: user,
                    MetadataProvider: failingMetadata,
                    RunViewProvider: emptyRunView,
                }
            );
            expect(unresolvedPass2.updatedCount).toBe(0);
            expect(unresolvedPass2.errorCount).toBe(1);

            // Pipeline check: when Pass 2 Save() fails during RunPipeline, SyncResult.Success is false and RecordsErrored > 0
            let saveCallNumber = 0;
            const pipelineMetadata = {
                Entities: [companyEntityInfo, contactEntityInfo],
                EntityByName: (name: string) =>
                    name.toLowerCase() === 'companies'
                        ? companyEntityInfo
                        : name.toLowerCase() === 'contacts'
                            ? contactEntityInfo
                            : undefined,
                GetEntityObject: vi.fn(async (entityName: string) => {
                    if (entityName === 'MJ: Company Integration Record Maps' || entityName === 'MJ: Company Integration Sync Watermarks') {
                        return {
                            NewRecord: vi.fn(),
                            InnerLoad: vi.fn().mockResolvedValue(true),
                            Save: vi.fn().mockResolvedValue(true),
                        };
                    }
                    return {
                        Fields: [
                            { Name: 'ID', Value: null },
                            { Name: 'PrimaryContactID', Value: null },
                            { Name: 'CompanyID', Value: null },
                        ],
                        LatestResult: { CompleteMessage: 'Pass 2 FK save rejected' },
                        NewRecord: vi.fn(),
                        SetSyncContext: vi.fn(),
                        ClearSyncContext: vi.fn(),
                        InnerLoad: vi.fn().mockResolvedValue(true),
                        Save: vi.fn(async () => {
                            saveCallNumber++;
                            // Pass 1 creates Company (call 1) and Contact (call 2); Pass 2 deferred FK update (call 3) fails!
                            return saveCallNumber < 3;
                        }),
                    };
                }),
            } as unknown as IMetadataProvider;

            const planner = new SchemaPlanner();
            const localFps = planner.ExtractLocalSchemaFingerprints(['Companies', 'Contacts'], pipelineMetadata);
            const remoteTransport = {
                GetManifest: vi.fn().mockResolvedValue(buildManifest(INSTANCE_B)),
                GetSchemaFingerprint: vi.fn().mockResolvedValue(localFps),
                PreviewSchemaPlan: vi.fn(),
                FetchChangeBatch: vi.fn(async (req: { EntityName: string }) => ({
                    PairingID: ComputePairingID(INSTANCE_A, INSTANCE_B),
                    EntityName: req.EntityName,
                    Changes: req.EntityName === 'Companies'
                        ? [{
                            EntityName: 'Companies',
                            SourceRecordID: 'comp-1',
                            Operation: 'Create' as const,
                            RecordData: { ID: 'comp-1', PrimaryContactID: 'contact-1' },
                            AncestorData: {},
                            ChangedFields: ['ID', 'PrimaryContactID'],
                            LatestChangedAt: '2026-04-20T12:00:00.000Z',
                            LatestChangeID: 'chg-comp-1',
                        }]
                        : [{
                            EntityName: 'Contacts',
                            SourceRecordID: 'contact-1',
                            Operation: 'Create' as const,
                            RecordData: { ID: 'contact-1', CompanyID: 'comp-1' },
                            AncestorData: {},
                            ChangedFields: ['ID', 'CompanyID'],
                            LatestChangedAt: '2026-04-20T12:00:01.000Z',
                            LatestChangeID: 'chg-contact-1',
                        }],
                    NextCursor: { ChangedAt: '2026-04-20T12:00:01.000Z', ChangeID: 'chg-contact-1' },
                    HasMore: false,
                })),
                ApplyChangeBatch: vi.fn(),
                FlushDeferredForeignKeys: vi.fn().mockResolvedValue({ updatedCount: 0, errorCount: 0, errors: [] }),
                NotifyChangeBatch: vi.fn(),
            };

            const connector = new MemberJunctionConnector({
                Transport: remoteTransport,
                LocalInstanceID: INSTANCE_A,
                LocalInstanceName: 'Peer-A',
                LocalMJCoreVersion: '5.27.0',
                LocalDatabaseEngine: 'SQLServer',
                MetadataProvider: pipelineMetadata,
                RunViewProvider: emptyRunView,
            });

            const makeMap = (id: string, entityID: string, name: string): ICompanyIntegrationEntityMap => ({
                ID: id,
                CompanyIntegrationID: 'ci-1',
                ExternalObjectName: name,
                ExternalObjectLabel: name,
                EntityID: entityID,
                SyncDirection: 'Pull',
                SyncEnabled: true,
                MatchStrategy: null,
                ConflictResolution: 'SourceWins',
                Priority: 1,
                DeleteBehavior: 'DoNothing',
                Status: 'Active',
                Configuration: null,
                Entity: name,
                Get: () => null,
            });

            const pipelineResult = await connector.RunPipeline({
                CompanyIntegration: {
                    ID: 'ci-1',
                    Configuration: JSON.stringify({ PeerInstanceID: INSTANCE_B, PreservePrimaryKeys: true }),
                    ExternalSystemID: '',
                } as unknown as MJCompanyIntegrationEntity,
                Run: { ID: 'run-pass2-fail' } as unknown as MJCompanyIntegrationRunEntity,
                EntityMaps: [
                    makeMap('em-comp', ENTITY_COMPANIES_ID, 'Companies'),
                    makeMap('em-cont', ENTITY_CONTACTS_ID, 'Contacts'),
                ],
                FieldMapsByEntityMapID: new Map(),
                FullSync: false,
                ContextUser: user,
            });

            expect(pipelineResult.Success).toBe(false);
            expect(pipelineResult.RecordsErrored).toBe(1);
            expect(pipelineResult.ErrorMessage).toContain('Pass 2 deferred FK save failed');
        });

        it('fails loudly when a target entity has no FirstPrimaryKey instead of falling back to ID', async () => {
            const user = createContextUser();
            const applier = new PeerSyncApplier();
            const keylessEntity = {
                ID: ENTITY_CONTACTS_ID,
                Name: 'KeylessEntity',
                PrimaryKeys: [],
                FirstPrimaryKey: null,
                Fields: [],
            } as unknown as EntityInfo;

            const md = {
                Entities: [keylessEntity],
                EntityByName: () => keylessEntity,
            } as unknown as IMetadataProvider;

            await expect(
                applier.ApplyBatch(
                    {
                        PairingID: 'pair-1',
                        SenderInstanceID: INSTANCE_B,
                        RunID: 'run-1',
                        EntityName: 'KeylessEntity',
                        Changes: [],
                        PreservePrimaryKeys: true,
                    },
                    {
                        CompanyIntegrationID: 'ci-1',
                        PreservePrimaryKeys: true,
                        DuplicateThreshold: 0.92,
                        PotentialMatchThreshold: 0.75,
                        ContextUser: user,
                        MetadataProvider: md,
                    }
                )
            ).rejects.toThrow(/has no primary key defined in metadata/);
        });
    });

    describe('Round-2 Review Regression Suite — FK IntegrationID, Provenance, Push Pass 2 Flush & Manifest Guards', () => {
        const buildCyclicEntityPair = (): { companyEntity: EntityInfo; contactEntity: EntityInfo } => {
            const companyEntity = {
                ID: ENTITY_COMPANIES_ID,
                Name: 'Companies',
                SchemaName: 'crm',
                BaseTable: 'Company',
                BaseView: 'vwCompanies',
                TrackRecordChanges: true,
                PrimaryKeys: [{ Name: 'ID' }],
                FirstPrimaryKey: { Name: 'ID' },
                ParentEntityInfo: null,
                GetUserPermisions: () => ({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true }),
                GetEffectiveRowFilterWhereClause: () => '',
                Fields: [
                    {
                        Name: 'ID',
                        DisplayNameOrName: 'ID',
                        Type: 'uniqueidentifier',
                        SQLFullType: 'uniqueidentifier',
                        AllowsNull: false,
                        MaxLength: 0,
                        Precision: 0,
                        Scale: 0,
                        DefaultValue: null,
                        IsPrimaryKey: true,
                        IsVirtual: false,
                        ReadOnly: false,
                        HasDefaultValue: true,
                        RelatedEntityID: null,
                        RelatedEntity: null,
                        RelatedEntityFieldName: null,
                    },
                    {
                        Name: 'PrimaryContactID',
                        DisplayNameOrName: 'PrimaryContactID',
                        Type: 'uniqueidentifier',
                        SQLFullType: 'uniqueidentifier',
                        AllowsNull: true,
                        MaxLength: 0,
                        Precision: 0,
                        Scale: 0,
                        DefaultValue: null,
                        IsPrimaryKey: false,
                        IsVirtual: false,
                        ReadOnly: false,
                        HasDefaultValue: false,
                        RelatedEntityID: ENTITY_CONTACTS_ID,
                        RelatedEntity: 'Contacts',
                        RelatedEntityFieldName: 'ID',
                    },
                ],
            } as unknown as EntityInfo;

            const contactEntity = {
                ID: ENTITY_CONTACTS_ID,
                Name: 'Contacts',
                SchemaName: 'crm',
                BaseTable: 'Contact',
                BaseView: 'vwContacts',
                TrackRecordChanges: true,
                PrimaryKeys: [{ Name: 'ID' }],
                FirstPrimaryKey: { Name: 'ID' },
                ParentEntityInfo: null,
                GetUserPermisions: () => ({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true }),
                GetEffectiveRowFilterWhereClause: () => '',
                Fields: [
                    {
                        Name: 'ID',
                        DisplayNameOrName: 'ID',
                        Type: 'uniqueidentifier',
                        SQLFullType: 'uniqueidentifier',
                        AllowsNull: false,
                        MaxLength: 0,
                        Precision: 0,
                        Scale: 0,
                        DefaultValue: null,
                        IsPrimaryKey: true,
                        IsVirtual: false,
                        ReadOnly: false,
                        HasDefaultValue: true,
                        RelatedEntityID: null,
                        RelatedEntity: null,
                        RelatedEntityFieldName: null,
                    },
                    {
                        Name: 'CompanyID',
                        DisplayNameOrName: 'CompanyID',
                        Type: 'uniqueidentifier',
                        SQLFullType: 'uniqueidentifier',
                        AllowsNull: false,
                        MaxLength: 0,
                        Precision: 0,
                        Scale: 0,
                        DefaultValue: null,
                        IsPrimaryKey: false,
                        IsVirtual: false,
                        ReadOnly: false,
                        HasDefaultValue: false,
                        RelatedEntityID: ENTITY_COMPANIES_ID,
                        RelatedEntity: 'Companies',
                        RelatedEntityFieldName: 'ID',
                    },
                ],
            } as unknown as EntityInfo;

            return { companyEntity, contactEntity };
        };

        it('passes Integration.ID (not CompanyIntegration.ID), preserves coalesced OriginChangeIDs + OriginUserEmail into Pass 2, and accepts service accounts without Email', async () => {
            const { companyEntity, contactEntity } = buildCyclicEntityPair();
            const serviceAccountUser = {
                ID: '77777777-7777-4777-8777-777777777777',
                Name: 'Sync Service Account',
                Email: '',
            } as UserInfo;

            const coalescedCompanyChanges = CoalesceRecordChanges([
                {
                    ID: 'chg-comp-1',
                    EntityID: ENTITY_COMPANIES_ID,
                    EntityName: 'Companies',
                    RecordID: 'comp-100',
                    Type: 'Create',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T12:00:00.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({ ID: 'comp-100', PrimaryContactID: null }),
                    UserEmail: 'creator@peer-b.com',
                },
                {
                    ID: 'chg-comp-2',
                    EntityID: ENTITY_COMPANIES_ID,
                    EntityName: 'Companies',
                    RecordID: 'comp-100',
                    Type: 'Update',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T12:01:00.000Z',
                    ChangesJSON: JSON.stringify({
                        PrimaryContactID: {
                            fieldName: 'PrimaryContactID',
                            oldValue: null,
                            newValue: 'cont-100',
                        },
                    }),
                    FullRecordJSON: JSON.stringify({ ID: 'comp-100', PrimaryContactID: 'cont-100' }),
                    UserEmail: 'editor@peer-b.com',
                },
            ]);
            expect(coalescedCompanyChanges).toHaveLength(1);
            expect(coalescedCompanyChanges[0].OriginChangeIDs).toEqual(['chg-comp-1', 'chg-comp-2']);
            expect(coalescedCompanyChanges[0].OriginUserEmail).toBe('editor@peer-b.com');

            const coalescedContactChanges = CoalesceRecordChanges([
                {
                    ID: 'chg-cont-1',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'cont-100',
                    Type: 'Create',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T12:02:00.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({ ID: 'cont-100', CompanyID: 'comp-100' }),
                },
            ]);

            const recordedContexts: Array<{ entityName: string; context: SyncContext | null }> = [];
            const savedRecordMaps: Array<{ EntityID: string; ExternalSystemRecordID: string; EntityRecordID: string }> = [];
            const rowsByEntity = new Map<string, Record<string, string | number | boolean | null>>();

            const runViewProvider: IRunViewProvider = {
                RunView: vi.fn(async (params) => {
                    if (params.EntityName === 'MJ: Company Integration Record Maps') {
                        const filtered = savedRecordMaps.filter(rm =>
                            params.ExtraFilter?.includes(rm.EntityID) ?? true
                        );
                        return {
                            Success: true,
                            Results: filtered,
                            RowCount: filtered.length,
                            TotalRowCount: filtered.length,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                        } as RunViewResult;
                    }
                    return {
                        Success: true,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    } as RunViewResult;
                }),
                RunViews: vi.fn(async () => []),
            };

            const metadataProvider = {
                Entities: [companyEntity, contactEntity],
                EntityByName: (name: string) =>
                    name.toLowerCase() === 'companies'
                        ? companyEntity
                        : name.toLowerCase() === 'contacts'
                            ? contactEntity
                            : undefined,
                GetEntityObject: vi.fn(async (entityName: string) => {
                    if (entityName === 'MJ: Company Integration Record Maps') {
                        const rm = {
                            CompanyIntegrationID: '',
                            EntityID: '',
                            ExternalSystemRecordID: '',
                            EntityRecordID: '',
                            NewRecord: vi.fn(),
                            InnerLoad: vi.fn().mockResolvedValue(true),
                            Save: vi.fn(async () => {
                                savedRecordMaps.push({
                                    EntityID: rm.EntityID,
                                    ExternalSystemRecordID: rm.ExternalSystemRecordID,
                                    EntityRecordID: rm.EntityRecordID,
                                });
                                return true;
                            }),
                        };
                        return rm;
                    }
                    if (entityName === 'MJ: Company Integration Sync Watermarks') {
                        return {
                            NewRecord: vi.fn(),
                            InnerLoad: vi.fn().mockResolvedValue(true),
                            Save: vi.fn().mockResolvedValue(true),
                        };
                    }

                    const targetMeta = entityName === 'Companies' ? companyEntity : contactEntity;
                    const fields = targetMeta.Fields.map(f => ({
                        Name: f.Name,
                        Value: null as string | number | boolean | null,
                    }));
                    let activeSyncCtx: SyncContext | null = null;
                    return {
                        EntityInfo: targetMeta,
                        Fields: fields,
                        get SyncContext(): SyncContext | null {
                            return activeSyncCtx;
                        },
                        SetSyncContext(ctx: SyncContext): void {
                            activeSyncCtx = ctx;
                        },
                        ClearSyncContext(): void {
                            activeSyncCtx = null;
                        },
                        NewRecord: vi.fn(),
                        InnerLoad: vi.fn(async (key: { KeyValuePairs: Array<{ Value: unknown }> }) => {
                            const id = String(key.KeyValuePairs[0]?.Value ?? '');
                            const stored = rowsByEntity.get(`${entityName}::${id}`);
                            if (!stored) return false;
                            for (const f of fields) {
                                f.Value = stored[f.Name] ?? null;
                            }
                            return true;
                        }),
                        Save: vi.fn(async () => {
                            const snap: Record<string, string | number | boolean | null> = {};
                            for (const f of fields) {
                                snap[f.Name] = f.Value;
                            }
                            rowsByEntity.set(`${entityName}::${String(snap['ID'])}`, snap);
                            recordedContexts.push({ entityName, context: activeSyncCtx });
                            return true;
                        }),
                        Delete: vi.fn(async () => {
                            recordedContexts.push({ entityName: `${entityName}:Delete`, context: activeSyncCtx });
                            return true;
                        }),
                    };
                }),
            } as unknown as IMetadataProvider;

            const planner = new SchemaPlanner();
            const fps = planner.ExtractLocalSchemaFingerprints(['Companies', 'Contacts'], metadataProvider);
            const transport = {
                GetManifest: vi.fn().mockResolvedValue(buildManifest(INSTANCE_B, '6.3.0-edge.0')),
                GetSchemaFingerprint: vi.fn().mockResolvedValue(fps),
                PreviewSchemaPlan: vi.fn(),
                FetchChangeBatch: vi.fn(async (req: { EntityName: string }) => ({
                    PairingID: ComputePairingID(INSTANCE_A, INSTANCE_B),
                    EntityName: req.EntityName,
                    Changes: req.EntityName === 'Companies' ? coalescedCompanyChanges : coalescedContactChanges,
                    NextCursor: { ChangedAt: '2026-04-20T12:02:00.000Z', ChangeID: 'chg-cont-1' },
                    HasMore: false,
                })),
                ApplyChangeBatch: vi.fn(),
                FlushDeferredForeignKeys: vi.fn().mockResolvedValue({ updatedCount: 0, errorCount: 0, errors: [] }),
                NotifyChangeBatch: vi.fn(),
            };

            const connector = new MemberJunctionConnector({
                Transport: transport,
                LocalInstanceID: INSTANCE_A,
                MetadataProvider: metadataProvider,
                RunViewProvider: runViewProvider,
            });

            const makePullMap = (id: string, entityID: string, name: string): ICompanyIntegrationEntityMap => ({
                ID: id,
                CompanyIntegrationID: 'ci-company-row-id',
                ExternalObjectName: name,
                ExternalObjectLabel: name,
                EntityID: entityID,
                SyncDirection: 'Pull',
                SyncEnabled: true,
                MatchStrategy: null,
                ConflictResolution: 'SourceWins',
                Priority: 1,
                DeleteBehavior: 'DoNothing',
                Status: 'Active',
                Configuration: null,
                Entity: name,
                Get: () => null,
            });

            const res = await connector.RunPipeline({
                CompanyIntegration: {
                    ID: 'ci-company-row-id',
                    IntegrationID: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                    Configuration: JSON.stringify({ PreservePrimaryKeys: true }),
                    ExternalSystemID: '',
                } as unknown as MJCompanyIntegrationEntity,
                Run: { ID: 'run-fk-provenance' } as unknown as MJCompanyIntegrationRunEntity,
                EntityMaps: [
                    makePullMap('em-comp', ENTITY_COMPANIES_ID, 'Companies'),
                    makePullMap('em-cont', ENTITY_CONTACTS_ID, 'Contacts'),
                ],
                FieldMapsByEntityMapID: new Map(),
                FullSync: false,
                ContextUser: serviceAccountUser,
            });

            expect(res.Success).toBe(true);
            // 3 saves: Pass 1 Companies, Pass 1 Contacts, Pass 2 Companies.PrimaryContactID
            expect(recordedContexts).toHaveLength(3);

            // Every single save must carry Integration.ID (NEVER CompanyIntegration.ID!)
            for (const entry of recordedContexts) {
                expect(entry.context?.IntegrationID).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
                expect(entry.context?.IntegrationID).not.toBe('ci-company-row-id');
            }

            // Pass 1 Companies & Pass 2 Companies both carry the coalesced OriginChangeIDs and origin user email
            expect(recordedContexts[0].entityName).toBe('Companies');
            expect(recordedContexts[0].context?.OriginChangeIDs).toEqual(['chg-comp-1', 'chg-comp-2']);
            expect(recordedContexts[0].context?.OriginUserEmail).toBe('editor@peer-b.com');

            // Pass 1 Contacts had no UserEmail and serviceAccountUser.Email === '' -> undefined without throwing
            expect(recordedContexts[1].entityName).toBe('Contacts');
            expect(recordedContexts[1].context?.OriginChangeIDs).toEqual(['chg-cont-1']);
            expect(recordedContexts[1].context?.OriginUserEmail).toBeUndefined();

            // Pass 2 Companies deferred FK update preserves ['chg-comp-1', 'chg-comp-2'] and 'editor@peer-b.com'
            expect(recordedContexts[2].entityName).toBe('Companies');
            expect(recordedContexts[2].context?.OriginChangeIDs).toEqual(['chg-comp-1', 'chg-comp-2']);
            expect(recordedContexts[2].context?.OriginUserEmail).toBe('editor@peer-b.com');
            expect(rowsByEntity.get('Companies::comp-100')?.['PrimaryContactID']).toBe('cont-100');

            // Also verify PeerSyncApplier.applyDelete forwards Integration.ID (not CompanyIntegration.ID)
            const applier = new PeerSyncApplier();
            const deleteRes = await applier.ApplyBatch(
                {
                    PairingID: ComputePairingID(INSTANCE_A, INSTANCE_B),
                    SenderInstanceID: INSTANCE_B,
                    RunID: 'run-del-fk',
                    EntityName: 'Contacts',
                    Changes: [
                        {
                            EntityName: 'Contacts',
                            SourceRecordID: 'cont-100',
                            Operation: 'Delete',
                            RecordData: { ID: 'cont-100' },
                            AncestorData: null,
                            ChangedFields: [],
                            LatestChangedAt: '2026-04-20T12:05:00.000Z',
                            LatestChangeID: 'chg-del-1',
                            OriginChangeIDs: ['chg-del-1'],
                            OriginUserEmail: 'deleter@peer-b.com',
                        },
                    ],
                    PreservePrimaryKeys: true,
                },
                {
                    CompanyIntegrationID: 'ci-company-row-id',
                    IntegrationID: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                    PreservePrimaryKeys: true,
                    DuplicateThreshold: 0.92,
                    PotentialMatchThreshold: 0.75,
                    ContextUser: serviceAccountUser,
                    MetadataProvider: metadataProvider,
                    RunViewProvider: runViewProvider,
                }
            );
            expect(deleteRes.Response.DeletedCount).toBe(1);
            const deleteCtxEntry = recordedContexts.find(c => c.entityName === 'Contacts:Delete');
            expect(deleteCtxEntry?.context?.IntegrationID).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
            expect(deleteCtxEntry?.context?.OriginChangeIDs).toEqual(['chg-del-1']);
            expect(deleteCtxEntry?.context?.OriginUserEmail).toBe('deleter@peer-b.com');
        });

        /** A peer over the cyclic pair: an endpoint plus providers that serve `localChanges` as its change rows. */
        const createCyclicPeerFor = (
            pair: { companyEntity: EntityInfo; contactEntity: EntityInfo },
            instanceID: string,
            localChanges: PeerRecordChangeEntry[],
            failPass2CompanySave = false
        ) => {
            const { companyEntity, contactEntity } = pair;
            const storedRows = new Map<string, Record<string, string | number | boolean | null>>();
            const recordMaps: Array<{ EntityID: string; ExternalSystemRecordID: string; EntityRecordID: string }> = [];
            let companySaveCount = 0;

            const rvProvider: IRunViewProvider = {
                RunView: vi.fn(async (params) => {
                    if (params.EntityName === 'MJ: Record Changes') {
                        const forEntity = localChanges.filter(c =>
                            params.ExtraFilter?.includes(c.EntityID)
                        );
                        return {
                            Success: true,
                            Results: forEntity,
                            RowCount: forEntity.length,
                            TotalRowCount: forEntity.length,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                        } as RunViewResult;
                    }
                    if (params.EntityName === 'MJ: Company Integration Record Maps') {
                        const filtered = recordMaps.filter(rm =>
                            params.ExtraFilter?.includes(rm.EntityID) ?? true
                        );
                        return {
                            Success: true,
                            Results: filtered,
                            RowCount: filtered.length,
                            TotalRowCount: filtered.length,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                        } as RunViewResult;
                    }
                    return {
                        Success: true,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    } as RunViewResult;
                }),
                RunViews: vi.fn(async () => []),
            };

            const mdProvider = {
                Entities: [companyEntity, contactEntity],
                EntityByID: (id: string) => [companyEntity, contactEntity].find(e => UUIDsEqual(e.ID, id)),
                EntityByName: (name: string) =>
                    name.toLowerCase() === 'companies'
                        ? companyEntity
                        : name.toLowerCase() === 'contacts'
                            ? contactEntity
                            : undefined,
                GetEntityObject: vi.fn(async (entityName: string) => {
                    if (entityName === 'MJ: Company Integration Record Maps') {
                        const rm = {
                            CompanyIntegrationID: '',
                            EntityID: '',
                            ExternalSystemRecordID: '',
                            EntityRecordID: '',
                            NewRecord: vi.fn(),
                            InnerLoad: vi.fn().mockResolvedValue(true),
                            Save: vi.fn(async () => {
                                recordMaps.push({
                                    EntityID: rm.EntityID,
                                    ExternalSystemRecordID: rm.ExternalSystemRecordID,
                                    EntityRecordID: rm.EntityRecordID,
                                });
                                return true;
                            }),
                        };
                        return rm;
                    }
                    if (entityName === 'MJ: Company Integration Sync Watermarks') {
                        return {
                            NewRecord: vi.fn(),
                            InnerLoad: vi.fn().mockResolvedValue(true),
                            Save: vi.fn().mockResolvedValue(true),
                        };
                    }

                    const meta = entityName === 'Companies' ? companyEntity : contactEntity;
                    const fields = meta.Fields.map(f => ({
                        Name: f.Name,
                        Value: null as string | number | boolean | null,
                    }));
                    return {
                        EntityInfo: meta,
                        Fields: fields,
                        LatestResult: { CompleteMessage: 'Endpoint Pass 2 FK rejected' },
                        SetSyncContext: vi.fn(),
                        ClearSyncContext: vi.fn(),
                        NewRecord: vi.fn(),
                        InnerLoad: vi.fn(async (key: { KeyValuePairs: Array<{ Value: unknown }> }) => {
                            const id = String(key.KeyValuePairs[0]?.Value ?? '');
                            const existing = storedRows.get(`${entityName}::${id}`);
                            if (!existing) return false;
                            for (const f of fields) {
                                f.Value = existing[f.Name] ?? null;
                            }
                            return true;
                        }),
                        Save: vi.fn(async () => {
                            if (entityName === 'Companies') {
                                companySaveCount++;
                                if (failPass2CompanySave && companySaveCount >= 2) {
                                    return false;
                                }
                            }
                            const snap: Record<string, string | number | boolean | null> = {};
                            for (const f of fields) {
                                snap[f.Name] = f.Value;
                            }
                            storedRows.set(`${entityName}::${String(snap['ID'])}`, snap);
                            return true;
                        }),
                    };
                }),
            } as unknown as IMetadataProvider;

            const endpoint = new PeerSyncEndpointService({
                InstanceID: instanceID,
                InstanceName: `Peer-${instanceID.slice(0, 4)}`,
                MJCoreVersion: '6.3.0-edge.0',
                DatabaseEngine: 'SQLServer',
                CompanyIntegrationID: `ci-${instanceID.slice(0, 4)}`,
                IntegrationID: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                AllowedEntityNames: ['Companies', 'Contacts'],
                PreservePrimaryKeys: true,
                MetadataProvider: mdProvider,
                RunViewProvider: rvProvider,
            });

            return { endpoint, mdProvider, rvProvider, storedRows };
        };

        it('flushes Push Pass 2 deferred FKs on the remote endpoint, isolates queues per RunID, and attributes Push Pass 2 errors', async () => {
            const { companyEntity, contactEntity } = buildCyclicEntityPair();
            const user = createContextUser();

            const createCyclicPeer = (instanceID: string, localChanges: PeerRecordChangeEntry[], failPass2CompanySave = false) =>
                createCyclicPeerFor({ companyEntity, contactEntity }, instanceID, localChanges, failPass2CompanySave);

            const hubChanges: PeerRecordChangeEntry[] = [
                {
                    ID: 'push-chg-comp-1',
                    EntityID: ENTITY_COMPANIES_ID,
                    EntityName: 'Companies',
                    RecordID: 'comp-push-1',
                    Type: 'Create',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T13:00:00.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({ ID: 'comp-push-1', PrimaryContactID: 'cont-push-1' }),
                },
                {
                    ID: 'push-chg-cont-1',
                    EntityID: ENTITY_CONTACTS_ID,
                    EntityName: 'Contacts',
                    RecordID: 'cont-push-1',
                    Type: 'Create',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T13:00:01.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({ ID: 'cont-push-1', CompanyID: 'comp-push-1' }),
                },
            ];

            // 1. Happy path: outbound Push writes null in Pass 1 and populates PrimaryContactID in Pass 2!
            const hubA = createCyclicPeer(INSTANCE_A, hubChanges);
            const endpointB = createCyclicPeer(INSTANCE_B, []);

            // Seed an unrelated run's deferred item on endpointB to prove per-RunID isolation
            await endpointB.endpoint.ApplyChangeBatch(
                {
                    PairingID: ComputePairingID(INSTANCE_A, INSTANCE_B),
                    SenderInstanceID: INSTANCE_A,
                    RunID: 'other-concurrent-run',
                    EntityName: 'Companies',
                    Changes: [
                        {
                            EntityName: 'Companies',
                            SourceRecordID: 'comp-other-run',
                            Operation: 'Create',
                            RecordData: { ID: 'comp-other-run', PrimaryContactID: 'missing-other-contact' },
                            AncestorData: null,
                            ChangedFields: ['ID', 'PrimaryContactID'],
                            LatestChangedAt: '2026-04-20T12:59:00.000Z',
                            LatestChangeID: 'chg-other',
                        },
                    ],
                    PreservePrimaryKeys: false,
                },
                user
            );

            const connectorOk = new MemberJunctionConnector({
                Transport: new InProcessPeerSyncTransport(endpointB.endpoint, user),
                LocalInstanceID: INSTANCE_A,
                LocalMJCoreVersion: '6.3.0-edge.0',
                MetadataProvider: hubA.mdProvider,
                RunViewProvider: hubA.rvProvider,
            });

            const makePushMap = (id: string, entityID: string, name: string): ICompanyIntegrationEntityMap => ({
                ID: id,
                CompanyIntegrationID: 'ci-hub',
                ExternalObjectName: name,
                ExternalObjectLabel: name,
                EntityID: entityID,
                SyncDirection: 'Push',
                SyncEnabled: true,
                MatchStrategy: null,
                ConflictResolution: 'SourceWins',
                Priority: 1,
                DeleteBehavior: 'DoNothing',
                Status: 'Active',
                Configuration: null,
                Entity: name,
                Get: () => null,
            });

            const okResult = await connectorOk.RunPipeline({
                CompanyIntegration: {
                    ID: 'ci-hub',
                    IntegrationID: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                    Configuration: JSON.stringify({ PreservePrimaryKeys: true }),
                    ExternalSystemID: '',
                } as unknown as MJCompanyIntegrationEntity,
                Run: { ID: 'run-push-ok' } as unknown as MJCompanyIntegrationRunEntity,
                EntityMaps: [
                    makePushMap('em-comp', ENTITY_COMPANIES_ID, 'Companies'),
                    makePushMap('em-cont', ENTITY_CONTACTS_ID, 'Contacts'),
                ],
                FieldMapsByEntityMapID: new Map(),
                FullSync: false,
                ContextUser: user,
            });

            expect(okResult.Success).toBe(true);
            expect(okResult.RecordsErrored).toBe(0);
            expect(endpointB.storedRows.get('Companies::comp-push-1')?.['PrimaryContactID']).toBe('cont-push-1');

            // Verify 'other-concurrent-run' was NOT drained by 'run-push-ok'
            const otherFlush = await endpointB.endpoint.FlushDeferredForeignKeys(
                {
                    PairingID: ComputePairingID(INSTANCE_A, INSTANCE_B),
                    OriginInstanceID: INSTANCE_A,
                    RunID: 'other-concurrent-run',
                },
                user
            );
            expect(otherFlush.errorCount).toBe(1);

            // 2. Failure path: when endpoint Pass 2 save fails on Push, RunPipeline & Companies mapResult report failure
            const hubFail = createCyclicPeer(INSTANCE_A, hubChanges);
            const endpointFail = createCyclicPeer(INSTANCE_B, [], true);
            const connectorFail = new MemberJunctionConnector({
                Transport: new InProcessPeerSyncTransport(endpointFail.endpoint, user),
                LocalInstanceID: INSTANCE_A,
                LocalMJCoreVersion: '6.3.0-edge.0',
                MetadataProvider: hubFail.mdProvider,
                RunViewProvider: hubFail.rvProvider,
            });

            const failResult = await connectorFail.RunPipeline({
                CompanyIntegration: {
                    ID: 'ci-hub',
                    IntegrationID: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                    Configuration: JSON.stringify({ PreservePrimaryKeys: true }),
                    ExternalSystemID: '',
                } as unknown as MJCompanyIntegrationEntity,
                Run: { ID: 'run-push-fail' } as unknown as MJCompanyIntegrationRunEntity,
                EntityMaps: [
                    makePushMap('em-comp', ENTITY_COMPANIES_ID, 'Companies'),
                    makePushMap('em-cont', ENTITY_CONTACTS_ID, 'Contacts'),
                ],
                FieldMapsByEntityMapID: new Map(),
                FullSync: false,
                ContextUser: user,
            });

            expect(failResult.Success).toBe(false);
            expect(failResult.RecordsErrored).toBe(1);
            expect(failResult.ErrorMessage).toContain('Pass 2 deferred FK save failed');
            const compMapRes = failResult.EntityMapResults.find(m => m.EntityName === 'Companies');
            expect(compMapRes?.Success).toBe(false);
            expect(compMapRes?.RecordsErrored).toBe(1);
        });

        it('records a push refused for one entity as that entity\'s failure and pushes the other entities', async () => {
            const user = createContextUser();
            const hubPair = buildCyclicEntityPair();
            const partlyReadContacts = {
                ...hubPair.contactEntity,
                GetUserPermisions: () => ({ CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false }),
                GetEffectiveRowFilterWhereClause: () => `OwnerID = '${user.ID}'`,
            } as unknown as EntityInfo;
            const hub = createCyclicPeerFor({ companyEntity: hubPair.companyEntity, contactEntity: partlyReadContacts }, INSTANCE_A, [
                {
                    ID: 'one-refused-chg-comp-1',
                    EntityID: ENTITY_COMPANIES_ID,
                    EntityName: 'Companies',
                    RecordID: 'comp-one-refused-1',
                    Type: 'Create',
                    Source: 'Internal',
                    ChangedAt: '2026-04-20T14:00:00.000Z',
                    ChangesJSON: null,
                    FullRecordJSON: JSON.stringify({ ID: 'comp-one-refused-1', PrimaryContactID: null }),
                },
            ]);
            const remote = createCyclicPeerFor(buildCyclicEntityPair(), INSTANCE_B, []);
            const connector = new MemberJunctionConnector({
                Transport: new InProcessPeerSyncTransport(remote.endpoint, user),
                LocalInstanceID: INSTANCE_A,
                LocalMJCoreVersion: '6.3.0-edge.0',
                MetadataProvider: hub.mdProvider,
                RunViewProvider: hub.rvProvider,
            });
            const pushMap = (id: string, entityID: string, name: string): ICompanyIntegrationEntityMap => ({
                ID: id,
                CompanyIntegrationID: 'ci-hub',
                ExternalObjectName: name,
                ExternalObjectLabel: name,
                EntityID: entityID,
                SyncDirection: 'Push',
                SyncEnabled: true,
                MatchStrategy: null,
                ConflictResolution: 'SourceWins',
                Priority: 1,
                DeleteBehavior: 'DoNothing',
                Status: 'Active',
                Configuration: null,
                Entity: name,
                Get: () => null,
            });

            const outcome = await connector.RunPipeline({
                CompanyIntegration: {
                    ID: 'ci-hub',
                    IntegrationID: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                    Configuration: JSON.stringify({ PreservePrimaryKeys: true }),
                    ExternalSystemID: '',
                } as unknown as MJCompanyIntegrationEntity,
                Run: { ID: 'run-one-refused' } as unknown as MJCompanyIntegrationRunEntity,
                EntityMaps: [pushMap('em-comp', ENTITY_COMPANIES_ID, 'Companies'), pushMap('em-cont', ENTITY_CONTACTS_ID, 'Contacts')],
                FieldMapsByEntityMapID: new Map(),
                FullSync: false,
                ContextUser: user,
            }).catch((e: Error) => e);

            expect(outcome).not.toBeInstanceOf(Error);
            const result = outcome as SyncResult;
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('every record');
            const contacts = result.EntityMapResults.find((m) => m.EntityName === 'Contacts');
            expect(contacts?.Success).toBe(false);
            expect(contacts?.RecordsErrored).toBe(1);
            const companies = result.EntityMapResults.find((m) => m.EntityName === 'Companies');
            expect(companies?.Success).toBe(true);
            expect(remote.storedRows.has('Companies::comp-one-refused-1')).toBe(true);
        });

        it('caches PlanPeerEntityOrder across multiple ApplyChangeBatch calls when AllowedEntityNames is empty', async () => {
            const { companyEntity, contactEntity } = buildCyclicEntityPair();
            const user = createContextUser();
            let entitiesGetterReads = 0;

            const countingMetadata = {
                get Entities(): EntityInfo[] {
                    entitiesGetterReads++;
                    return [companyEntity, contactEntity];
                },
                EntityByName: (name: string) =>
                    name.toLowerCase() === 'companies' ? companyEntity : contactEntity,
            } as unknown as IMetadataProvider;

            const emptyRv: IRunViewProvider = {
                RunView: vi.fn(async () => ({
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                } as RunViewResult)),
                RunViews: vi.fn(async () => []),
            };

            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const service = new PeerSyncEndpointService({
                    InstanceID: INSTANCE_B,
                    InstanceName: 'Peer-B',
                    MJCoreVersion: '6.3.0-edge.0',
                    DatabaseEngine: 'SQLServer',
                    CompanyIntegrationID: 'ci-b',
                    AllowedEntityNames: [],
                    MetadataProvider: countingMetadata,
                    RunViewProvider: emptyRv,
                });

                const readsPerBatch: number[] = [];
                for (let i = 0; i < 3; i++) {
                    const before = entitiesGetterReads;
                    await service.ApplyChangeBatch(
                        {
                            PairingID: 'pair-cache',
                            SenderInstanceID: INSTANCE_A,
                            RunID: `run-${i}`,
                            EntityName: 'Companies',
                            Changes: [],
                            PreservePrimaryKeys: true,
                        },
                        user
                    );
                    readsPerBatch.push(entitiesGetterReads - before);
                }

                // Batch 1 runs PlanPeerEntityOrder (2 reads) + loadRelatedEntityRecordMaps (1 read) = 3;
                // Batches 2 & 3 reuse cachedDeferredFieldsByEntityID (0 planning reads) and only run loadRelatedEntityRecordMaps (1 read each)!
                expect(readsPerBatch).toEqual([3, 1, 1]);
            } finally {
                warnSpy.mockRestore();
            }
        });

        it('fails loudly when Transport or local deployment ID is missing instead of using dead or colliding defaults', async () => {
            const user = createContextUser();
            const savedEnv = process.env['MJ_DEPLOYMENT_ID'];
            delete process.env['MJ_DEPLOYMENT_ID'];
            try {
                // 1. Missing Transport -> TestConnection captures the loud error
                const noTransportConnector = new MemberJunctionConnector({
                    LocalInstanceID: INSTANCE_A,
                });
                const connTest = await noTransportConnector.TestConnection(
                    { Configuration: '{}', ExternalSystemID: '' } as unknown as MJCompanyIntegrationEntity,
                    user
                );
                expect(connTest.Success).toBe(false);
                expect(connTest.Message).toContain('InProcessPeerSyncTransport');

                // 2. Missing LocalInstanceID / PeerInstanceID / MJ_DEPLOYMENT_ID -> FetchChanges throws loudly
                const noInstanceConnector = new MemberJunctionConnector({
                    Transport: {
                        GetManifest: vi.fn().mockResolvedValue(buildManifest(INSTANCE_B)),
                        GetSchemaFingerprint: vi.fn(),
                        PreviewSchemaPlan: vi.fn(),
                        FetchChangeBatch: vi.fn(),
                        ApplyChangeBatch: vi.fn(),
                        FlushDeferredForeignKeys: vi.fn(),
                        NotifyChangeBatch: vi.fn(),
                    },
                });
                await expect(
                    noInstanceConnector.FetchChanges({
                        CompanyIntegration: { Configuration: '{}', ExternalSystemID: '' } as unknown as MJCompanyIntegrationEntity,
                        ObjectName: 'Contacts',
                        WatermarkValue: null,
                        ContextUser: user,
                    })
                ).rejects.toThrow(/configured local deployment ID/);
            } finally {
                if (savedEnv !== undefined) {
                    process.env['MJ_DEPLOYMENT_ID'] = savedEnv;
                }
            }
        });
    });
});

describe('Peer sync change paging for a user who reads only part of an entity', () => {
    it('refuses to page the change rows of an entity the sync user reads through a row filter', async () => {
        const filtered = new EntityInfo({
            ID: ENTITY_CONTACTS_ID,
            Name: 'Contacts',
            SchemaName: 'crm',
            BaseTable: 'Contact',
            BaseView: 'vwContacts',
            Fields: [{ ID: 'c-f1', EntityID: ENTITY_CONTACTS_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 }],
        });
        vi.spyOn(filtered, 'GetUserPermisions').mockReturnValue({ CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false });
        vi.spyOn(filtered, 'GetEffectiveRowFilterWhereClause').mockReturnValue(`OwnerID = '${createContextUser().ID}'`);
        const runView = vi.fn(async (): Promise<RunViewResult> => ({
            Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '',
        }));
        const endpoint = new PeerSyncEndpointService({
            InstanceID: INSTANCE_A,
            InstanceName: 'Peer-A',
            MJCoreVersion: '5.27.0',
            DatabaseEngine: 'SQLServer',
            CompanyIntegrationID: 'ci-a',
            AllowedEntityNames: ['Contacts'],
            MetadataProvider: { Entities: [filtered], EntityByName: () => filtered } as unknown as IMetadataProvider,
            RunViewProvider: { RunView: runView, RunViews: vi.fn() } as unknown as IRunViewProvider,
        });

        await expect(endpoint.FetchChangeBatch(
            { PairingID: 'p', RequesterInstanceID: INSTANCE_B, EntityName: 'Contacts', SinceCursor: null, BatchSize: 10 },
            createContextUser(),
        )).rejects.toThrow(/every record/);
        expect(runView).not.toHaveBeenCalled();
    });
});
