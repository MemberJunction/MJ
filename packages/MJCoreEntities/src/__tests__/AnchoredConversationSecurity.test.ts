import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityFieldInfo, EntityFieldTSType, EntityInfo, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    BuildLinkedRecordPrimaryKeyFilter,
    DetectReferencedRestrictedFieldsDeterministic,
    FilterAnchoredConversationsForUser,
    IsConversationHiddenByFieldSecurity,
    MergeRestrictedFieldsIntoAnchorMetadata,
    ParseConversationAnchorMetadata,
    UserCanReadLinkedRecord
} from '../custom/AnchoredConversationSecurity';
import {
    DispatchConversationMentionNotifications,
    ExtractNewlyAddedUserMentions,
    ExtractUserMentionsFromMessage,
    FormatMentionPlainTextPreview
} from '../custom/Permissions/mentionNotification';
import { ComputeAnchoredCommentCounts } from '../engines/conversations';
import { MJConversationEntity } from '../generated/entity_subclasses';

function makeUser(id: string, name = 'Test User'): UserInfo {
    const user = new UserInfo();
    user.ID = id;
    user.Name = name;
    user.IsActive = true;
    return user;
}

interface MockFieldOptions {
    Name: string;
    DisplayName?: string;
    HasFieldPermissions?: boolean;
    IsPrimaryKey?: boolean;
    TSType?: EntityFieldTSType;
}

function makeEntityInfo(options: {
    id?: string;
    name?: string;
    canRead?: boolean;
    flsApplies?: boolean;
    deniedReadFieldsByUserId?: Record<string, string[]>;
    fields?: MockFieldOptions[];
}): EntityInfo {
    const fields = (options.fields ?? [{ Name: 'ID', IsPrimaryKey: true, TSType: EntityFieldTSType.String }]).map(f => ({
        Name: f.Name,
        DisplayName: f.DisplayName ?? f.Name,
        HasFieldPermissions: f.HasFieldPermissions ?? false,
        IsPrimaryKey: f.IsPrimaryKey ?? false,
        TSType: f.TSType ?? EntityFieldTSType.String
    })) as unknown as EntityFieldInfo[];

    const primaryKeys = fields.filter(f => f.IsPrimaryKey);

    return {
        ID: options.id ?? 'entity-employees',
        Name: options.name ?? 'Employees',
        DisplayNameOrName: options.name ?? 'Employees',
        PrimaryKeys: primaryKeys,
        FirstPrimaryKey: primaryKeys[0],
        Fields: fields,
        FieldLevelSecurityApplies: options.flsApplies ?? false,
        GetUserPermisions: vi.fn().mockReturnValue({ CanRead: options.canRead ?? true }),
        GetDeniedReadFields: vi.fn((user: UserInfo) => {
            const list = options.deniedReadFieldsByUserId?.[user.ID] ?? [];
            return new Set(list.map(n => n.toLowerCase()));
        })
    } as unknown as EntityInfo;
}

describe('AnchoredConversationSecurity', () => {
    const allowedUser = makeUser('user-hr', 'HR Manager');
    const restrictedUser = makeUser('user-contractor', 'Contractor');

    describe('ParseConversationAnchorMetadata', () => {
        it('returns object directly when already parsed', () => {
            const meta = ParseConversationAnchorMetadata({ fieldName: 'Salary', quotedValue: '$185,000' });
            expect(meta).toEqual({ fieldName: 'Salary', quotedValue: '$185,000' });
        });

        it('parses JSON from string', () => {
            const meta = ParseConversationAnchorMetadata(
                JSON.stringify({ sectionKey: 'compensation', restrictedFields: ['Salary'] })
            );
            expect(meta).toEqual({ sectionKey: 'compensation', restrictedFields: ['Salary'] });
        });

        it('returns null on malformed JSON', () => {
            expect(ParseConversationAnchorMetadata('{not-valid-json')).toBeNull();
        });
    });

    describe('IsConversationHiddenByFieldSecurity (FLS gate)', () => {
        const entityWithFLS = makeEntityInfo({
            flsApplies: true,
            deniedReadFieldsByUserId: {
                [restrictedUser.ID]: ['Salary', 'SSN']
            },
            fields: [
                { Name: 'ID', IsPrimaryKey: true },
                { Name: 'Title', HasFieldPermissions: false },
                { Name: 'Salary', DisplayName: 'Annual Salary', HasFieldPermissions: true },
                { Name: 'SSN', DisplayName: 'Social Security Number', HasFieldPermissions: true }
            ]
        });

        it('fast-paths to false when FieldLevelSecurityApplies is false', () => {
            const noFlsEntity = makeEntityInfo({ flsApplies: false });
            expect(IsConversationHiddenByFieldSecurity(noFlsEntity, restrictedUser, 'Field', 'Salary', null)).toBe(false);
        });

        it('hides a Field-anchored conversation when the user is denied Read on AnchorKey', () => {
            expect(IsConversationHiddenByFieldSecurity(entityWithFLS, restrictedUser, 'Field', 'Salary', null)).toBe(true);
            expect(IsConversationHiddenByFieldSecurity(entityWithFLS, allowedUser, 'Field', 'Salary', null)).toBe(false);
        });

        it('hides a Record- or Section-anchored conversation when AnchorMetadata.restrictedFields overlaps denied fields', () => {
            const metadata = { restrictedFields: ['Salary'] };
            expect(IsConversationHiddenByFieldSecurity(entityWithFLS, restrictedUser, 'Record', null, metadata)).toBe(true);
            expect(IsConversationHiddenByFieldSecurity(entityWithFLS, allowedUser, 'Record', null, metadata)).toBe(false);
        });

        it('allows a Field-anchored conversation on an unrestricted field', () => {
            expect(
                IsConversationHiddenByFieldSecurity(entityWithFLS, restrictedUser, 'Field', 'Title', { fieldName: 'Title' })
            ).toBe(false);
        });
    });

    describe('BuildLinkedRecordPrimaryKeyFilter', () => {
        it('builds quoted filter for single UUID/string primary key', () => {
            const entity = makeEntityInfo({
                fields: [{ Name: 'ID', IsPrimaryKey: true, TSType: EntityFieldTSType.String }]
            });
            expect(BuildLinkedRecordPrimaryKeyFilter(entity, 'rec-123')).toBe("[ID]=N'rec-123'");
            expect(BuildLinkedRecordPrimaryKeyFilter(entity, 'ID|rec-123')).toBe("[ID]=N'rec-123'");
        });

        it('builds composite primary key filter from CompositeKey delimiter format', () => {
            const entity = makeEntityInfo({
                fields: [
                    { Name: 'OrderID', IsPrimaryKey: true, TSType: EntityFieldTSType.String },
                    { Name: 'LineNumber', IsPrimaryKey: true, TSType: EntityFieldTSType.Number }
                ]
            });
            expect(BuildLinkedRecordPrimaryKeyFilter(entity, 'OrderID|ord-1||LineNumber|42')).toBe(
                "[OrderID]=N'ord-1' AND [LineNumber]=42"
            );
        });
    });

    describe('UserCanReadLinkedRecord & FilterAnchoredConversationsForUser (RLS + FLS)', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });

        it('filters out conversations whose linked record fails RLS or whose field fails FLS', async () => {
            const entity = makeEntityInfo({
                id: 'entity-emp',
                flsApplies: true,
                deniedReadFieldsByUserId: {
                    [restrictedUser.ID]: ['Salary']
                }
            });
            const provider = {
                ProviderType: 'Database',
                Entities: [entity]
            } as unknown as IMetadataProvider;

            const runViewSpy = vi.fn().mockImplementation(async (params: { ExtraFilter: string }) => {
                if (params.ExtraFilter.includes("'rec-allowed'")) {
                    return { Success: true, Results: [{ ID: 'rec-allowed' }] };
                }
                return { Success: true, Results: [] };
            });
            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
                RunView: runViewSpy
            } as unknown as RunView);

            const conversations = [
                {
                    ID: 'conv-public-field',
                    LinkedEntityID: 'entity-emp',
                    LinkedRecordID: 'rec-allowed',
                    AnchorType: 'Field',
                    AnchorKey: 'Title',
                    AnchorMetadata: null,
                    AnchorMetadataObject: null
                },
                {
                    ID: 'conv-restricted-salary-field',
                    LinkedEntityID: 'entity-emp',
                    LinkedRecordID: 'rec-allowed',
                    AnchorType: 'Field',
                    AnchorKey: 'Salary',
                    AnchorMetadata: null,
                    AnchorMetadataObject: null
                },
                {
                    ID: 'conv-rls-blocked-record',
                    LinkedEntityID: 'entity-emp',
                    LinkedRecordID: 'rec-forbidden',
                    AnchorType: 'Record',
                    AnchorKey: null,
                    AnchorMetadata: null,
                    AnchorMetadataObject: null
                }
            ] as unknown as MJConversationEntity[];

            const visibleToRestricted = await FilterAnchoredConversationsForUser(provider, restrictedUser, conversations);
            expect(visibleToRestricted.map(c => c.ID)).toEqual(['conv-public-field']);
            // Deduplicated RLS checks: 1 for rec-allowed, 1 for rec-forbidden
            expect(runViewSpy).toHaveBeenCalledTimes(2);

            const visibleToHR = await FilterAnchoredConversationsForUser(provider, allowedUser, conversations);
            expect(visibleToHR.map(c => c.ID)).toEqual(['conv-public-field', 'conv-restricted-salary-field']);
        });

        it('returns Allowed=false when user lacks entity-level CanRead', async () => {
            const entity = makeEntityInfo({ id: 'entity-no-read', canRead: false });
            const provider = { ProviderType: 'Database', Entities: [entity] } as unknown as IMetadataProvider;
            const decision = await UserCanReadLinkedRecord(provider, restrictedUser, 'entity-no-read', 'rec-1');
            expect(decision.Allowed).toBe(false);
        });
    });

    describe('DetectReferencedRestrictedFieldsDeterministic & MergeRestrictedFieldsIntoAnchorMetadata', () => {
        const entityWithFLS = makeEntityInfo({
            flsApplies: true,
            fields: [
                { Name: 'ID', IsPrimaryKey: true },
                { Name: 'Salary', DisplayName: 'Annual Compensation', HasFieldPermissions: true },
                { Name: 'BasePayCode', DisplayName: 'Base Pay Code', HasFieldPermissions: true },
                { Name: 'Department', DisplayName: 'Department', HasFieldPermissions: false }
            ]
        });

        it('detects direct field anchor, field names, display names, and actual restricted field values in message text', () => {
            // 1. Direct field anchor
            expect(
                DetectReferencedRestrictedFieldsDeterministic(entityWithFLS, 'Looks good', 'Field', 'Salary')
            ).toEqual(['Salary']);

            // 2. Unanchored Record comment mentioning DisplayName ("Annual Compensation")
            expect(
                DetectReferencedRestrictedFieldsDeterministic(
                    entityWithFLS,
                    'Should we adjust their Annual Compensation before Q4?',
                    'Record',
                    null
                )
            ).toEqual(['Salary']);

            // 3. Unanchored Section comment quoting the restricted value itself without naming the field
            expect(
                DetectReferencedRestrictedFieldsDeterministic(
                    entityWithFLS,
                    'Why is 192500 entered here instead of the band midpoint?',
                    'Section',
                    'overview',
                    { Salary: 192500, BasePayCode: 'EXEC-99' }
                )
            ).toEqual(['Salary']);
        });

        it('merges detected restricted fields without duplicates into AnchorMetadata', () => {
            const merged = MergeRestrictedFieldsIntoAnchorMetadata(
                { sectionKey: 'comp', restrictedFields: ['Salary'] },
                ['salary', 'BasePayCode']
            );
            expect(merged).toEqual({
                Metadata: {
                    sectionKey: 'comp',
                    restrictedFields: ['Salary', 'BasePayCode']
                },
                Changed: true
            });
        });
    });

    describe('@Mention extraction & notification security', () => {
        const mentionAlice = '@{"type":"user","id":"user-alice","name":"Alice Smith"}';
        const mentionBob = '@{"type":"user","id":"user-bob","name":"Bob Restricted"}';
        const mentionAgent = '@{"type":"agent","id":"agent-sage","name":"Sage"}';

        it('extracts only user mentions and deduplicates them', () => {
            const msg = `Hey ${mentionAlice} and ${mentionAgent}, cc ${mentionBob} and ${mentionAlice}`;
            const mentions = ExtractUserMentionsFromMessage(msg);
            expect(mentions).toEqual([
                { ID: 'user-alice', Name: 'Alice Smith' },
                { ID: 'user-bob', Name: 'Bob Restricted' }
            ]);
        });

        it('extracts only newly added user mentions on message edit', () => {
            const oldMsg = `Checking with ${mentionAlice}`;
            const newMsg = `Checking with ${mentionAlice} and adding ${mentionBob}`;
            expect(ExtractNewlyAddedUserMentions(oldMsg, newMsg)).toEqual([
                { ID: 'user-bob', Name: 'Bob Restricted' }
            ]);
        });

        it('formats mention tokens as readable @Name in notification previews', () => {
            const preview = FormatMentionPlainTextPreview(`Please review ${mentionAlice} — thanks!`);
            expect(preview).toBe('Please review @Alice Smith — thanks!');
        });

        it('suppresses mention notifications for users denied FLS on the anchored conversation', async () => {
            const entity = makeEntityInfo({
                id: 'entity-emp',
                name: 'Employees',
                flsApplies: true,
                deniedReadFieldsByUserId: {
                    'user-bob': ['Salary']
                }
            });

            const savedNotifications: Array<{ UserID: string; Title: string }> = [];
            const mockConv = {
                ID: 'conv-1',
                Name: 'Salary Thread',
                LinkedEntityID: 'entity-emp',
                LinkedRecordID: 'rec-1',
                AnchorType: 'Field',
                AnchorKey: 'Salary',
                AnchorMetadata: null,
                AnchorMetadataObject: { fieldName: 'Salary', anchorDisplayName: 'Salary' },
                Load: vi.fn().mockResolvedValue(true)
            } as unknown as MJConversationEntity;

            const usersById: Record<string, UserInfo> = {
                'user-author': makeUser('user-author', 'Author'),
                'user-alice': makeUser('user-alice', 'Alice Smith'),
                'user-bob': makeUser('user-bob', 'Bob Restricted')
            };

            const provider = {
                ProviderType: 'Database',
                Entities: [entity],
                GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                    if (entityName === 'MJ: Conversations') {
                        return mockConv;
                    }
                    if (entityName === 'MJ: Users') {
                        return {
                            Name: 'Author',
                            Email: 'author@example.com',
                            Load: vi.fn().mockResolvedValue(true)
                        };
                    }
                    if (entityName === 'MJ: User Notifications') {
                        const notif: Record<string, unknown> = {
                            NewRecord: vi.fn(),
                            Save: vi.fn().mockImplementation(async () => {
                                savedNotifications.push({
                                    UserID: String(notif['UserID']),
                                    Title: String(notif['Title'])
                                });
                                return true;
                            })
                        };
                        return notif;
                    }
                    throw new Error(`Unexpected entity: ${entityName}`);
                })
            } as unknown as IMetadataProvider;

            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
                RunView: vi.fn().mockResolvedValue({ Success: true, Results: [{ ID: 'rec-1' }] })
            } as unknown as RunView);

            const deliveredCount = await DispatchConversationMentionNotifications({
                Provider: provider,
                ContextUser: usersById['user-author'],
                ConversationID: 'conv-1',
                ConversationDetailID: 'detail-1',
                AuthorUserID: 'user-author',
                Message: `Hi ${mentionAlice} and ${mentionBob}, let's discuss this salary.`,
                Conversation: mockConv,
                ResolveRecipientUserInfo: (id) => usersById[id] ?? null
            });

            // Alice gets notified; Bob is denied Read on Salary via FLS so Bob MUST NOT receive a notification!
            expect(deliveredCount).toBe(1);
            expect(savedNotifications).toHaveLength(1);
            expect(savedNotifications[0].UserID).toBe('user-alice');
        });
    });

    describe('ComputeAnchoredCommentCounts', () => {
        const entityWithFLS = makeEntityInfo({
            flsApplies: true,
            deniedReadFieldsByUserId: {
                [restrictedUser.ID]: ['Salary']
            }
        });

        const threads = [
            {
                AnchorType: 'Record' as const,
                AnchorKey: null,
                AnchorMetadata: null,
                AnchorMetadataObject: null,
                IsResolved: false
            },
            {
                AnchorType: 'Field' as const,
                AnchorKey: 'Title',
                AnchorMetadata: null,
                AnchorMetadataObject: { fieldName: 'Title', sectionKey: 'job-details', groupKey: 'general' },
                IsResolved: false
            },
            {
                AnchorType: 'Field' as const,
                AnchorKey: 'Salary',
                AnchorMetadata: null,
                AnchorMetadataObject: { fieldName: 'Salary', sectionKey: 'compensation', groupKey: 'general' },
                IsResolved: false
            },
            {
                AnchorType: 'Section' as const,
                AnchorKey: 'job-details',
                AnchorMetadata: null,
                AnchorMetadataObject: { sectionKey: 'job-details', groupKey: 'general' },
                IsResolved: true
            }
        ];

        it('rolls up open counts into ByField, BySection, and ByGroup for an allowed user', () => {
            const rollup = ComputeAnchoredCommentCounts(threads, allowedUser, entityWithFLS);
            expect(rollup.TotalOpenCount).toBe(3);
            expect(rollup.TotalResolvedCount).toBe(1);
            expect(rollup.RecordLevelOpenCount).toBe(1);
            expect(rollup.ByField.get('title')).toBe(1);
            expect(rollup.ByField.get('salary')).toBe(1);
            expect(rollup.BySection.get('job-details')).toBe(1);
            expect(rollup.BySection.get('compensation')).toBe(1);
            expect(rollup.ByGroup.get('general')).toBe(2);
        });

        it('excludes FLS-restricted threads from TotalOpenCount, ByField, BySection, and ByGroup for a restricted user', () => {
            const rollup = ComputeAnchoredCommentCounts(threads, restrictedUser, entityWithFLS);
            expect(rollup.TotalOpenCount).toBe(2);
            expect(rollup.ByField.get('salary')).toBeUndefined();
            expect(rollup.BySection.get('compensation')).toBeUndefined();
            expect(rollup.ByGroup.get('general')).toBe(1);
        });
    });
});
