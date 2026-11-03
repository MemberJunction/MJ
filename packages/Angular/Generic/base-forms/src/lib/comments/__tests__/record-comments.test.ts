import { describe, expect, it, vi } from 'vitest';
import { BaseEntity, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ConversationEngine,
    MJConversationDetailEntity,
    MJConversationEntity
} from '@memberjunction/core-entities';
import { FormRecordCommentsCoordinatorService } from '../form-record-comments-coordinator.service';
import { MjRecordCommentsComponent } from '../record-comments.component';
import { RecordCommentsToolbarAction } from '../../toolbar/actions/record-comments-toolbar-action';
import { FormToolbarActionLifecycleContext } from '../../toolbar/base-form-toolbar-action';

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
});
