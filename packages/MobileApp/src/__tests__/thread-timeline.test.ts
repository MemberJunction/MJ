import { describe, expect, it } from 'vitest';
import { BuildThreadTimeline } from '@/data/adapt';
import { BuildRealtimeSessionCardView } from '@/chat/realtime/session-card-view';
import type { ConversationDetailLoad, ConversationMessage } from '@/data/services/conversations';
import type { RealtimeSessionTimelineGroup, RealtimeSessionTimelineMeta } from '@memberjunction/conversations-runtime';

/**
 * Voice turns must not render as ordinary chat bubbles.
 *
 * Every turn of a live call is persisted as a normal `MJ: Conversation Detail` stamped with its
 * `AgentSessionID`. This screen used to map the flat message list, so a long call buried the typed
 * conversation around it — the exact failure the shared grouping module's header describes.
 */

let seq = 0;

type DetailShape = {
    ID: string;
    Role: 'User' | 'AI' | 'Error';
    Message?: string | null;
    AgentSessionID?: string | null;
    HiddenToUser?: boolean;
    AgentID?: string | null;
    Status?: 'Complete' | 'In-Progress' | 'Error' | null;
    SuggestedResponses?: string | null;
    CompletionTime?: number | null;
    Error?: string | null;
    __mj_CreatedAt?: Date | null;
};

function message(over: Partial<DetailShape> = {}, agentName: string | null = null): ConversationMessage {
    seq++;
    const detail: DetailShape = {
        ID: `D-${seq}`,
        Role: 'User',
        Message: `msg ${seq}`,
        AgentSessionID: null,
        HiddenToUser: false,
        AgentID: null,
        Status: 'Complete',
        __mj_CreatedAt: new Date(2026, 8, 14, 9, seq),
        ...over,
    };
    return { detail: detail as unknown as ConversationMessage['detail'], agentName };
}

function load(messages: ConversationMessage[], sessionMeta = new Map<string, RealtimeSessionTimelineMeta>()): ConversationDetailLoad {
    return {
        conversation: { ID: 'C-1', Name: 'Chat' } as unknown as ConversationDetailLoad['conversation'],
        messages,
        artifacts: [],
        sessionMeta,
    };
}

describe('BuildThreadTimeline', () => {
    it('passes ordinary messages through in order', () => {
        const items = BuildThreadTimeline(load([message({ Message: 'first' }), message({ Message: 'second' })]));
        expect(items.map((i) => i.kind)).toEqual(['message', 'message']);
    });

    it('collapses a whole session into ONE element at its first turn', () => {
        const S = 'AAAAAAAA-1111-2222-3333-444444444444';
        const items = BuildThreadTimeline(load([
            message({ Message: 'before' }),
            message({ Message: 'hello', AgentSessionID: S }),
            message({ Message: 'hi there', Role: 'AI', AgentSessionID: S }),
            message({ Message: 'and more', AgentSessionID: S }),
            message({ Message: 'after' }),
        ]));
        expect(items.map((i) => i.kind)).toEqual(['message', 'session', 'message']);
        const session = items[1];
        if (session.kind !== 'session') throw new Error('expected a session item');
        expect(session.group.TurnCount).toBe(3);
    });

    it('expands to exactly the turns it counted', () => {
        // A list whose length disagrees with the "N turns" printed above it reads as a bug, so both
        // come from the runtime's own visible-turn rule.
        const S = 'AAAAAAAA-1111-2222-3333-444444444444';
        const items = BuildThreadTimeline(load([
            message({ Message: 'spoken', AgentSessionID: S }),
            message({ Message: '', AgentSessionID: S }),                       // empty — not a turn
            message({ Message: 'anchor', AgentSessionID: S, HiddenToUser: true }), // hidden — not a turn
            message({ Message: 'replied', Role: 'AI', AgentSessionID: S }),
        ]));
        const session = items[0];
        if (session.kind !== 'session') throw new Error('expected a session item');
        expect(session.turns).toHaveLength(session.group.TurnCount);
        expect(session.turns).toHaveLength(2);
    });

    it('matches session meta whatever case the database returned the id in', () => {
        // SQL Server returns uppercase ids and PostgreSQL lowercase; a case-sensitive match would
        // silently drop every status chip on one of the two.
        const S = 'AAAAAAAA-1111-2222-3333-444444444444';
        const meta = new Map<string, RealtimeSessionTimelineMeta>([
            [S.toLowerCase(), { SessionID: S, AgentName: 'Sage', Status: 'Closed', CloseReason: 'Explicit', ClosedAt: null }],
        ]);
        const items = BuildThreadTimeline(load([message({ Message: 'spoken', AgentSessionID: S })], meta));
        const session = items[0];
        if (session.kind !== 'session') throw new Error('expected a session item');
        expect(session.meta?.AgentName).toBe('Sage');
    });

    it('keeps two different sessions as two separate elements', () => {
        const items = BuildThreadTimeline(load([
            message({ Message: 'a', AgentSessionID: 'S-1' }),
            message({ Message: 'b', AgentSessionID: 'S-2' }),
        ]));
        expect(items.map((i) => i.kind)).toEqual(['session', 'session']);
    });
});

/**
 * What the collapsed card displays.
 *
 * Asserted through `BuildRealtimeSessionCardView` rather than a rendered tree: this package keeps
 * no React renderer in its test setup, and the decisions are the part worth pinning anyway — every
 * one of them comes from the shared runtime, so a divergence between this card and the web's shows
 * up right here.
 */
describe('BuildRealtimeSessionCardView', () => {
    const group = (o: Partial<RealtimeSessionTimelineGroup> = {}): RealtimeSessionTimelineGroup => ({
        SessionID: 'S-1',
        StartedAt: new Date(2026, 8, 14, 9, 0),
        EndedAt: new Date(2026, 8, 14, 9, 40),
        TurnCount: 2,
        DetailCount: 2,
        LastTurnRole: 'Assistant',
        LastTurnPreview: 'I pulled that up for you.',
        ...o,
    });

    const meta = (o: Partial<RealtimeSessionTimelineMeta> = {}): RealtimeSessionTimelineMeta => ({
        SessionID: 'S-1', AgentName: null, Status: null, CloseReason: null, ClosedAt: null, ...o,
    });

    it('names the agent and humanizes the close reason', () => {
        const view = BuildRealtimeSessionCardView(group(), meta({ AgentName: 'Sage', Status: 'Closed', CloseReason: 'Janitor' }), 2, 'You');
        expect(view.Title).toBe('Realtime session · Sage');
        expect(view.Chip).toEqual({ Label: 'Timed out', Tone: 'neutral' });
    });

    it('shows no chip at all when the session row could not be read', () => {
        // Deliberate: an unreadable status says nothing rather than guessing "Closed".
        expect(BuildRealtimeSessionCardView(group(), null, 2, 'You').Chip).toBeNull();
    });

    it('prints a same-day range once, with only the time on the right', () => {
        const view = BuildRealtimeSessionCardView(group(), null, 2, 'You');
        expect(view.Range).toContain('→');
        expect(view.Range?.match(/Sep 14/g) ?? []).toHaveLength(1);
        expect(view.MetaLine).toContain('2 turns');
    });

    it('repeats the date when the session crosses midnight', () => {
        const view = BuildRealtimeSessionCardView(
            group({ StartedAt: new Date(2026, 8, 14, 23, 50), EndedAt: new Date(2026, 8, 15, 0, 10) }), null, 2, 'You');
        expect(view.Range?.match(/Sep 1[45]/g) ?? []).toHaveLength(2);
    });

    it('drops the range entirely rather than printing a half one', () => {
        const view = BuildRealtimeSessionCardView(group({ StartedAt: null, EndedAt: null }), null, 0, 'You');
        expect(view.Range).toBeNull();
        expect(view.MetaLine).toBe('2 turns');
    });

    it('singularizes a one-turn session', () => {
        expect(BuildRealtimeSessionCardView(group({ TurnCount: 1 }), null, 1, 'You').TurnLabel).toBe('1 turn');
    });

    it('names the user on their own last turn', () => {
        const view = BuildRealtimeSessionCardView(group({ LastTurnRole: 'User' }), null, 2, 'Amith');
        expect(view.Preview?.Role).toBe('Amith');
    });

    it('labels an agent turn generically, as the web card does', () => {
        expect(BuildRealtimeSessionCardView(group(), null, 2, 'Amith').Preview?.Role).toBe('Agent');
    });

    it('does not offer to expand a session with no visible turns', () => {
        // A card that opens onto an empty panel is worse than one that plainly does not open.
        expect(BuildRealtimeSessionCardView(group({ TurnCount: 0, LastTurnPreview: null }), null, 0, 'You').CanExpand).toBe(false);
        expect(BuildRealtimeSessionCardView(group(), null, 2, 'You').CanExpand).toBe(true);
    });
});
