import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseEntity,
    CompositeKey,
    EntityFieldTSType,
    EntityInfo,
    EntityTransactionScope,
    IEntityDataProvider,
    IMetadataProvider,
    RunViewParams,
    RunViewResult,
    UserInfo,
    ValidationResult,
} from '@memberjunction/core';
import {
    BUILT_IN_COMMENT_TYPE_IDS,
    BUILT_IN_CONVERSATION_TYPE_IDS,
    ConversationEngine,
    MJCommentTypeEntity,
    MJFieldSuggestionEntity,
} from '@memberjunction/core-entities';
import {
    AnchoredConversationPostRunViewHook,
    FieldSuggestionCommentDriver,
    FieldSuggestionPostSaveHook,
    IsSuggestionAcceptInFlight,
    MJAIAgentUserPolicyEntityServer,
    MJCommentEntityServer,
    MJFieldSuggestionEntityServer,
} from '../index';
import { ExpectedConsole } from './helpers/expected-console';


const TARGET_ENTITY_ID = '10000000-0000-4000-8000-000000000001';
const TARGET_RECORD_ID = '20000000-0000-4000-8000-000000000002';
const USER_ID = '30000000-0000-4000-8000-000000000003';
const SUGGESTION_ID = '40000000-0000-4000-8000-000000000004';

interface FakeFieldState {
    Name: string;
    Value: unknown;
    OldValue?: unknown;
    Dirty?: boolean;
}

function makeTargetEntityInfo(opts?: {
    allowFieldSuggestions?: boolean;
    canUpdateEntity?: boolean;
    allowUpdateAPI?: boolean;
    deniedUpdateFields?: string[];
    deniedReadFields?: string[];
    readOnlyFields?: string[];
}): EntityInfo {
    const allowSuggestions = opts?.allowFieldSuggestions ?? true;
    const canUpdateEntity = opts?.canUpdateEntity ?? true;
    const allowUpdateAPI = opts?.allowUpdateAPI ?? true;
    const deniedUpdate = new Set((opts?.deniedUpdateFields ?? []).map((f) => f.toLowerCase()));
    const deniedRead = new Set((opts?.deniedReadFields ?? []).map((f) => f.toLowerCase()));
    const readOnlySet = new Set((opts?.readOnlyFields ?? []).map((f) => f.toLowerCase()));

    const pkField = {
        Name: 'ID',
        DisplayNameOrName: 'ID',
        IsPrimaryKey: true,
        TSType: EntityFieldTSType.String,
        AllowsNull: false,
        ReadOnly: true,
        AllowUpdateAPI: false,
    };
    const dueAtField = {
        Name: 'DueAt',
        DisplayNameOrName: 'Due At',
        IsPrimaryKey: false,
        TSType: EntityFieldTSType.Date,
        AllowsNull: true,
        ReadOnly: readOnlySet.has('dueat'),
        AllowUpdateAPI: !readOnlySet.has('dueat'),
    };
    const hoursField = {
        Name: 'HoursEstimated',
        DisplayNameOrName: 'Hours Estimated',
        IsPrimaryKey: false,
        TSType: EntityFieldTSType.Number,
        AllowsNull: true,
        ReadOnly: readOnlySet.has('hoursestimated'),
        AllowUpdateAPI: !readOnlySet.has('hoursestimated'),
    };
    const secretField = {
        Name: 'SecretCompensation',
        DisplayNameOrName: 'Secret Compensation',
        IsPrimaryKey: false,
        TSType: EntityFieldTSType.Number,
        AllowsNull: true,
        ReadOnly: false,
        AllowUpdateAPI: true,
    };

    return {
        ID: TARGET_ENTITY_ID,
        Name: 'Tasks',
        DisplayNameOrName: 'Tasks',
        AllowUpdateAPI: allowUpdateAPI,
        AllowRecordComments: true,
        FieldLevelSecurityApplies: deniedUpdate.size > 0 || deniedRead.size > 0,
        PrimaryKeys: [pkField],
        FirstPrimaryKey: pkField,
        Fields: [pkField, dueAtField, hoursField, secretField],
        ParentEntityInfo: null,
        ChildEntities: [],
        IsCommentTypeAllowed: (code: string) => {
            if (code.toUpperCase() === 'COMMENT') return true;
            if (code.toUpperCase() === 'FIELD_SUGGESTION') return allowSuggestions;
            return false;
        },
        CheckPermissions: () => canUpdateEntity,
        GetUserPermisions: () => ({
            CanCreate: true,
            CanRead: true,
            CanUpdate: canUpdateEntity,
            CanDelete: false,
        }),
        IsFieldUpdatableByUser: (fieldName: string) => !deniedUpdate.has(fieldName.trim().toLowerCase()),
        IsFieldReadableByUser: (fieldName: string) => !deniedRead.has(fieldName.trim().toLowerCase()),
        GetDeniedUpdateFields: () => deniedUpdate,
        GetDeniedReadFields: () => deniedRead,
    } as unknown as EntityInfo;
}

describe('FieldSuggestionCommentDriver, Server Subclasses & Security Hooks', () => {
    const driver = new FieldSuggestionCommentDriver();
    const user = { ID: USER_ID, Name: 'Amith', Email: 'amith@example.com' } as unknown as UserInfo;

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // After the suite's own beforeEach, which restores every mock (and so would drop an earlier console capture).
    ExpectedConsole.Install([/^MJCommentEntityServer: malformed AllowedAnchorTypes JSON on CommentType 'Broken Type': /]);

    describe('FieldSuggestionCommentDriver.Validate', () => {
        it('rejects non-Field AnchorType, missing AnchorKey, non-opted-in entity, unknown field, and out-of-range Confidence', () => {
            const optedOutEntity = makeTargetEntityInfo({ allowFieldSuggestions: false });
            const provider = {
                Entities: [optedOutEntity],
                EntityByID: (id: string) => (id === TARGET_ENTITY_ID ? optedOutEntity : undefined),
            } as unknown as IMetadataProvider;

            const badSuggestion = {
                EntityInfo: { Name: 'MJ: Field Suggestions' },
                ProviderToUse: provider,
                IsSaved: false,
                LinkedEntityID: TARGET_ENTITY_ID,
                LinkedRecordID: TARGET_RECORD_ID,
                AnchorType: 'Record',
                AnchorKey: 'NonExistentField',
                Confidence: 1.5,
            } as unknown as BaseEntity;

            const result = new ValidationResult();
            driver.Validate(badSuggestion, result, user);

            expect(result.Success).toBe(false);
            const errorFields = result.Errors.map((e) => e.Source);
            expect(errorFields).toContain('AnchorType');
            expect(errorFields).toContain('CommentTypeID');
            expect(errorFields).toContain('AnchorKey');
            expect(errorFields).toContain('Confidence');
        });

        it('passes validation when entity opts into FIELD_SUGGESTION and field exists', () => {
            const optedInEntity = makeTargetEntityInfo({ allowFieldSuggestions: true });
            const provider = {
                Entities: [optedInEntity],
                EntityByID: () => optedInEntity,
            } as unknown as IMetadataProvider;

            const goodSuggestion = {
                EntityInfo: { Name: 'MJ: Field Suggestions' },
                ProviderToUse: provider,
                IsSaved: false,
                LinkedEntityID: TARGET_ENTITY_ID,
                LinkedRecordID: TARGET_RECORD_ID,
                AnchorType: 'Field',
                AnchorKey: 'HoursEstimated',
                Confidence: 0.85,
            } as unknown as BaseEntity;

            const result = new ValidationResult();
            result.Success = true;
            driver.Validate(goodSuggestion, result, user);
            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });
    });

    describe('FieldSuggestionCommentDriver.OnAccept & OnReject', () => {
        it('loads target record as ContextUser, coerces SuggestedValue, guards in-flight self-supersede, saves target, and stamps resolution metadata', async () => {
            const entityInfo = makeTargetEntityInfo({ allowFieldSuggestions: true });
            const hoursFieldState: FakeFieldState = { Name: 'HoursEstimated', Value: 2 };
            let inFlightDuringTargetSave = false;

            const targetRecord = {
                EntityInfo: entityInfo,
                InnerLoad: vi.fn(async (_ck: CompositeKey) => true),
                GetFieldByName: (name: string) => (name === 'HoursEstimated' ? hoursFieldState : null),
                Save: vi.fn(async () => {
                    inFlightDuringTargetSave = IsSuggestionAcceptInFlight(SUGGESTION_ID);
                    return true;
                }),
                LatestResult: null,
            } as unknown as BaseEntity;

            const provider = {
                ProviderType: 'Network',
                Entities: [entityInfo],
                EntityByID: () => entityInfo,
                GetEntityObject: vi.fn(async () => targetRecord),
            } as unknown as IMetadataProvider;

            const suggestion = {
                ID: SUGGESTION_ID,
                LinkedEntityID: TARGET_ENTITY_ID,
                LinkedRecordID: TARGET_RECORD_ID,
                AnchorType: 'Field',
                AnchorKey: 'HoursEstimated',
                SuggestedValue: '13.5',
                Outcome: 'Accepted',
                IsResolved: false,
                ResolvedByUserID: null as string | null,
                ResolvedAt: null as Date | null,
            } as unknown as MJFieldSuggestionEntity;

            await driver.OnAccept({
                Provider: provider,
                ContextUser: user,
                Comment: null,
                ExtensionEntity: suggestion,
            });

            expect(provider.GetEntityObject).toHaveBeenCalledWith('Tasks', user);
            expect(hoursFieldState.Value).toBe(13.5);
            expect(inFlightDuringTargetSave).toBe(true);
            expect(IsSuggestionAcceptInFlight(SUGGESTION_ID)).toBe(false);
            expect(suggestion.IsResolved).toBe(true);
            expect(suggestion.ResolvedByUserID).toBe(USER_ID);
            expect(suggestion.ResolvedAt).toBeInstanceOf(Date);
        });

        it('refuses OnAccept when user lacks entity Update permission, field is ReadOnly, or FLS denies update', async () => {
            const suggestion = {
                ID: SUGGESTION_ID,
                LinkedEntityID: TARGET_ENTITY_ID,
                LinkedRecordID: TARGET_RECORD_ID,
                AnchorType: 'Field',
                AnchorKey: 'HoursEstimated',
                SuggestedValue: '5',
                Outcome: 'Accepted',
            } as unknown as MJFieldSuggestionEntity;

            // 1. No entity Update permission
            const noUpdateEntity = makeTargetEntityInfo({ canUpdateEntity: false });
            await expect(
                driver.OnAccept({
                    Provider: { EntityByID: () => noUpdateEntity } as unknown as IMetadataProvider,
                    ContextUser: user,
                    Comment: null,
                    ExtensionEntity: suggestion,
                })
            ).rejects.toThrow(/Update permission/);

            // 2. ReadOnly field
            const roEntity = makeTargetEntityInfo({ readOnlyFields: ['HoursEstimated'] });
            await expect(
                driver.OnAccept({
                    Provider: { EntityByID: () => roEntity } as unknown as IMetadataProvider,
                    ContextUser: user,
                    Comment: null,
                    ExtensionEntity: suggestion,
                })
            ).rejects.toThrow(/read-only/i);

            // 3. FLS denies update
            const flsDeniedEntity = makeTargetEntityInfo({ deniedUpdateFields: ['HoursEstimated'] });
            await expect(
                driver.OnAccept({
                    Provider: { EntityByID: () => flsDeniedEntity } as unknown as IMetadataProvider,
                    ContextUser: user,
                    Comment: null,
                    ExtensionEntity: suggestion,
                })
            ).rejects.toThrow(/permission to update field/);
        });

        it('enforces Update and FLS write permissions on OnReject and stamps resolution fields when permitted', async () => {
            const suggestion = {
                ID: SUGGESTION_ID,
                LinkedEntityID: TARGET_ENTITY_ID,
                LinkedRecordID: TARGET_RECORD_ID,
                AnchorType: 'Field',
                AnchorKey: 'HoursEstimated',
                SuggestedValue: '5',
                Outcome: 'Rejected',
                IsResolved: false,
                ResolvedByUserID: null as string | null,
                ResolvedAt: null as Date | null,
            } as unknown as MJFieldSuggestionEntity;

            const flsDeniedEntity = makeTargetEntityInfo({ deniedUpdateFields: ['HoursEstimated'] });
            await expect(
                driver.OnReject({
                    Provider: { EntityByID: () => flsDeniedEntity } as unknown as IMetadataProvider,
                    ContextUser: user,
                    Comment: null,
                    ExtensionEntity: suggestion,
                })
            ).rejects.toThrow(/cannot reject suggestions/);

            const allowedEntity = makeTargetEntityInfo();
            await driver.OnReject({
                Provider: {
                    ProviderType: 'Network',
                    EntityByID: () => allowedEntity,
                } as unknown as IMetadataProvider,
                ContextUser: user,
                Comment: null,
                ExtensionEntity: suggestion,
            });
            expect(suggestion.IsResolved).toBe(true);
            expect(suggestion.ResolvedByUserID).toBe(USER_ID);
            expect(suggestion.ResolvedAt).toBeInstanceOf(Date);
        });
    });

    describe('FieldSuggestionPostSaveHook & OnRecordChanged auto-superseding', () => {
        it('marks pending suggestions on modified fields as Superseded and skips non-opted-in entities', async () => {
            // 1. Non-opted-in entity makes zero RunView queries
            const optedOutInfo = makeTargetEntityInfo({ allowFieldSuggestions: false });
            const optedOutSpy = vi.fn();
            const optedOutEntity = {
                EntityInfo: optedOutInfo,
                ProviderToUse: { ProviderType: 'Database', RunView: optedOutSpy },
                PrimaryKey: { HasValue: true, KeyValuePairs: [{ FieldName: 'ID', Value: TARGET_RECORD_ID }] },
            } as unknown as BaseEntity;

            await FieldSuggestionPostSaveHook(optedOutEntity, user, ['HoursEstimated'], 'update');
            expect(optedOutSpy).not.toHaveBeenCalled();

            // 2. Opted-in entity supersedes pending suggestion on modified field
            const optedInInfo = makeTargetEntityInfo({ allowFieldSuggestions: true });
            const loadedSuggestionToSupersede = {
                ID: SUGGESTION_ID,
                Outcome: null as MJFieldSuggestionEntity['Outcome'],
                IsResolved: false,
                ResolvedByUserID: null as string | null,
                ResolvedAt: null as Date | null,
                Load: vi.fn(async () => true),
                Save: vi.fn(async () => true),
                LatestResult: null,
            };

            const mockProvider = {
                ProviderType: 'Database',
                Entities: [optedInInfo],
                EntityByID: () => optedInInfo,
                RunView: vi.fn(async () => ({
                    Success: true,
                    Results: [
                        {
                            ID: SUGGESTION_ID,
                            AnchorKey: 'HoursEstimated',
                            Outcome: null,
                        },
                    ],
                })),
                GetEntityObject: vi.fn(async () => loadedSuggestionToSupersede),
            } as unknown as IMetadataProvider;

            const savedTask = {
                EntityInfo: optedInInfo,
                ProviderToUse: mockProvider,
                PrimaryKey: {
                    HasValue: true,
                    KeyValuePairs: [{ FieldName: 'ID', Value: TARGET_RECORD_ID }],
                },
            } as unknown as BaseEntity;

            await FieldSuggestionPostSaveHook(savedTask, user, ['HoursEstimated'], 'update');

            expect(loadedSuggestionToSupersede.Load).toHaveBeenCalledWith(SUGGESTION_ID);
            expect(loadedSuggestionToSupersede.Outcome).toBe('Superseded');
            expect(loadedSuggestionToSupersede.IsResolved).toBe(true);
            expect(loadedSuggestionToSupersede.ResolvedByUserID).toBe(USER_ID);
            expect(loadedSuggestionToSupersede.ResolvedAt).toBeInstanceOf(Date);
            expect(loadedSuggestionToSupersede.Save).toHaveBeenCalledOnce();
        });
    });

    describe('AnchoredConversationPostRunViewHook — IS-A descendants FLS filtering', () => {
        it('hides MJ: Field Suggestions rows targeting FLS-denied fields from direct RunView queries', async () => {
            const entityWithFLS = makeTargetEntityInfo({
                deniedReadFields: ['SecretCompensation'],
            });

            const mockProvider = {
                ProviderType: 'Database',
                Entities: [entityWithFLS],
                EntityByID: (id: string) => (id === TARGET_ENTITY_ID ? entityWithFLS : undefined),
                RunView: vi.fn(async () => ({
                    Success: true,
                    Results: [{ ID: TARGET_RECORD_ID }],
                    RowCount: 1,
                    TotalRowCount: 1,
                })),
            } as unknown as IMetadataProvider;

            const restrictedViewer = {
                ID: USER_ID,
                Name: 'Viewer',
                OwningProvider: mockProvider,
            } as unknown as UserInfo;

            const visibleRow = {
                ID: '50000000-0000-4000-8000-000000000001',
                LinkedEntityID: TARGET_ENTITY_ID,
                LinkedRecordID: TARGET_RECORD_ID,
                AnchorType: 'Field',
                AnchorKey: 'HoursEstimated',
                AnchorMetadata: null,
            };
            const hiddenRow = {
                ID: '50000000-0000-4000-8000-000000000002',
                LinkedEntityID: TARGET_ENTITY_ID,
                LinkedRecordID: TARGET_RECORD_ID,
                AnchorType: 'Field',
                AnchorKey: 'SecretCompensation',
                AnchorMetadata: null,
            };

            const params: RunViewParams = {
                EntityName: 'MJ: Field Suggestions',
                ResultType: 'simple',
            };
            const initialResult: RunViewResult = {
                Success: true,
                Results: [visibleRow, hiddenRow],
                RowCount: 2,
                TotalRowCount: 2,
                ExecutionTime: 1,
                ErrorMessage: '',
                UserViewRunID: '',
            };

            const filtered = await AnchoredConversationPostRunViewHook(
                params,
                initialResult,
                restrictedViewer
            );

            expect(filtered.Results).toHaveLength(1);
            expect((filtered.Results[0] as { ID: string }).ID).toBe(visibleRow.ID);
            expect(filtered.RowCount).toBe(1);
        });
    });

    describe('MJCommentEntityServer & MJFieldSuggestionEntityServer class exports', () => {
        it('exports server subclasses and built-in constants cleanly', () => {
            expect(MJCommentEntityServer).toBeDefined();
            expect(MJFieldSuggestionEntityServer).toBeDefined();
            expect(BUILT_IN_CONVERSATION_TYPE_IDS.COMMENT).toBe('17E6A105-AE51-43A2-9D56-290BC8D1D6BB');
            expect(BUILT_IN_COMMENT_TYPE_IDS.FIELD_SUGGESTION).toBe('8918DBA5-EDDD-4AF4-A518-FEB387ED02F9');
        });

        it('MJCommentEntityServer.Save initializes ValidationResult.Success = true and delegates to super.Save when valid', async () => {
            const targetEntityInfo = makeTargetEntityInfo({ allowFieldSuggestions: true });
            const fakeProvider = {
                Entities: [targetEntityInfo],
                EntityByID: (id: string) => (id === TARGET_ENTITY_ID ? targetEntityInfo : undefined),
            } as unknown as IMetadataProvider;

            const superSaveSpy = vi
                .spyOn(Object.getPrototypeOf(MJCommentEntityServer.prototype) as BaseEntity, 'Save')
                .mockResolvedValue(true);

            try {
                const fakeComment = Object.create(MJCommentEntityServer.prototype) as MJCommentEntityServer;
                let typeId: string | null = null;
                let commentTypeId: string | null = null;
                Object.defineProperties(fakeComment, {
                    TypeID: { get: () => typeId, set: (v: string | null) => { typeId = v; } },
                    CommentTypeID: { get: () => commentTypeId, set: (v: string | null) => { commentTypeId = v; } },
                    AnchorType: { get: () => 'Record' },
                    LinkedEntityID: { get: () => TARGET_ENTITY_ID },
                    IsSaved: { get: () => false },
                    ProviderToUse: { get: () => fakeProvider },
                    RegisterResultHistoryEntry: { value: vi.fn() },
                });

                const ok = await fakeComment.Save();
                expect(ok).toBe(true);
                expect(typeId).toBe(BUILT_IN_CONVERSATION_TYPE_IDS.COMMENT);
                expect(commentTypeId).toBe(BUILT_IN_COMMENT_TYPE_IDS.COMMENT);
                expect(superSaveSpy).toHaveBeenCalledTimes(1);
            } finally {
                superSaveSpy.mockRestore();
            }
        });

        it('wraps OnAccept + super.Save in BeginEntityTransaction and rolls back when super.Save returns false', async () => {
            const entityInfo = makeTargetEntityInfo({ allowFieldSuggestions: true });
            const hoursFieldState: FakeFieldState = { Name: 'HoursEstimated', Value: 2 };
            const targetRecord = {
                EntityInfo: entityInfo,
                InnerLoad: vi.fn(async (_ck: CompositeKey) => true),
                GetFieldByName: (name: string) => (name === 'HoursEstimated' ? hoursFieldState : null),
                Save: vi.fn(async () => true),
                LatestResult: null,
            } as Partial<BaseEntity> as BaseEntity;

            const commitSpy = vi.fn(async () => {});
            const rollbackSpy = vi.fn(async () => {});
            const mockScope: EntityTransactionScope = {
                Commit: commitSpy,
                Rollback: rollbackSpy,
                IsActive: true,
            };
            const txProvider = {
                ProviderType: 'Network',
                SupportsEntityTransactions: true,
                BeginEntityTransaction: vi.fn(async () => mockScope),
                Entities: [entityInfo],
                EntityByID: () => entityInfo,
                GetEntityObject: vi.fn(async () => targetRecord),
            } as Partial<IMetadataProvider & IEntityDataProvider> as IMetadataProvider;

            const superSaveSpy = vi
                .spyOn(Object.getPrototypeOf(MJFieldSuggestionEntityServer.prototype) as BaseEntity, 'Save')
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            try {
                const buildAcceptedSuggestion = (): MJFieldSuggestionEntityServer => {
                    const inst = Object.create(MJFieldSuggestionEntityServer.prototype) as MJFieldSuggestionEntityServer;
                    Object.defineProperties(inst, {
                        ID: { get: () => SUGGESTION_ID },
                        IsSaved: { get: () => true },
                        TypeID: { get: () => BUILT_IN_CONVERSATION_TYPE_IDS.COMMENT, set: () => {} },
                        CommentTypeID: { get: () => BUILT_IN_COMMENT_TYPE_IDS.FIELD_SUGGESTION, set: () => {} },
                        AnchorType: { get: () => 'Field', set: () => {} },
                        AnchorKey: { get: () => 'HoursEstimated', set: () => {} },
                        LinkedEntityID: { get: () => TARGET_ENTITY_ID },
                        LinkedRecordID: { get: () => TARGET_RECORD_ID },
                        SuggestedValue: { get: () => '8' },
                        Outcome: { get: () => 'Accepted' as MJFieldSuggestionEntity['Outcome'] },
                        UserID: { get: () => USER_ID },
                        IsResolved: { get: () => false, set: () => {} },
                        ResolvedByUserID: { get: () => null, set: () => {} },
                        ResolvedAt: { get: () => null, set: () => {} },
                        ISAParent: { get: () => null },
                        ProviderToUse: { get: () => txProvider },
                        ContextCurrentUser: { get: () => user },
                        GetFieldByName: {
                            value: (name: string) =>
                                name === 'Outcome'
                                    ? ({ Name: 'Outcome', OldValue: null, Dirty: true } as ReturnType<BaseEntity['GetFieldByName']>)
                                    : null,
                        },
                        RegisterResultHistoryEntry: { value: vi.fn() },
                    });
                    return inst;
                };

                // 1. super.Save returns false -> Rollback() called, Commit() NOT called
                const failSave = await buildAcceptedSuggestion().Save();
                expect(failSave).toBe(false);
                expect(rollbackSpy).toHaveBeenCalledTimes(1);
                expect(commitSpy).not.toHaveBeenCalled();

                // 2. super.Save returns true -> Commit() called
                const okSave = await buildAcceptedSuggestion().Save();
                expect(okSave).toBe(true);
                expect(commitSpy).toHaveBeenCalledTimes(1);
            } finally {
                superSaveSpy.mockRestore();
            }
        });

        it('enforces OnSupersede permissions and rejects empty numeric SuggestedValue on non-nullable fields', async () => {
            const flsDeniedEntity = makeTargetEntityInfo({ deniedUpdateFields: ['HoursEstimated'] });
            const nonAuthorSuggestion = {
                ID: SUGGESTION_ID,
                UserID: '99999999-0000-4000-8000-000000000999',
                LinkedEntityID: TARGET_ENTITY_ID,
                LinkedRecordID: TARGET_RECORD_ID,
                AnchorType: 'Field',
                AnchorKey: 'HoursEstimated',
                SuggestedValue: '5',
                Outcome: 'Superseded',
                IsResolved: false,
                ResolvedByUserID: null as string | null,
                ResolvedAt: null as Date | null,
            } as Partial<MJFieldSuggestionEntity> as MJFieldSuggestionEntity;

            // Non-author without field Update permission cannot mark suggestion Superseded
            await expect(
                driver.OnSupersede({
                    Provider: { EntityByID: () => flsDeniedEntity } as Partial<IMetadataProvider> as IMetadataProvider,
                    ContextUser: user,
                    Comment: null,
                    ExtensionEntity: nonAuthorSuggestion,
                })
            ).rejects.toThrow(/cannot supersede suggestions/);

            // Suggestion author CAN mark their own pending suggestion Superseded
            const authorSuggestion = {
                ...nonAuthorSuggestion,
                UserID: USER_ID,
            } as Partial<MJFieldSuggestionEntity> as MJFieldSuggestionEntity;
            await driver.OnSupersede({
                Provider: { EntityByID: () => flsDeniedEntity } as Partial<IMetadataProvider> as IMetadataProvider,
                ContextUser: user,
                Comment: null,
                ExtensionEntity: authorSuggestion,
            });
            expect(authorSuggestion.IsResolved).toBe(true);
            expect(authorSuggestion.ResolvedByUserID).toBe(USER_ID);

            // Non-nullable numeric field with empty SuggestedValue throws instead of coercing to NaN
            const nonNullEntityInfo = makeTargetEntityInfo({ allowFieldSuggestions: true });
            const hoursField = nonNullEntityInfo.Fields.find((f) => f.Name === 'HoursEstimated')!;
            (hoursField as { AllowsNull: boolean }).AllowsNull = false;
            const targetRecord = {
                EntityInfo: nonNullEntityInfo,
                InnerLoad: vi.fn(async () => true),
                GetFieldByName: () => ({ Name: 'HoursEstimated', Value: 3 }),
                Save: vi.fn(async () => true),
            } as Partial<BaseEntity> as BaseEntity;

            await expect(
                driver.OnAccept({
                    Provider: {
                        ProviderType: 'Network',
                        Entities: [nonNullEntityInfo],
                        EntityByID: () => nonNullEntityInfo,
                        GetEntityObject: vi.fn(async () => targetRecord),
                    } as Partial<IMetadataProvider> as IMetadataProvider,
                    ContextUser: user,
                    Comment: null,
                    ExtensionEntity: {
                        ...authorSuggestion,
                        Outcome: 'Accepted',
                        SuggestedValue: '   ',
                    } as Partial<MJFieldSuggestionEntity> as MJFieldSuggestionEntity,
                })
            ).rejects.toThrow(/Empty numeric SuggestedValue is not allowed for non-nullable field/i);
        });

        it('fails closed on malformed AllowedAnchorTypes JSON and denies non-author Delete() on Comment & FieldSuggestion', async () => {
            const badTypeId = '77777777-1111-4111-8111-777777777777';
            const commentTypeSpy = vi
                .spyOn(ConversationEngine.Instance, 'CommentTypeByID')
                .mockImplementation((id: string) =>
                    id === badTypeId
                        ? ({
                              ID: badTypeId,
                              Code: 'CUSTOM_BROKEN',
                              Name: 'Broken Type',
                              AllowedAnchorTypes: '{not-valid-json',
                          } as Partial<MJCommentTypeEntity> as MJCommentTypeEntity)
                        : undefined
                );

            try {
                const fakeComment = Object.create(MJCommentEntityServer.prototype) as MJCommentEntityServer;
                Object.defineProperties(fakeComment, {
                    TypeID: { get: () => BUILT_IN_CONVERSATION_TYPE_IDS.COMMENT, set: () => {} },
                    CommentTypeID: { get: () => badTypeId, set: () => {} },
                    AnchorType: { get: () => 'Record' },
                    LinkedEntityID: { get: () => TARGET_ENTITY_ID },
                    UserID: { get: () => '99999999-0000-4000-8000-000000000999' },
                    IsSaved: { get: () => false },
                    ProviderToUse: { get: () => ({} as IMetadataProvider) },
                    ContextCurrentUser: { get: () => user },
                    RegisterResultHistoryEntry: { value: vi.fn() },
                });

                // Malformed AllowedAnchorTypes JSON fails closed on Save()
                expect(await fakeComment.Save()).toBe(false);

                // Non-author non-system Delete() fails closed on both MJCommentEntityServer and MJFieldSuggestionEntityServer
                expect(await fakeComment.Delete()).toBe(false);

                const fakeSuggestion = Object.create(
                    MJFieldSuggestionEntityServer.prototype
                ) as MJFieldSuggestionEntityServer;
                Object.defineProperties(fakeSuggestion, {
                    UserID: { get: () => '99999999-0000-4000-8000-000000000999' },
                    ProviderToUse: { get: () => ({} as IMetadataProvider) },
                    ContextCurrentUser: { get: () => user },
                    RegisterResultHistoryEntry: { value: vi.fn() },
                });
                expect(await fakeSuggestion.Delete()).toBe(false);
            } finally {
                commentTypeSpy.mockRestore();
            }
        });
    });
});
