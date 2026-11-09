import { describe, expect, it, vi } from 'vitest';
import { BaseEntity, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    COMMENT_TYPE_CODES,
    ConversationEngine,
    MJCommentEntity,
    MJConversationDetailEntity,
    MJConversationEntity,
    MJFieldSuggestionEntity,
    UserInfoEngine
} from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import { FormRecordCommentsCoordinatorService } from '../form-record-comments-coordinator.service';
import { MjRecordCommentsComponent } from '../record-comments.component';
import { RecordCommentsToolbarAction } from '../../toolbar/actions/record-comments-toolbar-action';
import { FormToolbarActionLifecycleContext } from '../../toolbar/base-form-toolbar-action';
import { FormRecordRefreshCoordinator } from '../../form-record-refresh.coordinator';

function makeEntityInfo(deniedFields: string[] = []): EntityInfo {
    const deniedSet = new Set(deniedFields.map((f) => f.toLowerCase()));
    return {
        ID: 'E0000000-0000-0000-0000-000000000001',
        Name: 'Contacts',
        DisplayNameOrName: 'Contacts',
        FieldLevelSecurityApplies: deniedSet.size > 0,
        GetDeniedReadFields: vi.fn().mockReturnValue(deniedSet),
        IsFieldReadableByUser: vi.fn((fieldName: string) => !deniedSet.has(fieldName.toLowerCase())),
        Fields: [
            { Name: 'ID', IsPrimaryKey: true, DisplayNameOrName: 'ID' },
            { Name: 'Email', IsPrimaryKey: false, DisplayNameOrName: 'Email', Category: 'Contact Info' },
            { Name: 'Salary', IsPrimaryKey: false, DisplayNameOrName: 'Salary', Category: 'Compensation' }
        ]
    } as unknown as EntityInfo;
}

function makeRecord(entityInfo: EntityInfo, isSaved = true): BaseEntity {
    return {
        EntityInfo: entityInfo,
        IsSaved: isSaved,
        PrimaryKey: {
            Values: () => ['R0000000-0000-0000-0000-000000000001'],
            ToURLSegment: () => 'ID|R0000000-0000-0000-0000-000000000001',
            ToConcatenatedString: () => 'R0000000-0000-0000-0000-000000000001',
            KeyValuePairs: [{ FieldName: 'ID', Value: 'R0000000-0000-0000-0000-000000000001' }]
        },
        Fields: [
            { Name: 'ID', Value: 'R0000000-0000-0000-0000-000000000001' },
            { Name: 'Email', Value: 'alice@example.com' },
            { Name: 'Salary', Value: 150000 }
        ]
    } as unknown as BaseEntity;
}

function makeConv(overrides: Partial<MJConversationEntity>): MJConversationEntity {
    return {
        ID: overrides.ID ?? 'C0000000-0000-0000-0000-000000000001',
        Name: overrides.Name ?? 'Comment',
        LinkedEntityID: overrides.LinkedEntityID ?? 'E0000000-0000-0000-0000-000000000001',
        LinkedRecordID: overrides.LinkedRecordID ?? 'R0000000-0000-0000-0000-000000000001',
        AnchorType: overrides.AnchorType ?? 'Field',
        AnchorKey: overrides.AnchorKey ?? 'Email',
        AnchorMetadata: overrides.AnchorMetadata ?? null,
        AnchorMetadataObject: overrides.AnchorMetadataObject ?? null,
        IsResolved: overrides.IsResolved ?? false
    } as unknown as MJConversationEntity;
}

describe('FormRecordCommentsCoordinatorService', () => {
    const user = { ID: 'U0000000-0000-0000-0000-000000000001', Name: 'Alice' } as unknown as UserInfo;
    const provider = { CurrentUser: user } as unknown as IMetadataProvider;

    it('loads anchored conversations, computes field/section/group rollups, and filters FLS-denied fields', async () => {
        const entityInfo = makeEntityInfo(['Salary']);
        const record = makeRecord(entityInfo, true);
        const c1 = makeConv({
            ID: 'C1',
            AnchorType: 'Field',
            AnchorKey: 'Email',
            AnchorMetadataObject: { sectionKey: 'contactSection', groupKey: 'details' }
        });
        const c2 = makeConv({
            ID: 'C2',
            AnchorType: 'Field',
            AnchorKey: 'Salary',
            AnchorMetadataObject: { sectionKey: 'compSection', groupKey: 'details' }
        });
        const c3 = makeConv({
            ID: 'C3',
            AnchorType: 'Section',
            AnchorKey: 'contactSection',
            AnchorMetadataObject: { sectionKey: 'contactSection', groupKey: 'details' }
        });

        const loadConvSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversations')
            .mockResolvedValue([c1, c2, c3]);
        const loadDetailsSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversationDetails')
            .mockResolvedValue(new Map<string, MJConversationDetailEntity[]>());

        try {
            const service = new FormRecordCommentsCoordinatorService();
            const rollup = await service.LoadForRecord(record, provider);

            // Salary thread (c2) is hidden by FLS; Email (c1) and contactSection (c3) are visible
            expect(rollup.TotalOpenCount).toBe(2);
            expect(service.GetFieldOpenCommentCount('Email')).toBe(1);
            expect(service.GetFieldOpenCommentCount('Salary')).toBe(0);
            expect(service.GetSectionOpenCommentCount('contactSection', ['Email'])).toBe(2);
            expect(service.GetGroupOpenCommentCount('details', ['contactSection'])).toBe(2);
        } finally {
            loadConvSpy.mockRestore();
            loadDetailsSpy.mockRestore();
        }
    });

    it('manages popover and drawer targets and emits anchor navigation requests', () => {
        const service = new FormRecordCommentsCoordinatorService();
        let navEvents = 0;
        service.NavigateToAnchor$.subscribe(() => navEvents++);

        service.OpenPopoverForTarget({
            AnchorType: 'Field',
            AnchorKey: 'Email',
            Label: 'Email'
        });
        expect(service.ActivePopoverTarget?.AnchorKey).toBe('Email');
        expect(service.IsDrawerOpen).toBe(false);

        service.SetDrawerOpen(true, service.ActivePopoverTarget);
        expect(service.IsDrawerOpen).toBe(true);
        expect(service.ActivePopoverTarget).toBeNull();
        expect(service.DrawerTargetFilter?.AnchorKey).toBe('Email');

        service.RequestNavigateToAnchor({
            AnchorType: 'Field',
            AnchorKey: 'Email',
            SectionKey: 'contactSection'
        });
        expect(navEvents).toBe(1);
    });
});

describe('RecordCommentsToolbarAction', () => {
    it('syncs badge and active state with the form container context', () => {
        const action = new RecordCommentsToolbarAction();
        let badgeVal: string | number | null | undefined;
        let activeVal = false;
        let drawerOpen = false;
        let commentCount = 4;

        const ctx: FormToolbarActionLifecycleContext = {
            Record: makeRecord(makeEntityInfo(), true),
            EntityInfo: makeEntityInfo(),
            Provider: {} as unknown as IMetadataProvider,
            EditMode: false,
            IsDirty: false,
            IsPinned: true,
            IsVisibleOnBar: true,
            FormComponent: null,
            SetBadge: (b) => {
                badgeVal = b;
            },
            SetLoading: () => undefined,
            SetDisabled: () => undefined,
            SetActive: (a) => {
                activeVal = a;
            },
            SetRecordLinksDrawerOpen: () => undefined,
            IsRecordLinksDrawerOpen: () => false,
            SetLinksSummary: () => undefined,
            SetRecordCommentsDrawerOpen: (open) => {
                drawerOpen = open;
            },
            IsRecordCommentsDrawerOpen: () => drawerOpen,
            GetRecordCommentCount: () => commentCount,
            RequestChangeDetection: () => undefined
        };

        expect(action.IsApplicable(ctx)).toBe(true);
        action.OnPrewarm(ctx);
        expect(badgeVal).toBe(4);
        expect(activeVal).toBe(false);

        action.OnExecute(ctx);
        expect(drawerOpen).toBe(true);
        expect(activeVal).toBe(true);

        commentCount = 0;
        action.OnRecordRefreshed(ctx);
        expect(badgeVal).toBeUndefined();

        // When AllowRecordComments is false on EntityInfo, IsApplicable returns false
        const disabledEntity = makeEntityInfo();
        Object.defineProperty(disabledEntity, 'AllowRecordComments', { get: () => false });
        const disabledCtx: FormToolbarActionLifecycleContext = {
            ...ctx,
            EntityInfo: disabledEntity,
            Record: makeRecord(disabledEntity, true)
        };
        expect(action.IsApplicable(disabledCtx)).toBe(false);
    });
});

describe('MjRecordCommentsComponent', () => {
    it('formats user and agent @mentions into safe pill HTML while escaping untrusted HTML', () => {
        const comp = Object.create(MjRecordCommentsComponent.prototype) as MjRecordCommentsComponent;
        const html = comp.FormatMessageHtml(
            'Hello @{"type":"user","id":"u1","name":"Alice <Admin>"} and @{"type":"agent","id":"a1","name":"Sage"} <script>alert(1)</script>'
        );
        expect(html).toContain('mj-record-comments__mention-pill--user');
        expect(html).toContain('@Alice &lt;Admin&gt;');
        expect(html).toContain('mj-record-comments__mention-pill--agent');
        expect(html).toContain('@Sage');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('inserts human-readable @Name into composer, tracks draft mention chips, serializes to wire tokens on submit, and parses clickable record-link segments', () => {
        const comp = Object.assign(Object.create(MjRecordCommentsComponent.prototype), {
            NewThreadMessage: 'Hey @ad',
            ReplyDrafts: new Map<string, string>(),
            SelectedMentionsByContext: new Map(),
            ActiveMentionContext: {
                Target: 'new' as const,
                Query: 'ad',
                TriggerIndex: 4,
                SelectedIndex: 0
            },
            FilteredMentionCandidates: [],
            cdr: { markForCheck: vi.fn() }
        }) as unknown as MjRecordCommentsComponent;

        const adaCandidate = {
            Type: 'user' as const,
            ID: 'D2000001-0000-4000-8000-000000000001',
            Name: 'Ada Owner',
            Subtitle: 'ada@example.com'
        };
        const sageCandidate = {
            Type: 'agent' as const,
            ID: 'A2000001-0000-4000-8000-000000000002',
            Name: 'Sage Agent'
        };

        // 1. Selecting a candidate inserts clean @Ada Owner instead of raw JSON
        comp.InsertMentionCandidate(adaCandidate, 'new');
        expect(comp.NewThreadMessage).toBe('Hey @Ada Owner ');
        expect(comp.NewThreadMessage).not.toContain('@{"type"');

        // 2. Draft mention chip is returned while @Ada Owner is in the text
        const draftMentions = comp.GetDraftMentions('new');
        expect(draftMentions).toHaveLength(1);
        expect(draftMentions[0].Name).toBe('Ada Owner');

        // Add a second mention
        comp.NewThreadMessage = 'Hey @Ada Owner and @sa';
        comp.ActiveMentionContext = {
            Target: 'new',
            Query: 'sa',
            TriggerIndex: 19,
            SelectedIndex: 0
        };
        comp.InsertMentionCandidate(sageCandidate, 'new');
        expect(comp.NewThreadMessage).toBe('Hey @Ada Owner and @Sage Agent ');
        expect(comp.GetDraftMentions('new')).toHaveLength(2);

        // 3. SerializeMentionsForWire converts @Name tokens to @{"type":...} wire format
        const wireText = comp.SerializeMentionsForWire(
            'Hey @Ada Owner and @Sage Agent please check this',
            'new'
        );
        expect(wireText).toBe(
            'Hey @{"type":"user","id":"D2000001-0000-4000-8000-000000000001","name":"Ada Owner"} and @{"type":"agent","id":"A2000001-0000-4000-8000-000000000002","name":"Sage Agent"} please check this'
        );

        // 4. ParseMessageSegments produces clickable mention segments with EntityName + ID for [mjRecordLink]
        const segments = comp.ParseMessageSegments(wireText);
        expect(segments).toEqual([
            { Kind: 'text', Text: 'Hey ' },
            {
                Kind: 'mention',
                MentionType: 'user',
                ID: 'D2000001-0000-4000-8000-000000000001',
                Name: 'Ada Owner',
                EntityName: 'MJ: Users'
            },
            { Kind: 'text', Text: ' and ' },
            {
                Kind: 'mention',
                MentionType: 'agent',
                ID: 'A2000001-0000-4000-8000-000000000002',
                Name: 'Sage Agent',
                EntityName: 'MJ: AI Agents'
            },
            { Kind: 'text', Text: ' please check this' }
        ]);

        // 5. Removing a draft mention chip strips @Ada Owner from composer text
        comp.RemoveDraftMention(adaCandidate, 'new');
        expect(comp.NewThreadMessage).not.toContain('@Ada Owner');
        expect(comp.GetDraftMentions('new')).toHaveLength(1);
    });

    it('detects when a field value has changed since the comment quotedValue snapshot', async () => {
        const entityInfo = makeEntityInfo();
        const record = makeRecord(entityInfo, true);
        const c1 = makeConv({
            ID: 'C1',
            AnchorType: 'Field',
            AnchorKey: 'Email',
            AnchorMetadataObject: {
                fieldName: 'Email',
                quotedValue: 'old-email@example.com',
                restrictedFields: ['Salary']
            }
        });

        const loadConvSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversations')
            .mockResolvedValue([c1]);
        const loadDetailsSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversationDetails')
            .mockResolvedValue(new Map<string, MJConversationDetailEntity[]>());

        try {
            const coordinator = new FormRecordCommentsCoordinatorService();
            await coordinator.LoadForRecord(record, { CurrentUser: { ID: 'u1' } } as unknown as IMetadataProvider);

            const comp = Object.assign(Object.create(MjRecordCommentsComponent.prototype), {
                Coordinator: coordinator,
                Record: record,
                Mode: 'drawer' as const
            }) as MjRecordCommentsComponent;

            const threads = comp.VisibleThreads;
            expect(threads).toHaveLength(1);
            expect(threads[0].QuotedValue).toBe('old-email@example.com');
            expect(threads[0].CurrentLiveValue).toBe('alice@example.com');
            expect(threads[0].HasValueChangedSinceComment).toBe(true);
            expect(threads[0].RestrictedFields).toEqual(['Salary']);
        } finally {
            loadConvSpy.mockRestore();
            loadDetailsSpy.mockRestore();
        }
    });

    it('suppresses Enter submission during IME composition and submits cleanly after composition', () => {
        const submitSpy = vi.fn().mockResolvedValue(undefined);
        const comp = Object.assign(Object.create(MjRecordCommentsComponent.prototype), {
            ActiveMentionContext: null,
            FilteredMentionCandidates: [],
            lastCompositionEndAt: null,
            OnSubmitNewThread: submitSpy,
            cdr: { markForCheck: vi.fn() }
        }) as unknown as MjRecordCommentsComponent;

        // 1. Enter while IME is composing -> must NOT submit
        comp.OnComposerKeydown(
            {
                key: 'Enter',
                isComposing: true,
                keyCode: 229,
                shiftKey: false,
                metaKey: false,
                ctrlKey: false,
                altKey: false,
                timeStamp: 1000,
                preventDefault: vi.fn()
            } as unknown as KeyboardEvent,
            'new'
        );
        expect(submitSpy).not.toHaveBeenCalled();

        // 2. Safari quirk: compositionend fires <50ms before keydown Enter -> must NOT submit
        comp.OnComposerCompositionEnd({ timeStamp: 2000 } as unknown as CompositionEvent);
        comp.OnComposerKeydown(
            {
                key: 'Enter',
                isComposing: false,
                keyCode: 13,
                shiftKey: false,
                metaKey: false,
                ctrlKey: false,
                altKey: false,
                timeStamp: 2020,
                preventDefault: vi.fn()
            } as unknown as KeyboardEvent,
            'new'
        );
        expect(submitSpy).not.toHaveBeenCalled();

        // 3. Standard Enter well after composition -> submits
        comp.OnComposerKeydown(
            {
                key: 'Enter',
                isComposing: false,
                keyCode: 13,
                shiftKey: false,
                metaKey: false,
                ctrlKey: false,
                altKey: false,
                timeStamp: 2500,
                preventDefault: vi.fn()
            } as unknown as KeyboardEvent,
            'new'
        );
        expect(submitSpy).toHaveBeenCalledOnce();
    });

    it('groups visible threads by section/category in GroupedVisibleThreads and supports expanding popover size', async () => {
        const entityInfo = makeEntityInfo();
        const record = makeRecord(entityInfo, true);
        const cField = makeConv({
            ID: 'C-FIELD',
            AnchorType: 'Field',
            AnchorKey: 'Email',
            AnchorMetadataObject: { fieldName: 'Email' }
        });
        const cSection = makeConv({
            ID: 'C-SEC',
            AnchorType: 'Section',
            AnchorKey: 'systemMetadata',
            AnchorMetadataObject: { sectionKey: 'systemMetadata', anchorDisplayName: 'System Metadata' }
        });
        const cRecord = makeConv({
            ID: 'C-REC',
            AnchorType: 'Record',
            AnchorKey: null,
            AnchorMetadataObject: {}
        });

        const loadConvSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversations')
            .mockResolvedValue([cField, cSection, cRecord]);
        const loadDetailsSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversationDetails')
            .mockResolvedValue(new Map<string, MJConversationDetailEntity[]>());

        try {
            const coordinator = new FormRecordCommentsCoordinatorService();
            await coordinator.LoadForRecord(record, { CurrentUser: { ID: 'u1' } } as unknown as IMetadataProvider);

            const comp = Object.assign(Object.create(MjRecordCommentsComponent.prototype), {
                Coordinator: coordinator,
                Record: record,
                Mode: 'drawer' as const,
                IsPopoverExpanded: false,
                cdr: { markForCheck: vi.fn() }
            }) as MjRecordCommentsComponent;

            const groups = comp.GroupedVisibleThreads;
            expect(groups).toHaveLength(3);
            expect(groups[0].GroupTitle).toBe('Contact Info');
            expect(groups[1].GroupTitle).toBe('System Metadata');
            expect(groups[2].GroupTitle).toBe('General Record Comments');

            expect(comp.PopoverStyle.width).toBe('400px');
            comp.OnTogglePopoverExpand();
            expect(comp.IsPopoverExpanded).toBe(true);
            expect(comp.PopoverStyle.width).toBe('560px');
        } finally {
            loadConvSpy.mockRestore();
            loadDetailsSpy.mockRestore();
        }
    });

    it('persists drawer width to UserInfoEngine (MJ_CommentsPanel_Width) and emits WidthChanged', () => {
        const setSettingSpy = vi
            .spyOn(UserInfoEngine.Instance, 'SetSettingDebounced')
            .mockResolvedValue(undefined);
        const getSettingSpy = vi
            .spyOn(UserInfoEngine.Instance, 'GetSetting')
            .mockReturnValue('480');

        try {
            const emittedWidths: number[] = [];
            const comp = Object.assign(Object.create(MjRecordCommentsComponent.prototype), {
                Mode: 'drawer' as const,
                WidthPx: 380,
                WidthChanged: { emit: (w: number) => emittedWidths.push(w) },
                cdr: { markForCheck: vi.fn() }
            }) as unknown as MjRecordCommentsComponent;

            comp.PersistDrawerWidth(512);
            expect(comp.WidthPx).toBe(512);
            expect(comp.EffectiveDrawerWidthPx).toBe(512);
            expect(emittedWidths).toEqual([512]);
            expect(setSettingSpy).toHaveBeenCalledWith('MJ_CommentsPanel_Width', '512');
        } finally {
            setSettingSpy.mockRestore();
            getSettingSpy.mockRestore();
        }
    });

    it('computes per-type field badge counts, filters threads by type, resolves FieldSuggestionCardComponent UIDriverClass, and expands Discuss composer on demand', async () => {
        const entityInfo = makeEntityInfo();
        const record = makeRecord(entityInfo, true);
        const noteId = 'C0000000-0000-0000-0000-000000000010';
        const suggId = 'C0000000-0000-0000-0000-000000000020';

        const cNote = makeConv({
            ID: noteId,
            AnchorType: 'Field',
            AnchorKey: 'Email',
            AnchorMetadataObject: { fieldName: 'Email' }
        });
        const cSuggestion = makeConv({
            ID: suggId,
            AnchorType: 'Field',
            AnchorKey: 'Email',
            AnchorMetadataObject: { fieldName: 'Email' }
        });

        const suggestionEntity = {
            ID: suggId,
            AnchorKey: 'Email',
            SuggestedValue: 'updated@example.com',
            Confidence: 0.91,
            Source: 'Agent',
            Outcome: null
        } as unknown as MJFieldSuggestionEntity;

        const loadConvSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversations')
            .mockResolvedValue([cNote, cSuggestion]);
        const loadDetailsSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversationDetails')
            .mockResolvedValue(new Map<string, MJConversationDetailEntity[]>());
        const loadSubtypesSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredCommentsAndSuggestions')
            .mockResolvedValue({
                CommentsByConversationId: new Map<string, MJCommentEntity>(),
                SuggestionsByConversationId: new Map<string, MJFieldSuggestionEntity>([
                    [NormalizeUUID(suggId), suggestionEntity]
                ]),
                CommentTypeCodeByConversationId: new Map<string, string>([
                    [NormalizeUUID(noteId), COMMENT_TYPE_CODES.COMMENT],
                    [NormalizeUUID(suggId), COMMENT_TYPE_CODES.FIELD_SUGGESTION]
                ])
            });

        try {
            const coordinator = new FormRecordCommentsCoordinatorService();
            await coordinator.LoadForRecord(record, { CurrentUser: { ID: 'u1' } } as unknown as IMetadataProvider);

            // Per-type field badge counts
            expect(coordinator.GetFieldOpenCommentCount('Email')).toBe(2);
            expect(coordinator.GetFieldOpenNoteCount('Email')).toBe(1);
            expect(coordinator.GetFieldOpenSuggestionCount('Email')).toBe(1);
            expect(coordinator.GetFieldOpenCountByType('Email').get(COMMENT_TYPE_CODES.COMMENT)).toBe(1);
            expect(coordinator.GetFieldOpenCountByType('Email').get(COMMENT_TYPE_CODES.FIELD_SUGGESTION)).toBe(1);

            const comp = Object.assign(Object.create(MjRecordCommentsComponent.prototype), {
                Coordinator: coordinator,
                Record: record,
                Mode: 'drawer' as const,
                ReplyDraftByConversationId: new Map<string, string>(),
                ExpandedDiscussionIds: new Set<string>(),
                cdr: { markForCheck: vi.fn() }
            }) as unknown as MjRecordCommentsComponent;

            // AvailableTypeFilters shows All (2), Notes (1), Suggestions (1)
            const filters = comp.AvailableTypeFilters;
            expect(filters.find((f) => f.Code === 'all')?.Count).toBe(2);
            expect(filters.find((f) => f.Code === COMMENT_TYPE_CODES.COMMENT)?.Count).toBe(1);
            expect(filters.find((f) => f.Code === COMMENT_TYPE_CODES.FIELD_SUGGESTION)?.Count).toBe(1);

            // Filter by FIELD_SUGGESTION
            comp.OnTypeFilterChange(COMMENT_TYPE_CODES.FIELD_SUGGESTION);
            const suggestionThreads = comp.VisibleThreads;
            expect(suggestionThreads).toHaveLength(1);
            expect(suggestionThreads[0].IsFieldSuggestion).toBe(true);
            expect(suggestionThreads[0].UIDriverClass).toBe('FieldSuggestionCardComponent');
            expect(suggestionThreads[0].FieldSuggestion?.SuggestedValue).toBe('updated@example.com');
            // Reply composer stays tucked until Discuss is clicked on a message-less suggestion
            expect(suggestionThreads[0].ShowReplyComposer).toBe(false);

            comp.OnDiscussThread(suggId);
            expect(comp.VisibleThreads[0].ShowReplyComposer).toBe(true);

            // Filter by COMMENT
            comp.OnTypeFilterChange(COMMENT_TYPE_CODES.COMMENT);
            const noteThreads = comp.VisibleThreads;
            expect(noteThreads).toHaveLength(1);
            expect(noteThreads[0].IsFieldSuggestion).toBe(false);
            expect(noteThreads[0].UIDriverClass).toBeNull();
            expect(noteThreads[0].ShowReplyComposer).toBe(true);
        } finally {
            loadConvSpy.mockRestore();
            loadDetailsSpy.mockRestore();
            loadSubtypesSpy.mockRestore();
        }
    });

    it('accepts and rejects field suggestions through Coordinator, reloading the open record and broadcasting FormRecordRefreshCoordinator updates', async () => {
        const entityInfo = makeEntityInfo();
        const innerLoadSpy = vi.fn().mockResolvedValue(true);
        const record = Object.assign(makeRecord(entityInfo, true), {
            Dirty: false,
            InnerLoad: innerLoadSpy
        }) as unknown as BaseEntity;

        const suggId = 'C0000000-0000-0000-0000-000000000099';
        const acceptedSuggestion = {
            ID: suggId,
            AnchorKey: 'Email',
            SuggestedValue: 'accepted@example.com',
            Outcome: 'Accepted'
        } as unknown as MJFieldSuggestionEntity;
        const rejectedSuggestion = {
            ID: suggId,
            AnchorKey: 'Email',
            SuggestedValue: 'accepted@example.com',
            Outcome: 'Rejected'
        } as unknown as MJFieldSuggestionEntity;

        const acceptSpy = vi
            .spyOn(ConversationEngine.Instance, 'AcceptFieldSuggestion')
            .mockResolvedValue(acceptedSuggestion);
        const rejectSpy = vi
            .spyOn(ConversationEngine.Instance, 'RejectFieldSuggestion')
            .mockResolvedValue(rejectedSuggestion);
        const loadConvSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversations')
            .mockResolvedValue([]);
        const loadDetailsSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversationDetails')
            .mockResolvedValue(new Map());
        const loadSubtypesSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredCommentsAndSuggestions')
            .mockResolvedValue({
                CommentsByConversationId: new Map(),
                SuggestionsByConversationId: new Map(),
                CommentTypeCodeByConversationId: new Map()
            });

        try {
            const refreshCoordinator = new FormRecordRefreshCoordinator();
            const remoteUpdates: string[][] = [];
            refreshCoordinator.RemoteUpdated$.subscribe((evt) => {
                remoteUpdates.push(Array.from(evt.changedFieldNames));
            });

            const coordinator = new FormRecordCommentsCoordinatorService();
            coordinator.BindRefreshCoordinator(refreshCoordinator);
            const provider = { CurrentUser: { ID: 'u1', Name: 'Alice' } } as unknown as IMetadataProvider;
            coordinator.BindRecord(record, provider);

            const accepted = await coordinator.AcceptFieldSuggestion(suggId);
            expect(accepted?.Outcome).toBe('Accepted');
            expect(acceptSpy).toHaveBeenCalledOnce();
            expect(innerLoadSpy).toHaveBeenCalledOnce();
            expect(remoteUpdates).toHaveLength(1);
            expect(remoteUpdates[0]).toContain('Email');

            const rejected = await coordinator.RejectFieldSuggestion(suggId);
            expect(rejected?.Outcome).toBe('Rejected');
            expect(rejectSpy).toHaveBeenCalledOnce();
        } finally {
            acceptSpy.mockRestore();
            rejectSpy.mockRestore();
            loadConvSpy.mockRestore();
            loadDetailsSpy.mockRestore();
            loadSubtypesSpy.mockRestore();
        }
    });
});
