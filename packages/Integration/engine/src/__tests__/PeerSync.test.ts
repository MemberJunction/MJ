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
    PeerSyncDoorbell,
    PeerSyncEndpointService,
    PlanPeerEntityOrder,
    SchemaPlanner,
} from '../index.js';
import type { ICompanyIntegrationEntityMap, ICompanyIntegrationFieldMap } from '../entity-types.js';
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
});
