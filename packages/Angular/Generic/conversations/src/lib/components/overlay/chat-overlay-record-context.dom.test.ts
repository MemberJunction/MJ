import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '@angular/core';
import { IMetadataProvider } from '@memberjunction/core';
import { MJConversationEntity } from '@memberjunction/core-entities';
import { ChatAgentsOverlayComponent, OverlayConversationSwitchedEvent } from './chat-overlay.component';

function createOverlayWithContext(appContext: Record<string, unknown> | null): ChatAgentsOverlayComponent {
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
                    Entities: [{ ID: 'E-CONTRACTS-1', Name: 'Contracts' }]
                } as unknown as IMetadataProvider,
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
        } as unknown as MJConversationEntity;

        overlay.OnConversationCreated({
            conversation: recordConvo,
            pendingMessage: 'Summarize this contract'
        });

        expect(overlay.ConversationId).toBe('CONV-REC-1');
        expect(overlay.RecordConversations).toHaveLength(1);
        // Record-bound chats must NOT be published to the global workspace bridge
        expect(setActiveSpy).toHaveBeenCalledWith(null);
    });
});
