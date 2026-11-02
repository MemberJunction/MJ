import { describe, it, expect } from 'vitest';
import { ChatAgentsOverlayComponent } from './chat-overlay.component';

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
});
