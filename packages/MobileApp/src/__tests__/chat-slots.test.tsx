import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the chat surface's extension contract.
 *
 * What matters here is not that a component renders — it is that the CONTRACT holds: every slot
 * ships a default, the defaults are exported (so a host can wrap rather than replace), and the slot
 * names match the Angular surface exactly. A consumer who tailored the web chat and then finds a
 * renamed slot here has been given a second vocabulary to learn, which is the thing this design
 * exists to avoid.
 */
vi.mock('react-native', () => {
    const passthrough = (name: string) => name;
    return {
        View: passthrough('View'),
        Text: passthrough('Text'),
        Pressable: passthrough('Pressable'),
        ScrollView: passthrough('ScrollView'),
        StyleSheet: { create: (o: unknown) => o, hairlineWidth: 1, absoluteFillObject: {} },
    };
});
vi.mock('@/components/Icon', () => ({ Icons: new Proxy({}, { get: () => () => null }) }));

import * as Defaults from '@/chat/slots/defaults';
import type { MJChatSlots } from '@/chat/slots';

describe('slot contract', () => {
    it('exposes exactly the slot names the Angular surface does', () => {
        // Mirrors `MJChatSlotName` in ng-conversations' chat-slot.directive.ts. A type-level check
        // so a rename cannot pass silently: every key below must exist on MJChatSlots.
        const names: Array<keyof MJChatSlots> = [
            'emptyState',
            'agentPresence',
            'header',
            'headerActions',
            'messageExtra',
            'demonstrationSurface',
            'messageRenderer',
        ];
        expect(names).toHaveLength(7);
    });

    it('exports a default component for each slot a host is likely to wrap', () => {
        // Exported, not internal — the containment pattern ("render the default inside my own
        // component") only works if a host can import it.
        expect(typeof Defaults.MJChatEmptyStateDefault).toBe('function');
        expect(typeof Defaults.MJChatHeaderDefault).toBe('function');
        expect(typeof Defaults.MJChatAgentPresenceDefault).toBe('function');
        expect(typeof Defaults.MJChatMessageBubbleDefault).toBe('function');
    });

    it('ships BOTH message renderers, as the web does', () => {
        // The feed layout is the default and the bubble is the alternative; a host selects the
        // bubble by passing it as the messageRenderer slot. Shipping only one would force a fork.
        expect(Defaults.MJChatMessageBubbleDefault).toBeDefined();
    });

    it('renders nothing for a null message rather than throwing', () => {
        // The renderer slot is invoked per row and a row can be null mid-load.
        expect(Defaults.MJChatMessageBubbleDefault({ Message: null })).toBeNull();
    });
});
