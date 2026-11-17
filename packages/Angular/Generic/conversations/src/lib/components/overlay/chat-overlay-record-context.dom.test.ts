import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '@angular/core';
import { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';
import {
    ChatAgentsOverlayComponent,
    type OverlayAppContext,
    type OverlayConversationSwitchedEvent,
} from './chat-overlay.component';

function createOverlayWithContext(appContext: OverlayAppContext | null): ChatAgentsOverlayComponent {
    const instance = Object.create(ChatAgentsOverlayComponent.prototype) as ChatAgentsOverlayComponent;
    instance.AppContext = appContext;
    return instance;
}

describe('ChatAgentsOverlayComponent.ActiveRecordContext', () => {
    it('returns null when AppContext or AdditionalContext.Form is absent', () => {
        expect(createOverlayWithContext(null).ActiveRecordContext).toBeNull();
        expect(createOverlayWithContext({}).ActiveRecordContext).toBeNull();
        expect(createOverlayWithContext({ AdditionalContext: {} }).ActiveRecordContext).toBeNull();
    });

    it('extracts entity, display name, dirty/conflict/time-travel flags, and link counts from AdditionalContext.Form', () => {
        const overlay = createOverlayWithContext({
            AdditionalContext: {
                Form: {
                    Entity: 'Contracts',
                    RecordPrimaryKey: 'ID|C-101',
                    RecordState: {
                        RecordDisplayName: 'Enterprise MSA — Acme Corp',
                        EditMode: true,
                        Dirty: true,
                        DirtyFieldNames: ['Status', 'TotalValue'],
                        HasExternalUpdateConflict: true,
                        PreviewingHistoricalChangeID: 'chg-77'
                    },
                    Links: {
                        TotalCount: 6,
                        OutgoingCount: 2,
                        IncomingCount: 4
                    }
                }
            }
        });

        expect(overlay.ActiveRecordContext).toEqual({
            Entity: 'Contracts',
            RecordPrimaryKey: 'ID|C-101',
            RecordDisplayName: 'Enterprise MSA — Acme Corp',
            EditMode: true,
            Dirty: true,
            DirtyFieldNames: ['Status', 'TotalValue'],
            HasExternalUpdateConflict: true,
            PreviewingHistoricalChangeID: 'chg-77',
            TotalLinksCount: 6,
            OutgoingLinksCount: 2,
            IncomingLinksCount: 4
        });
    });

    it('resolves ActiveRecordEntityId and ActiveLinkedRecordId and keeps record-bound conversations off the global workspace bridge', () => {
        const setActiveSpy = vi.fn();
        const overlay = Object.assign(
            createOverlayWithContext({
                AdditionalContext: {
                    Form: {
                        Entity: 'Contracts',
                        RecordPrimaryKey: 'ID|C-101'
                    }
                }
            }),
            {
                Provider: {
                    Entities: [{ ID: 'E-CONTRACTS-1', Name: 'Contracts' }] as EntityInfo[],
                } as Partial<IMetadataProvider> as IMetadataProvider,
                RecordConversations: [] as MJConversationEntity[],
                ConversationSwitched: new EventEmitter<OverlayConversationSwitchedEvent>(),
                bridge: {
                    SetActiveFromOverlay: setActiveSpy
                }
            }
        ) as ChatAgentsOverlayComponent;

        expect(overlay.ActiveRecordEntityId).toBe('E-CONTRACTS-1');
        expect(overlay.ActiveLinkedRecordId).toBe('C-101');

        const recordConvo = {
            ID: 'CONV-REC-1',
            Name: 'Contract Review',
            LinkedEntityID: 'E-CONTRACTS-1',
            LinkedRecordID: 'C-101'
        } as Partial<MJConversationEntity> as MJConversationEntity;

        overlay.OnConversationCreated({
            conversation: recordConvo,
            pendingMessage: 'Summarize this contract'
        });

        expect(overlay.ConversationId).toBe('CONV-REC-1');
        expect(overlay.RecordConversations).toHaveLength(1);
        // Record-bound chats must NOT be published to the global workspace bridge
        expect(setActiveSpy).toHaveBeenCalledWith(null);
    });

    it('pins ArtifactAiConversationId to the active artifact chat conversation and ignores replies from other conversations (P1-11)', () => {
        const overlay = Object.create(ChatAgentsOverlayComponent.prototype) as ChatAgentsOverlayComponent;
        Object.assign(overlay as object, {
            State: 'collapsed',
            UnreadCount: 0,
            VisibilityChanged: new EventEmitter(),
            RecordConversations: [] as MJConversationEntity[],
            ConversationSwitched: new EventEmitter<OverlayConversationSwitchedEvent>(),
            bridge: { SetActiveFromOverlay: vi.fn() },
            cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
            Expand: () => {
                overlay.State = 'expanded';
            },
        });

        overlay.HandleArtifactAiRequest({
            ArtifactID: 'art-pin-1',
            ArtifactTitle: 'Pinned Spec',
            ArtifactKind: 'doc',
            ContextLabel: 'Intro',
            SelectedContent: 'Old intro',
            InitialPrompt: 'Refine intro',
            SuggestingModeDefault: true,
            ApplySuggestion: vi.fn(),
        });

        // Bind to CONV-PINNED-1 when conversation is created
        overlay.OnConversationCreated({
            conversation: { ID: 'CONV-PINNED-1', Name: 'Artifact AI' } as MJConversationEntity,
            pendingMessage: 'Refine intro',
        });
        expect(overlay.ArtifactAiConversationId).toBe('CONV-PINNED-1');

        // Unrelated background conversation reply must NOT overwrite ArtifactAiLatestProposal
        overlay.OnAgentMessageReceived({
            message: {
                ConversationID: 'CONV-OTHER-999',
                Message: 'Wrong thread message!',
            } as Partial<MJConversationDetailEntity> as MJConversationDetailEntity,
        });
        expect(overlay.ArtifactAiLatestProposal).toBe('');

        // Matching conversation reply updates proposal
        overlay.OnAgentMessageReceived({
            message: {
                ConversationID: 'CONV-PINNED-1',
                Message: 'Clean refined intro.',
            } as Partial<MJConversationDetailEntity> as MJConversationDetailEntity,
        });
        expect(overlay.ArtifactAiLatestProposal).toBe('Clean refined intro.');
    });
});
