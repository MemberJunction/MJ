import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';
import {
    BUILT_IN_COMMENT_TYPE_IDS,
    BUILT_IN_CONVERSATION_TYPE_IDS,
    COMMENT_TYPE_CODES,
    CONVERSATION_TYPE_CODES,
    ComputeAnchoredCommentCounts,
    ConversationEngine,
    MJCommentEntity,
    MJCommentTypeEntity,
    MJConversationDetailEntity,
    MJConversationEntity,
    MJConversationTypeEntity,
    MJFieldSuggestionEntity,
} from '../index';

describe('ConversationEngine — ConversationType, CommentType & FieldSuggestion APIs', () => {
    const engine = ConversationEngine.Instance;
    const contextUser = { ID: 'AABBCCDD-1111-4111-8111-111111111111', Name: 'Alice' } as unknown as UserInfo;

    beforeEach(() => {
        (engine as unknown as { _conversationTypes: MJConversationTypeEntity[] })._conversationTypes = [];
        (engine as unknown as { _commentTypes: MJCommentTypeEntity[] })._commentTypes = [];
    });

    it('resolves built-in conversation and comment type IDs before Config() and prefers cached rows once loaded', () => {
        expect(engine.ResolveConversationTypeID(CONVERSATION_TYPE_CODES.CHAT)).toBe(
            BUILT_IN_CONVERSATION_TYPE_IDS.CHAT
        );
        expect(engine.ResolveConversationTypeID('Meeting Room')).toBe(
            BUILT_IN_CONVERSATION_TYPE_IDS.MEETING_ROOM
        );
        expect(engine.ResolveConversationTypeID('SKIP')).toBe(
            BUILT_IN_CONVERSATION_TYPE_IDS.SKIP
        );
        expect(engine.ResolveConversationTypeID('ROUTINE')).toBe(
            BUILT_IN_CONVERSATION_TYPE_IDS.ROUTINE
        );
        expect(engine.ResolveConversationTypeID('COMMENT')).toBe(
            BUILT_IN_CONVERSATION_TYPE_IDS.COMMENT
        );
        expect(engine.ResolveConversationTypeID('NONEXISTENT_CUSTOM')).toBeNull();

        expect(engine.ResolveCommentTypeID(COMMENT_TYPE_CODES.COMMENT)).toBe(
            BUILT_IN_COMMENT_TYPE_IDS.COMMENT
        );
        expect(engine.ResolveCommentTypeID('Field Suggestion')).toBe(
            BUILT_IN_COMMENT_TYPE_IDS.FIELD_SUGGESTION
        );

        const customConvType = {
            ID: '99999999-9999-4999-8999-999999999999',
            Code: 'WAR_ROOM',
            Name: 'War Room',
        } as unknown as MJConversationTypeEntity;
        const customCommentType = {
            ID: '88888888-8888-4888-8888-888888888888',
            Code: 'POLICY_GATE',
            Name: 'Policy Gate',
        } as unknown as MJCommentTypeEntity;

        (engine as unknown as { _conversationTypes: MJConversationTypeEntity[] })._conversationTypes = [
            customConvType,
        ];
        (engine as unknown as { _commentTypes: MJCommentTypeEntity[] })._commentTypes = [
            customCommentType,
        ];

        expect(engine.TypeByCode('war_room')).toBe(customConvType);
        expect(engine.TypeByName('War Room')).toBe(customConvType);
        expect(engine.TypeByID('99999999-9999-4999-8999-999999999999')).toBe(customConvType);
        expect(engine.ResolveConversationTypeID('WAR_ROOM')).toBe(
            '99999999-9999-4999-8999-999999999999'
        );

        expect(engine.CommentTypeByCode('policy_gate')).toBe(customCommentType);
        expect(engine.CommentTypeByName('Policy Gate')).toBe(customCommentType);
        expect(engine.CommentTypeByID('88888888-8888-4888-8888-888888888888')).toBe(customCommentType);
        expect(engine.ResolveCommentTypeID('POLICY_GATE')).toBe(
            '88888888-8888-4888-8888-888888888888'
        );
    });

    it('creates a Field Suggestion with Conversation + Comment + FieldSuggestion fields and initial rationale message', async () => {
        const fakeSuggestion = {
            ID: '77777777-7777-4777-8777-777777777777',
            NewRecord: vi.fn(),
            Save: vi.fn(async () => true),
            LatestResult: null,
        } as unknown as MJFieldSuggestionEntity & Record<string, unknown>;

        const fakeDetail = {
            ID: '66666666-6666-4666-8666-666666666666',
            NewRecord: vi.fn(),
            Save: vi.fn(async () => true),
            LatestResult: null,
        } as unknown as MJConversationDetailEntity & Record<string, unknown>;

        const mockProvider = {
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: Field Suggestions') return fakeSuggestion;
                if (entityName === 'MJ: Conversation Details') return fakeDetail;
                throw new Error(`Unexpected entity ${entityName}`);
            }),
        } as unknown as IMetadataProvider;

        const { Suggestion, InitialDetail } = await engine.CreateFieldSuggestion(
            {
                linkedEntityId: '12345678-1234-4234-8234-123456789012',
                linkedRecordId: 'ABCDEF12-1234-4234-8234-123456789012',
                fieldName: 'DueAt',
                suggestedValue: '2026-12-31T00:00:00.000Z',
                source: 'LLM',
                confidence: 0.92,
                aiPromptRunId: '55555555-5555-4555-8555-555555555555',
                initialMessage: 'Issue body explicitly states target ship date of Dec 31.',
                provider: mockProvider,
            },
            contextUser
        );

        expect(Suggestion).toBe(fakeSuggestion);
        expect(fakeSuggestion.TypeID).toBe(BUILT_IN_CONVERSATION_TYPE_IDS.COMMENT);
        expect(fakeSuggestion.CommentTypeID).toBe(BUILT_IN_COMMENT_TYPE_IDS.FIELD_SUGGESTION);
        expect(fakeSuggestion.AnchorType).toBe('Field');
        expect(fakeSuggestion.AnchorKey).toBe('DueAt');
        expect(fakeSuggestion.SuggestedValue).toBe('2026-12-31T00:00:00.000Z');
        expect(fakeSuggestion.Source).toBe('LLM');
        expect(fakeSuggestion.Confidence).toBe(0.92);
        expect(fakeSuggestion.Outcome).toBeNull();
        expect(fakeSuggestion.Save).toHaveBeenCalledOnce();

        expect(InitialDetail).toBe(fakeDetail);
        expect(fakeDetail.ConversationID).toBe('77777777-7777-4777-8777-777777777777');
        expect(fakeDetail.Message).toBe('Issue body explicitly states target ship date of Dec 31.');
        expect(fakeDetail.Save).toHaveBeenCalledOnce();
    });

    it('transitions Outcome via AcceptFieldSuggestion and RejectFieldSuggestion and surfaces denial errors', async () => {
        const fakeSuggestion = {
            ID: '77777777-7777-4777-8777-777777777777',
            Outcome: null as MJFieldSuggestionEntity['Outcome'],
            Load: vi.fn(async () => true),
            Save: vi.fn(async () => true),
            LatestResult: null as { Message?: string; CompleteMessage?: string } | null,
        };
        const mockProvider = {
            GetEntityObject: vi.fn(async () => fakeSuggestion),
        } as unknown as IMetadataProvider;

        const accepted = await engine.AcceptFieldSuggestion(
            fakeSuggestion.ID,
            contextUser,
            mockProvider
        );
        expect(accepted.Outcome).toBe('Accepted');
        expect(fakeSuggestion.Save).toHaveBeenCalledTimes(1);

        fakeSuggestion.Outcome = null;
        const rejected = await engine.RejectFieldSuggestion(
            fakeSuggestion.ID,
            contextUser,
            mockProvider
        );
        expect(rejected.Outcome).toBe('Rejected');
        expect(fakeSuggestion.Save).toHaveBeenCalledTimes(2);

        fakeSuggestion.Save = vi.fn(async () => false);
        fakeSuggestion.LatestResult = { CompleteMessage: 'You do not have permission to update field DueAt.' };
        await expect(
            engine.AcceptFieldSuggestion(fakeSuggestion.ID, contextUser, mockProvider)
        ).rejects.toThrow(/permission to update field DueAt/);
    });

    it('computes per-comment-type field badge counts and respects FLS visibility in ComputeAnchoredCommentCounts', () => {
        const c1 = '11111111-1111-4111-8111-111111111111';
        const c2 = '22222222-2222-4222-8222-222222222222';
        const c3 = '33333333-3333-4333-8333-333333333333';
        const c4 = '44444444-4444-4444-8444-444444444444';

        const threads: Array<
            Pick<MJConversationEntity, 'AnchorType' | 'AnchorKey' | 'AnchorMetadata' | 'AnchorMetadataObject' | 'IsResolved'> & { ID: string }
        > = [
            {
                ID: c1,
                AnchorType: 'Field',
                AnchorKey: 'DueAt',
                AnchorMetadata: JSON.stringify({ sectionKey: 'schedule' }),
                AnchorMetadataObject: { sectionKey: 'schedule' },
                IsResolved: false,
            },
            {
                ID: c2,
                AnchorType: 'Field',
                AnchorKey: 'DueAt',
                AnchorMetadata: JSON.stringify({ sectionKey: 'schedule' }),
                AnchorMetadataObject: { sectionKey: 'schedule' },
                IsResolved: false,
            },
            {
                ID: c3,
                AnchorType: 'Field',
                AnchorKey: 'SecretSalary',
                AnchorMetadata: null,
                AnchorMetadataObject: null,
                IsResolved: false,
            },
            {
                ID: c4,
                AnchorType: 'Record',
                AnchorKey: null,
                AnchorMetadata: null,
                AnchorMetadataObject: null,
                IsResolved: true,
            },
        ];

        const typeMap = new Map<string, string>([
            [c1.toLowerCase(), COMMENT_TYPE_CODES.COMMENT],
            [c2.toLowerCase(), COMMENT_TYPE_CODES.FIELD_SUGGESTION],
            [c3.toLowerCase(), COMMENT_TYPE_CODES.FIELD_SUGGESTION],
        ]);

        const mockEntityInfo = {
            FieldLevelSecurityApplies: true,
            GetDeniedReadFields: () => new Set(['secretsalary']),
        } as unknown as EntityInfo;

        const rollup = ComputeAnchoredCommentCounts(threads, contextUser, mockEntityInfo, typeMap);
        // SecretSalary suggestion is hidden by FLS!
        expect(rollup.TotalOpenCount).toBe(2);
        expect(rollup.TotalResolvedCount).toBe(1);
        expect(rollup.OpenNoteCount).toBe(1);
        expect(rollup.OpenSuggestionCount).toBe(1);
        expect(rollup.ByField.get('dueat')).toBe(2);
        expect(rollup.ByFieldSuggestions?.get('dueat')).toBe(1);
        expect(rollup.ByFieldSuggestions?.has('secretsalary')).toBe(false);
        expect(rollup.ByFieldByType?.get('dueat')?.get('COMMENT')).toBe(1);
        expect(rollup.ByFieldByType?.get('dueat')?.get('FIELD_SUGGESTION')).toBe(1);
        expect(rollup.BySection.get('schedule')).toBe(2);
    });

    it('loads MJ: Comments and MJ: Field Suggestions in a single batched RunViews call', async () => {
        const convId = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
        const mockComment = {
            ID: convId,
            CommentTypeID: BUILT_IN_COMMENT_TYPE_IDS.FIELD_SUGGESTION,
        } as unknown as MJCommentEntity;
        const mockSuggestion = {
            ID: convId,
            SuggestedValue: '8',
            Source: 'LLM',
            Outcome: null,
        } as unknown as MJFieldSuggestionEntity;

        const runViewsSpy = vi.fn(async () => [
            { Success: true, Results: [mockComment] },
            { Success: true, Results: [mockSuggestion] },
        ]);

        const mockProvider = {
            Entities: [{ Name: 'MJ: Comments' }, { Name: 'MJ: Field Suggestions' }],
            RunViews: runViewsSpy,
        } as unknown as IMetadataProvider;

        const bundle = await engine.LoadAnchoredCommentsAndSuggestions(
            [convId],
            contextUser,
            mockProvider,
            true
        );

        expect(bundle.CommentsByConversationId.get(convId.toLowerCase())).toBe(mockComment);
        expect(bundle.SuggestionsByConversationId.get(convId.toLowerCase())).toBe(mockSuggestion);
        expect(bundle.CommentTypeCodeByConversationId.get(convId.toLowerCase())).toBe(
            COMMENT_TYPE_CODES.FIELD_SUGGESTION
        );
    });

    it('throws in LoadAnchoredCommentsAndSuggestions when either batched RunViews leg fails instead of returning empty maps', async () => {
        const convId = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
        const failingProvider: Partial<IMetadataProvider & IRunViewProvider> = {
            Entities: [{ Name: 'MJ: Comments' } as EntityInfo, { Name: 'MJ: Field Suggestions' } as EntityInfo],
            RunViews: vi.fn(async () => [
                { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '', UserViewRunID: '' },
                {
                    Success: false,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: 'Permission denied on MJ: Field Suggestions',
                    UserViewRunID: '',
                },
            ]),
        };

        await expect(
            engine.LoadAnchoredCommentsAndSuggestions([convId], contextUser, failingProvider as IMetadataProvider, true)
        ).rejects.toThrow(/Permission denied on MJ: Field Suggestions/);
    });

    it('throws in CreateAnchoredConversation when updating CommentTypeID on MJ: Comments fails to save', async () => {
        const customTypeId = '88888888-8888-4888-8888-888888888888';
        const mockConversation = {
            ID: '11112222-3333-4444-8555-666677778888',
            ISAChild: null,
            LatestResult: null,
            NewRecord: vi.fn(),
            Save: vi.fn(async () => true),
        } as Partial<MJConversationEntity> as MJConversationEntity;

        const mockComment = {
            ID: '11112222-3333-4444-8555-666677778888',
            CommentTypeID: BUILT_IN_COMMENT_TYPE_IDS.COMMENT,
            LatestResult: {
                CompleteMessage: 'AnchorType violates CommentType AllowedAnchorTypes',
                Message: 'AnchorType violates CommentType AllowedAnchorTypes',
            } as MJCommentEntity['LatestResult'],
            Load: vi.fn(async () => true),
            Save: vi.fn(async () => false),
        } as Partial<MJCommentEntity> as MJCommentEntity;

        const mockProvider: Partial<IMetadataProvider> = {
            GetEntityObject: (async <T>(entityName: string): Promise<T> => {
                if (entityName === 'MJ: Conversations') return mockConversation as T;
                if (entityName === 'MJ: Comments') return mockComment as T;
                throw new Error(`Unexpected entity ${entityName}`);
            }) as IMetadataProvider['GetEntityObject'],
        };

        await expect(
            engine.CreateAnchoredConversation(
                {
                    linkedEntityId: '12345678-1234-4234-8234-123456789012',
                    linkedRecordId: 'ABCDEF12-1234-4234-8234-123456789012',
                    anchorType: 'Record',
                    commentTypeId: customTypeId,
                    provider: mockProvider as IMetadataProvider,
                },
                contextUser
            )
        ).rejects.toThrow(/AnchorType violates CommentType AllowedAnchorTypes/);
        expect(mockComment.Save).toHaveBeenCalledOnce();
    });
});
