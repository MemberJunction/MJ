import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
    MJInteractionEntity,
    MJInteractionEventEntity,
    MJInteractionLinkEntity,
} from '@memberjunction/core-entities';
import {
    CalculateInteractionCost,
    DEFAULT_COST_PER_MINUTE,
    InteractionLifecycleService,
} from '../telephony/interactionLifecycle.js';

const USER = { ID: 'user-1' } as unknown as UserInfo;

function createMockProvider() {
    const savedInteractions: MJInteractionEntity[] = [];
    const savedEvents: MJInteractionEventEntity[] = [];
    const savedLinks: MJInteractionLinkEntity[] = [];

    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: Interactions') {
                const row = {
                    ID: `int-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    Channel: 'Phone',
                    Direction: 'Inbound',
                    Status: 'Active',
                    DurationSeconds: null,
                    CostEstimate: null,
                    Load: vi.fn(async () => true),
                    Save: vi.fn(async () => {
                        savedInteractions.push(row as unknown as MJInteractionEntity);
                        return true;
                    }),
                } as unknown as MJInteractionEntity;
                return row;
            }
            if (entityName === 'MJ: Interaction Events') {
                const row = {
                    ID: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    InteractionID: '',
                    EventType: 'Created',
                    Load: vi.fn(async () => true),
                    Save: vi.fn(async () => {
                        savedEvents.push(row as unknown as MJInteractionEventEntity);
                        return true;
                    }),
                } as unknown as MJInteractionEventEntity;
                return row;
            }
            if (entityName === 'MJ: Interaction Links') {
                const row = {
                    ID: `lnk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    InteractionID: '',
                    EntityID: '',
                    RecordID: '',
                    Role: 'Caller',
                    Load: vi.fn(async () => true),
                    Save: vi.fn(async () => {
                        savedLinks.push(row as unknown as MJInteractionLinkEntity);
                        return true;
                    }),
                } as unknown as MJInteractionLinkEntity;
                return row;
            }
            throw new Error(`Unexpected entity ${entityName}`);
        }),
    } as unknown as IMetadataProvider;

    return { provider, savedInteractions, savedEvents, savedLinks };
}

describe('InteractionLifecycleService', () => {
    let lifecycle: InteractionLifecycleService;

    beforeEach(() => {
        lifecycle = InteractionLifecycleService.Instance;
    });

    describe('CalculateInteractionCost', () => {
        it('returns 0 for non-positive duration or rate', () => {
            expect(CalculateInteractionCost(0)).toBe(0);
            expect(CalculateInteractionCost(-10)).toBe(0);
            expect(CalculateInteractionCost(120, 0)).toBe(0);
            expect(CalculateInteractionCost(120, -0.01)).toBe(0);
        });

        it('computes expected cost for default and custom rates', () => {
            // 60 seconds = 1 minute * 0.015 = 0.015
            expect(CalculateInteractionCost(60)).toBe(0.015);
            // 180 seconds = 3 minutes * 0.02 = 0.06
            expect(CalculateInteractionCost(180, 0.02)).toBe(0.06);
            // 30 seconds = 0.5 minute * 0.015 = 0.0075
            expect(CalculateInteractionCost(30)).toBe(0.0075);
        });
    });

    describe('CreateInteraction', () => {
        it('creates an active interaction and writes Created and Answered events', async () => {
            const { provider, savedInteractions, savedEvents } = createMockProvider();
            const startedAt = new Date('2026-10-01T12:00:00Z');

            const interaction = await lifecycle.CreateInteraction({
                Channel: 'Phone',
                Direction: 'Inbound',
                PhoneNumberID: 'phone-1',
                RemoteAddress: '+14155550123',
                ExternalID: 'CA_123',
                RoomName: 'room-call-1',
                StartedAt: startedAt,
                ContextUser: USER,
                MetadataProvider: provider,
            });

            expect(interaction).not.toBeNull();
            expect(savedInteractions.length).toBe(1);
            expect(savedInteractions[0].Channel).toBe('Phone');
            expect(savedInteractions[0].Direction).toBe('Inbound');
            expect(savedInteractions[0].Status).toBe('Active');
            expect(savedInteractions[0].AnsweredAt).toEqual(startedAt);

            // Expect Created and Answered events
            expect(savedEvents.length).toBe(2);
            expect(savedEvents[0].EventType).toBe('Created');
            expect(savedEvents[1].EventType).toBe('Answered');

            // Room memory association
            expect(lifecycle.GetRoomInteractionID('room-call-1')).toBe(interaction?.ID);
        });

        it('supports room memory lookup and clearing', () => {
            lifecycle.RememberRoomInteraction('room-xyz', 'int-xyz');
            expect(lifecycle.GetRoomInteractionID('room-xyz')).toBe('int-xyz');
            lifecycle.ForgetRoomInteraction('room-xyz');
            expect(lifecycle.GetRoomInteractionID('room-xyz')).toBeUndefined();
        });
    });

    describe('RecordEvent', () => {
        it('appends an event row with JSON details', async () => {
            const { provider, savedEvents } = createMockProvider();
            const event = await lifecycle.RecordEvent({
                InteractionID: 'int-123',
                EventType: 'Offered',
                Details: { TargetUserID: 'user-2', Priority: 'High' },
                ContextUser: USER,
                MetadataProvider: provider,
            });

            expect(event).not.toBeNull();
            expect(savedEvents.length).toBe(1);
            expect(savedEvents[0].InteractionID).toBe('int-123');
            expect(savedEvents[0].EventType).toBe('Offered');
            expect(savedEvents[0].Details).toBe(JSON.stringify({ TargetUserID: 'user-2', Priority: 'High' }));
        });

        it('returns null if InteractionID is missing', async () => {
            const { provider } = createMockProvider();
            const event = await lifecycle.RecordEvent({
                InteractionID: '',
                EventType: 'Created',
                ContextUser: USER,
                MetadataProvider: provider,
            });
            expect(event).toBeNull();
        });
    });

    describe('CreateLink', () => {
        it('creates an interaction link row', async () => {
            const { provider, savedLinks } = createMockProvider();
            const link = await lifecycle.CreateLink({
                InteractionID: 'int-123',
                EntityID: 'ent-person',
                RecordID: 'rec-456',
                Role: 'Caller',
                Notes: 'Verified caller',
                ContextUser: USER,
                MetadataProvider: provider,
            });

            expect(link).not.toBeNull();
            expect(savedLinks.length).toBe(1);
            expect(savedLinks[0].InteractionID).toBe('int-123');
            expect(savedLinks[0].Role).toBe('Caller');
            expect(savedLinks[0].RecordID).toBe('rec-456');
        });
    });

    describe('CloseInteraction', () => {
        it('calculates duration and cost estimate on closing an interaction', async () => {
            const { provider, savedInteractions, savedEvents } = createMockProvider();
            const startedAt = new Date('2026-10-01T12:00:00Z');
            const endedAt = new Date('2026-10-01T12:02:30Z'); // 150 seconds

            // Setup mock interaction to be returned when loaded
            const mockRow = {
                ID: 'int-close-1',
                Channel: 'Phone',
                Direction: 'Inbound',
                Status: 'Active',
                StartedAt: startedAt,
                AnsweredAt: startedAt,
                EndedAt: null,
                DurationSeconds: null,
                CostEstimate: null,
                Load: vi.fn(async () => true),
                Save: vi.fn(async () => {
                    savedInteractions.push(mockRow as unknown as MJInteractionEntity);
                    return true;
                }),
            } as unknown as MJInteractionEntity;

            (provider.GetEntityObject as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRow);

            const closed = await lifecycle.CloseInteraction({
                InteractionID: 'int-close-1',
                EndedAt: endedAt,
                EndReason: 'Completed',
                CostPerMinute: 0.02,
                ContextUser: USER,
                MetadataProvider: provider,
            });

            expect(closed).toBe(true);
            expect(mockRow.Status).toBe('Ended');
            expect(mockRow.EndedAt).toEqual(endedAt);
            // 150s = 2.5 min * 0.02 = 0.05
            expect(mockRow.CostEstimate).toBe(0.05);

            // Expect Ended event
            expect(savedEvents.some((e) => e.EventType === 'Ended')).toBe(true);
        });

        it('marks status as Abandoned when abandoned flag is passed', async () => {
            const { provider, savedEvents } = createMockProvider();
            const startedAt = new Date('2026-10-01T12:00:00Z');
            const endedAt = new Date('2026-10-01T12:00:20Z'); // 20s before answer

            const mockRow = {
                ID: 'int-abandon-1',
                Channel: 'Phone',
                Direction: 'Inbound',
                Status: 'Active',
                StartedAt: startedAt,
                AnsweredAt: null,
                EndedAt: null,
                DurationSeconds: null,
                CostEstimate: null,
                Load: vi.fn(async () => true),
                Save: vi.fn(async () => true),
            } as unknown as MJInteractionEntity;

            (provider.GetEntityObject as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRow);

            const closed = await lifecycle.CloseInteraction({
                InteractionID: 'int-abandon-1',
                EndedAt: endedAt,
                EndReason: 'CallerHungUp',
                Abandoned: true,
                ContextUser: USER,
                MetadataProvider: provider,
            });

            expect(closed).toBe(true);
            expect(mockRow.Status).toBe('Abandoned');
            expect(savedEvents.some((e) => e.EventType === 'Abandoned')).toBe(true);
        });
    });

    describe('RecordRoomEvent', () => {
        it('appends an event to an interaction associated with a room', async () => {
            const { provider, savedEvents } = createMockProvider();
            lifecycle.RememberRoomInteraction('room-live-1', 'int-live-1');

            const event = await lifecycle.RecordRoomEvent(
                'room-live-1',
                'Transferred',
                USER,
                provider,
                undefined,
                'agent-2',
                { Note: 'Escalated to supervisor' },
            );

            expect(event).not.toBeNull();
            expect(savedEvents.length).toBe(1);
            expect(savedEvents[0].InteractionID).toBe('int-live-1');
            expect(savedEvents[0].EventType).toBe('Transferred');
            expect(savedEvents[0].ActorAgentID).toBe('agent-2');
        });

        it('returns false if room has no active interaction', async () => {
            const { provider } = createMockProvider();
            const event = await lifecycle.RecordRoomEvent('unknown-room', 'Transferred', USER, provider);
            expect(event).toBe(false);
        });
    });
});
