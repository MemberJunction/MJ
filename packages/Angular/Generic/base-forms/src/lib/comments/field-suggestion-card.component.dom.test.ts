import { Component } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { BaseEntity, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import {
    COMMENT_TYPE_CODES,
    ConversationEngine,
    MJCommentEntity,
    MJConversationDetailEntity,
    MJConversationEntity,
    MJFieldSuggestionEntity
} from '@memberjunction/core-entities';
import { NormalizeUUID, RegisterClass } from '@memberjunction/global';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { EntitySubtypeUIDriverBase } from '../subtype-ui-driver/entity-subtype-ui-driver';
import { MjRecordLinkDirective } from '../links/record-link.directive';
import { MjFormFieldComponent } from '../field/form-field.component';
import {
    CommentCardDriverContext,
    MjCommentCardDriverHostComponent
} from './comment-card-driver-host.component';
import { FieldSuggestionCardComponent } from './field-suggestion-card.component';
import { FormRecordCommentsCoordinatorService } from './form-record-comments-coordinator.service';
import { MjRecordCommentsComponent } from './record-comments.component';

const CUSTOM_COMMENT_DRIVER_KEY = 'ZZZ_TestCustomCommentCardDriver';

@RegisterClass(EntitySubtypeUIDriverBase, CUSTOM_COMMENT_DRIVER_KEY)
@Component({
    standalone: true,
    selector: 'test-custom-comment-card-driver',
    template: `<div class="custom-comment-driver-marker">Custom Comment Card ({{ Surface }})</div>`
})
class TestCustomCommentCardDriverComponent extends EntitySubtypeUIDriverBase {}

async function settleFixture(f: {
    changeDetectorRef: { markForCheck(): void };
    detectChanges(): void;
}): Promise<void> {
    f.changeDetectorRef.markForCheck();
    f.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    f.changeDetectorRef.markForCheck();
    f.detectChanges();
}

function makeTargetRecord(currentDueAt: string | null = '2026-11-15'): BaseEntity {
    const entityInfo = {
        ID: 'E0000000-0000-0000-0000-000000000011',
        Name: 'Tasks',
        DisplayNameOrName: 'Tasks',
        AllowRecordComments: true,
        AllowUpdateAPI: true,
        FieldLevelSecurityApplies: false,
        GetDeniedReadFields: () => new Set<string>(),
        IsFieldReadableByUser: () => true,
        IsFieldUpdatableByUser: () => true,
        CanUserComment: () => true,
        GetUserPermisions: () => ({ CanUpdate: true }),
        Fields: [
            { Name: 'ID', IsPrimaryKey: true, DisplayNameOrName: 'ID' },
            { Name: 'DueAt', IsPrimaryKey: false, DisplayNameOrName: 'Due Date', Category: 'Schedule' }
        ]
    } as unknown as EntityInfo;

    return {
        EntityInfo: entityInfo,
        IsSaved: true,
        Dirty: false,
        PrimaryKey: {
            Values: () => ['R0000000-0000-0000-0000-000000000011'],
            ToURLSegment: () => 'ID|R0000000-0000-0000-0000-000000000011',
            ToConcatenatedString: () => 'R0000000-0000-0000-0000-000000000011',
            KeyValuePairs: [{ FieldName: 'ID', Value: 'R0000000-0000-0000-0000-000000000011' }]
        },
        Fields: [
            { Name: 'ID', Value: 'R0000000-0000-0000-0000-000000000011' },
            { Name: 'DueAt', Value: currentDueAt }
        ]
    } as unknown as BaseEntity;
}

function makeSuggestion(overrides: Partial<MJFieldSuggestionEntity> = {}): MJFieldSuggestionEntity {
    return {
        ID: overrides.ID ?? 'F0000000-0000-0000-0000-000000000001',
        AnchorKey: overrides.AnchorKey ?? 'DueAt',
        SuggestedValue: overrides.SuggestedValue !== undefined ? overrides.SuggestedValue : '2026-12-01',
        Confidence: overrides.Confidence !== undefined ? overrides.Confidence : 0.88,
        Source: overrides.Source ?? 'Integration',
        Outcome: overrides.Outcome !== undefined ? overrides.Outcome : null
    } as unknown as MJFieldSuggestionEntity;
}

describe('FieldSuggestionCardComponent & Notes & suggestions panel (DOM)', () => {
    it('keeps custom comment card UI driver registered', () => {
        expect(TestCustomCommentCardDriverComponent).toBeDefined();
    });

    it('renders ghost value diff, provenance + confidence, and dispatches Accept, Reject, and Discuss on Pending suggestions', async () => {
        const targetRecord = makeTargetRecord('2026-11-15');
        const suggestion = makeSuggestion({
            ID: 'F0000000-0000-0000-0000-000000000001',
            SuggestedValue: '2026-12-01',
            Confidence: 0.88,
            Source: 'Integration',
            Outcome: null
        });

        const acceptSpy = vi.fn().mockResolvedValue(suggestion);
        const rejectSpy = vi.fn().mockResolvedValue(suggestion);
        const discussSpy = vi.fn();
        const errorSpy = vi.fn();

        const coordinatorStub = {
            AcceptFieldSuggestion: acceptSpy,
            RejectFieldSuggestion: rejectSpy
        } as unknown as FormRecordCommentsCoordinatorService;

        const driverContext: CommentCardDriverContext = {
            Coordinator: coordinatorStub,
            Conversation: { ID: suggestion.ID } as unknown as MJConversationEntity,
            AnchorBadgeLabel: 'Due Date',
            CurrentLiveValue: '2026-11-15',
            CanUserUpdateTargetField: true,
            CanUserDiscuss: true,
            OnDiscuss: discussSpy,
            OnError: errorSpy
        };

        const f = renderComponentFixture(FieldSuggestionCardComponent, {
            declarations: [FieldSuggestionCardComponent],
            inputs: {
                ChildRecord: suggestion,
                TargetRecord: targetRecord,
                Surface: 'comment-card',
                DriverContext: driverContext
            }
        });
        await settleFixture(f);

        const card = query(f, '.mj-field-suggestion-card');
        expect(card).toBeTruthy();
        expect(card?.textContent).toContain('Integration');
        expect(card?.textContent).toContain('88%');
        expect(card?.textContent).toContain('Pending');
        expect(card?.textContent).toContain('2026-11-15');
        expect(card?.textContent).toContain('2026-12-01');

        const acceptBtn = query<HTMLButtonElement>(f, '.mj-field-suggestion-card__btn--accept');
        const rejectBtn = query<HTMLButtonElement>(f, '.mj-field-suggestion-card__btn--reject');
        const discussBtn = query<HTMLButtonElement>(f, '.mj-field-suggestion-card__btn--discuss');
        expect(acceptBtn).toBeTruthy();
        expect(rejectBtn).toBeTruthy();
        expect(discussBtn).toBeTruthy();

        acceptBtn!.click();
        await settleFixture(f);
        expect(acceptSpy).toHaveBeenCalledWith('F0000000-0000-0000-0000-000000000001');

        rejectBtn!.click();
        await settleFixture(f);
        expect(rejectSpy).toHaveBeenCalledWith('F0000000-0000-0000-0000-000000000001');

        discussBtn!.click();
        expect(discussSpy).toHaveBeenCalledOnce();
    });

    it('hides action buttons once Outcome is Accepted/Rejected/Superseded', async () => {
        const targetRecord = makeTargetRecord('2026-12-01');
        const acceptedSuggestion = makeSuggestion({
            Outcome: 'Accepted',
            SuggestedValue: '2026-12-01'
        });

        const fAccepted = renderComponentFixture(FieldSuggestionCardComponent, {
            declarations: [FieldSuggestionCardComponent],
            inputs: {
                ChildRecord: acceptedSuggestion,
                TargetRecord: targetRecord,
                Surface: 'comment-card'
            }
        });
        await settleFixture(fAccepted);

        expect(query(fAccepted, '.mj-field-suggestion-card__outcome-pill--accepted')?.textContent?.trim()).toBe(
            'Accepted'
        );
        expect(query(fAccepted, '.mj-field-suggestion-card__actions')).toBeNull();
    });

    it('disables Accept/Reject while keeping Discuss enabled when user lacks field update permission', async () => {
        const targetRecord = makeTargetRecord('2026-11-15');
        const pendingSuggestion = makeSuggestion({ Outcome: null });
        const fReadOnly = renderComponentFixture(FieldSuggestionCardComponent, {
            declarations: [FieldSuggestionCardComponent],
            inputs: {
                ChildRecord: pendingSuggestion,
                TargetRecord: targetRecord,
                Surface: 'comment-card',
                DriverContext: {
                    Coordinator: null,
                    Conversation: { ID: pendingSuggestion.ID } as unknown as MJConversationEntity,
                    AnchorBadgeLabel: 'Due Date',
                    CurrentLiveValue: '2026-11-15',
                    CanUserUpdateTargetField: false,
                    CanUserDiscuss: true,
                    OnDiscuss: vi.fn(),
                    OnError: vi.fn()
                } satisfies CommentCardDriverContext
            }
        });
        await settleFixture(fReadOnly);

        const acceptBtn = query<HTMLButtonElement>(fReadOnly, '.mj-field-suggestion-card__btn--accept');
        const rejectBtn = query<HTMLButtonElement>(fReadOnly, '.mj-field-suggestion-card__btn--reject');
        const discussBtn = query<HTMLButtonElement>(fReadOnly, '.mj-field-suggestion-card__btn--discuss');
        expect(acceptBtn?.disabled).toBe(true);
        expect(rejectBtn?.disabled).toBe(true);
        expect(discussBtn?.disabled).toBe(false);
    });

    it('dynamically mounts custom registered EntitySubtypeUIDriverBase components via MjCommentCardDriverHostComponent', async () => {
        const f = renderComponentFixture(MjCommentCardDriverHostComponent, {
            imports: [TestCustomCommentCardDriverComponent],
            declarations: [MjCommentCardDriverHostComponent],
            inputs: {
                UIDriverKey: CUSTOM_COMMENT_DRIVER_KEY,
                TargetRecord: makeTargetRecord()
            }
        });
        await settleFixture(f);

        const marker = query(f, '.custom-comment-driver-marker');
        expect(marker).toBeTruthy();
        expect(marker?.textContent).toContain('Custom Comment Card (comment-card)');
    });

    it('renders "Notes & suggestions" drawer with type filter pills, plain notes alongside FieldSuggestionCardComponent, and reveals reply composer on Discuss', async () => {
        const record = makeTargetRecord('2026-11-15');
        const noteId = 'C0000000-0000-0000-0000-000000000101';
        const suggId = 'C0000000-0000-0000-0000-000000000102';

        const cNote = {
            ID: noteId,
            Name: 'Schedule Note',
            AnchorType: 'Field',
            AnchorKey: 'DueAt',
            AnchorMetadataObject: { fieldName: 'DueAt' },
            IsResolved: false
        } as unknown as MJConversationEntity;
        const cSugg = {
            ID: suggId,
            Name: 'Due Date Suggestion',
            AnchorType: 'Field',
            AnchorKey: 'DueAt',
            AnchorMetadataObject: { fieldName: 'DueAt' },
            IsResolved: false
        } as unknown as MJConversationEntity;

        const noteDetail = {
            ID: 'D0000000-0000-0000-0000-000000000201',
            ConversationID: noteId,
            Role: 'User',
            User: 'Alice',
            Message: 'Double-check client milestone date.'
        } as unknown as MJConversationDetailEntity;

        const suggestionEntity = makeSuggestion({
            ID: suggId,
            AnchorKey: 'DueAt',
            SuggestedValue: '2026-12-05',
            Confidence: 0.94,
            Source: 'Agent',
            Outcome: null
        });

        const loadConvSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversations')
            .mockResolvedValue([cNote, cSugg]);
        const loadDetailsSpy = vi
            .spyOn(ConversationEngine.Instance, 'LoadAnchoredConversationDetails')
            .mockResolvedValue(
                new Map<string, MJConversationDetailEntity[]>([[NormalizeUUID(noteId), [noteDetail]]])
            );
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
            const provider = { CurrentUser: { ID: 'u1', Name: 'Alice' } } as unknown as IMetadataProvider;
            const coordinator = new FormRecordCommentsCoordinatorService();
            await coordinator.LoadForRecord(record, provider);

            const f = renderComponentFixture(MjRecordCommentsComponent, {
                declarations: [
                    MjRecordCommentsComponent,
                    MjCommentCardDriverHostComponent,
                    FieldSuggestionCardComponent,
                    MjRecordLinkDirective
                ],
                providers: [{ provide: FormRecordCommentsCoordinatorService, useValue: coordinator }],
                inputs: {
                    Provider: provider,
                    Record: record,
                    Mode: 'drawer',
                    IsOpen: true
                }
            });
            await settleFixture(f);

            expect(query(f, '.mj-record-comments__title')?.textContent?.trim()).toBe('Notes & suggestions');

            const typePills = queryAll<HTMLButtonElement>(f, '.mj-record-comments__type-pill');
            expect(typePills.length).toBeGreaterThanOrEqual(3);
            expect(
                typePills.map((p) => {
                    const spans = Array.from(p.querySelectorAll('span'));
                    return spans.map((s) => s.textContent?.trim()).join(':');
                })
            ).toEqual(['All:2', 'Notes:1', 'Suggestions:1']);

            // Both the plain note and the FieldSuggestionCardComponent render under 'All'
            expect(queryAll(f, '.mj-record-comments__thread')).toHaveLength(2);
            expect(queryAll(f, '.mj-field-suggestion-card')).toHaveLength(1);

            // Suggestion thread initially hides its reply textarea until Discuss is clicked
            expect(query(f, `[id="mj-reply-${suggId}"]`)).toBeNull();
            const discussBtn = query<HTMLButtonElement>(f, '.mj-field-suggestion-card__btn--discuss');
            expect(discussBtn).toBeTruthy();
            discussBtn!.click();
            await settleFixture(f);
            expect(query(f, `[id="mj-reply-${suggId}"]`)).toBeTruthy();

            // Clicking 'Suggestions' filter pill filters to only the suggestion card
            typePills[2].click();
            await settleFixture(f);
            expect(queryAll(f, '.mj-record-comments__thread')).toHaveLength(1);
            expect(queryAll(f, '.mj-field-suggestion-card')).toHaveLength(1);

            // Clicking 'Notes' filter pill filters to only the plain note
            typePills[1].click();
            await settleFixture(f);
            expect(queryAll(f, '.mj-record-comments__thread')).toHaveLength(1);
            expect(queryAll(f, '.mj-field-suggestion-card')).toHaveLength(0);

            // MjFormFieldComponent exposes distinct note and suggestion counts from Coordinator
            const fieldInstance = Object.assign(Object.create(MjFormFieldComponent.prototype), {
                commentsCoordinator: coordinator,
                FieldName: 'DueAt'
            }) as unknown as MjFormFieldComponent;
            expect(fieldInstance.FieldOpenCommentCount).toBe(2);
            expect(fieldInstance.FieldOpenNoteCount).toBe(1);
            expect(fieldInstance.FieldOpenSuggestionCount).toBe(1);
        } finally {
            loadConvSpy.mockRestore();
            loadDetailsSpy.mockRestore();
            loadSubtypesSpy.mockRestore();
        }
    });
});
