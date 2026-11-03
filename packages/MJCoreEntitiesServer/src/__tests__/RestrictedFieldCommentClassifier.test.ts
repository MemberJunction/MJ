import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    EntityFieldInfo,
    EntityFieldTSType,
    EntityInfo,
    IMetadataProvider,
    RunView,
    UserInfo
} from '@memberjunction/core';
import {
    IsConversationHiddenByFieldSecurity,
    type MJConversationEntity
} from '@memberjunction/core-entities';
import {
    InspectAndStampRestrictedFieldsForComment,
    RegisterRestrictedFieldLLMClassifier
} from '../custom/RestrictedFieldCommentClassifier';
import { AnchoredConversationPostRunViewHook } from '../custom/AnchoredConversationReadSecurityHook';
import { RunViewParams, RunViewResult, WellKnownUserSource } from '@memberjunction/core';

function makeUser(id: string, name = 'User'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    return u;
}

function makeEntityWithFLS(deniedByUserId: Record<string, string[]>): EntityInfo {
    const fields = [
        {
            Name: 'ID',
            DisplayName: 'ID',
            DisplayNameOrName: 'ID',
            IsPrimaryKey: true,
            HasFieldPermissions: false,
            TSType: EntityFieldTSType.String
        },
        {
            Name: 'Salary',
            DisplayName: 'Annual Compensation',
            DisplayNameOrName: 'Annual Compensation',
            Description: 'Base annual salary in USD',
            IsPrimaryKey: false,
            HasFieldPermissions: true,
            TSType: EntityFieldTSType.Number
        },
        {
            Name: 'BonusTarget',
            DisplayName: 'Executive Bonus Target',
            DisplayNameOrName: 'Executive Bonus Target',
            Description: 'Target annual bonus percentage',
            IsPrimaryKey: false,
            HasFieldPermissions: true,
            TSType: EntityFieldTSType.Number
        },
        {
            Name: 'Title',
            DisplayName: 'Job Title',
            DisplayNameOrName: 'Job Title',
            IsPrimaryKey: false,
            HasFieldPermissions: false,
            TSType: EntityFieldTSType.String
        }
    ] as unknown as EntityFieldInfo[];

    return {
        ID: 'entity-emp',
        Name: 'Employees',
        DisplayNameOrName: 'Employees',
        PrimaryKeys: [fields[0]],
        FirstPrimaryKey: fields[0],
        Fields: fields,
        FieldLevelSecurityApplies: true,
        GetUserPermisions: vi.fn().mockReturnValue({ CanRead: true }),
        GetDeniedReadFields: vi.fn((user: UserInfo) => {
            const list = deniedByUserId[user.ID] ?? [];
            return new Set(list.map((f) => f.toLowerCase()));
        })
    } as unknown as EntityInfo;
}

describe('InspectAndStampRestrictedFieldsForComment (Write-Time FLS Detector)', () => {
    const hrUser = makeUser('user-hr', 'HR Director');
    const contractorUser = makeUser('user-contractor', 'Contractor');

    beforeEach(() => {
        RegisterRestrictedFieldLLMClassifier(null);
        vi.restoreAllMocks();
    });

    afterEach(() => {
        RegisterRestrictedFieldLLMClassifier(null);
    });

    it('detects restricted field value from record via Stage 1 and stamps AnchorMetadataObject.restrictedFields', async () => {
        const entity = makeEntityWithFLS({
            [contractorUser.ID]: ['Salary']
        });
        const provider = {
            ProviderType: 'Database',
            Entities: [entity]
        } as unknown as IMetadataProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({
                Success: true,
                Results: [{ ID: 'emp-1', Salary: 215000, BonusTarget: 25 }]
            })
        } as unknown as RunView);

        const conversation = {
            ID: 'conv-record-1',
            IsSaved: true,
            LinkedEntityID: 'entity-emp',
            LinkedRecordID: 'emp-1',
            AnchorType: 'Record',
            AnchorKey: null,
            AnchorMetadata: null,
            AnchorMetadataObject: { anchorDisplayName: 'Employee Record' },
            Save: vi.fn().mockResolvedValue(true)
        } as unknown as MJConversationEntity;

        // HR user posts a Record-level comment quoting "215,000" without naming the Salary field
        const res = await InspectAndStampRestrictedFieldsForComment({
            Provider: provider,
            ContextUser: hrUser,
            Conversation: conversation,
            EntityInfo: entity,
            MessageText: 'Moving to 215,000 puts them at the top of the band.',
            SkipLLMStage: true
        });

        expect(res.Allowed).toBe(true);
        expect(res.DetectedFields).toEqual(['Salary']);
        expect(conversation.AnchorMetadataObject?.restrictedFields).toEqual(['Salary']);
        expect(conversation.Save).toHaveBeenCalledTimes(1);

        // Verify that a subsequent read by contractorUser is now deterministically hidden in 0ms!
        expect(
            IsConversationHiddenByFieldSecurity(
                entity,
                contractorUser,
                conversation.AnchorType,
                conversation.AnchorKey,
                conversation.AnchorMetadataObject
            )
        ).toBe(true);
        expect(
            IsConversationHiddenByFieldSecurity(
                entity,
                hrUser,
                conversation.AnchorType,
                conversation.AnchorKey,
                conversation.AnchorMetadataObject
            )
        ).toBe(false);
    });

    it('invokes Stage 2 semantic LLM classifier for paraphrased references and stamps restrictedFields', async () => {
        const entity = makeEntityWithFLS({
            [contractorUser.ID]: ['Salary', 'BonusTarget']
        });
        const provider = {
            ProviderType: 'Database',
            Entities: [entity]
        } as unknown as IMetadataProvider;

        const classifierSpy = vi.fn().mockResolvedValue(['Salary', 'BonusTarget']);
        RegisterRestrictedFieldLLMClassifier(classifierSpy);

        const conversation = {
            ID: 'conv-sec-1',
            IsSaved: true,
            LinkedEntityID: 'entity-emp',
            LinkedRecordID: 'emp-1',
            AnchorType: 'Section',
            AnchorKey: 'general-notes',
            AnchorMetadata: null,
            AnchorMetadataObject: { sectionKey: 'general-notes' },
            Save: vi.fn().mockResolvedValue(true)
        } as unknown as MJConversationEntity;

        const res = await InspectAndStampRestrictedFieldsForComment({
            Provider: provider,
            ContextUser: hrUser,
            Conversation: conversation,
            EntityInfo: entity,
            MessageText: 'They are asking for mid-six-figures total comp plus a 30% incentive.',
            RecordValues: { ID: 'emp-1', Salary: 215000, BonusTarget: 25 }
        });

        expect(classifierSpy).toHaveBeenCalledTimes(1);
        expect(res.Allowed).toBe(true);
        expect(res.DetectedFields).toEqual(['Salary', 'BonusTarget']);
        expect(conversation.AnchorMetadataObject?.restrictedFields).toEqual(['Salary', 'BonusTarget']);

        // Restricted contractor user cannot see this Section-level thread
        expect(
            IsConversationHiddenByFieldSecurity(
                entity,
                contractorUser,
                conversation.AnchorType,
                conversation.AnchorKey,
                conversation.AnchorMetadataObject
            )
        ).toBe(true);
    });

    it('refuses the save when a restricted user attempts to comment on a restricted field they cannot read', async () => {
        const entity = makeEntityWithFLS({
            [contractorUser.ID]: ['Salary']
        });
        const provider = {
            ProviderType: 'Database',
            Entities: [entity]
        } as unknown as IMetadataProvider;

        const conversation = {
            ID: 'conv-probe-1',
            IsSaved: true,
            LinkedEntityID: 'entity-emp',
            LinkedRecordID: 'emp-1',
            AnchorType: 'Record',
            AnchorKey: null,
            AnchorMetadata: null,
            AnchorMetadataObject: null,
            Save: vi.fn().mockResolvedValue(true)
        } as unknown as MJConversationEntity;

        const res = await InspectAndStampRestrictedFieldsForComment({
            Provider: provider,
            ContextUser: contractorUser,
            Conversation: conversation,
            EntityInfo: entity,
            MessageText: 'What is their Salary right now?',
            RecordValues: { ID: 'emp-1', Salary: 215000, BonusTarget: 25 },
            SkipLLMStage: true
        });

        expect(res.Allowed).toBe(false);
        expect(res.AuthorDeniedFields).toEqual(['Salary']);
        expect(res.Reason).toBe('You do not have permission to comment on restricted fields.');
        expect(res.Reason).not.toContain('Salary');
        expect(conversation.Save).not.toHaveBeenCalled();
    });

    it('does not value-match against fields the author is denied, preventing a yes/no guessing oracle', async () => {
        const entity = makeEntityWithFLS({
            [contractorUser.ID]: ['Salary']
        });
        const provider = {
            ProviderType: 'Database',
            Entities: [entity]
        } as unknown as IMetadataProvider;

        const conversation = {
            ID: 'conv-guess-1',
            IsSaved: true,
            LinkedEntityID: 'entity-emp',
            LinkedRecordID: 'emp-1',
            AnchorType: 'Record',
            AnchorKey: null,
            AnchorMetadata: null,
            AnchorMetadataObject: null,
            Save: vi.fn().mockResolvedValue(true)
        } as unknown as MJConversationEntity;

        // Contractor is denied Salary and posts a comment containing the exact hidden value (215000).
        // The save must succeed without revealing or stamping Salary.
        const res = await InspectAndStampRestrictedFieldsForComment({
            Provider: provider,
            ContextUser: contractorUser,
            Conversation: conversation,
            EntityInfo: entity,
            MessageText: 'Is the number 215000 or 215,000?',
            RecordValues: { ID: 'emp-1', Salary: 215000, BonusTarget: 25 },
            SkipLLMStage: true
        });

        expect(res.Allowed).toBe(true);
        expect(res.DetectedFields).toEqual([]);
        expect(res.AuthorDeniedFields).toEqual([]);
    });

    it('enforces server-side RLS + FLS read filtering via AnchoredConversationPostRunViewHook on MJ: Conversations and MJ: Conversation Details', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockReturnValue(false);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(hrUser);

        const entity = makeEntityWithFLS({
            [contractorUser.ID]: ['Salary']
        });
        const provider = {
            ProviderType: 'Database',
            EntityByID: (id: string) => (id === 'entity-emp' ? entity : undefined),
            Entities: [entity]
        } as unknown as IMetadataProvider;

        Object.defineProperty(contractorUser, 'OwningProvider', {
            value: provider,
            configurable: true
        });

        const convPublic = {
            ID: 'C1111111-0000-0000-0000-000000000001',
            LinkedEntityID: 'entity-emp',
            LinkedRecordID: 'emp-allowed',
            AnchorType: 'Field',
            AnchorKey: 'Title',
            AnchorMetadata: null
        };
        const convDeniedFls = {
            ID: 'C2222222-0000-0000-0000-000000000002',
            LinkedEntityID: 'entity-emp',
            LinkedRecordID: 'emp-allowed',
            AnchorType: 'Field',
            AnchorKey: 'Salary',
            AnchorMetadata: JSON.stringify({ fieldName: 'Salary', restrictedFields: ['Salary'] })
        };
        const convDeniedRls = {
            ID: 'C3333333-0000-0000-0000-000000000003',
            LinkedEntityID: 'entity-emp',
            LinkedRecordID: 'emp-hidden-by-rls',
            AnchorType: 'Record',
            AnchorKey: null,
            AnchorMetadata: null
        };

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockImplementation(async (params: RunViewParams) => {
                if (params.EntityName === 'Employees') {
                    if (String(params.ExtraFilter).includes('emp-allowed')) {
                        return { Success: true, Results: [{ ID: 'emp-allowed' }] };
                    }
                    return { Success: true, Results: [] };
                }
                if (params.EntityName === 'MJ: Conversations') {
                    return {
                        Success: true,
                        Results: [convPublic, convDeniedFls, convDeniedRls]
                    };
                }
                return { Success: true, Results: [] };
            })
        } as unknown as RunView);

        // 1. Raw RunView on MJ: Conversations drops both FLS-denied and RLS-denied anchored threads
        const convResult = await AnchoredConversationPostRunViewHook(
            { EntityName: 'MJ: Conversations' },
            {
                Success: true,
                Results: [convPublic, convDeniedFls, convDeniedRls],
                RowCount: 3,
                TotalRowCount: 3
            } as unknown as RunViewResult,
            contractorUser
        );
        expect(convResult.Results.map((r: { ID: string }) => r.ID)).toEqual([convPublic.ID]);
        expect(convResult.RowCount).toBe(1);

        // 2. Raw RunView on MJ: Conversation Details drops messages from FLS-denied and RLS-denied threads
        const detailResult = await AnchoredConversationPostRunViewHook(
            { EntityName: 'MJ: Conversation Details' },
            {
                Success: true,
                Results: [
                    { ID: 'D1', ConversationID: convPublic.ID, Message: 'Public title note' },
                    { ID: 'D2', ConversationID: convDeniedFls.ID, Message: 'Secret salary note' },
                    { ID: 'D3', ConversationID: convDeniedRls.ID, Message: 'Hidden row note' }
                ],
                RowCount: 3,
                TotalRowCount: 3
            } as unknown as RunViewResult,
            contractorUser
        );
        expect(detailResult.Results.map((d: { ID: string }) => d.ID)).toEqual(['D1']);
        expect(detailResult.RowCount).toBe(1);
    });
});
