/**
 * @fileoverview What the composer sends when the realtime picker confirms a call: the picked model, voice, and the
 * avatar that comes with that voice reach the session mint as the one override envelope.
 *
 * Instantiated via the prototype (no constructor/TestBed) with only the members the pick path touches stubbed, the
 * same style as message-input-streaming.test.ts.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi } from 'vitest';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { MessageInputComponent } from '../lib/components/message/message-input.component';
import type { RealtimeAgentPick } from '../lib/components/realtime/realtime-agent-picker.component';

/** The `configOverridesJson` argument of `RealtimeSessionService.StartRealtimeSession`. */
const OVERRIDES_ARG = 7;

function harness(): { component: MessageInputComponent; starts: unknown[][] } {
    const starts: unknown[][] = [];
    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        ConversationId: 'conversation-1',
        ApplicationId: null,
        AppContext: null,
        realtimeSession: {
            StartRealtimeSession: vi.fn(async (...args: unknown[]) => {
                starts.push(args);
            }),
        },
        toastService: { error: vi.fn() },
        persistCoAgentChoice: () => undefined,
    });
    return { component, starts };
}

function pick(overrides: Partial<RealtimeAgentPick>): RealtimeAgentPick {
    return {
        Agent: { ID: 'agent-1', Name: 'Research Assistant' } as MJAIAgentEntityExtended,
        PreferredModelId: 'model-a',
        PreferredVoice: 'Puck',
        CoAgentId: null,
        RecordingConsent: false,
        ...overrides,
    };
}

describe('MessageInputComponent.OnRealtimeAgentPicked', () => {
    it('sends the picked voice and its avatar, with video turned on', async () => {
        const { component, starts } = harness();
        await component.OnRealtimeAgentPicked(pick({ PreferredAvatarId: 'Avery' }));
        expect(starts).toHaveLength(1);
        expect(JSON.parse(starts[0][OVERRIDES_ARG] as string)).toEqual({
            realtime: { modelPreference: 'model-a', voice: { default: { voice: 'Puck' } }, video: { enabled: true, avatarId: 'Avery' } },
        });
    });

    it('sends no video block for a voice without an avatar', async () => {
        const { component, starts } = harness();
        await component.OnRealtimeAgentPicked(pick({ PreferredVoice: 'Kore', PreferredAvatarId: null }));
        expect(JSON.parse(starts[0][OVERRIDES_ARG] as string)).toEqual({
            realtime: { modelPreference: 'model-a', voice: { default: { voice: 'Kore' } } },
        });
    });
});
