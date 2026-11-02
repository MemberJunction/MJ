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
        expect(res.Reason).toContain('Salary');
        expect(conversation.Save).not.toHaveBeenCalled();
    });
});
