/**
 * The decision role each native control tool scores as. complete_task is the native form of the
 * envelope's taskComplete, so it must score as taskComplete, not as an unknown Action.
 */
import { describe, expect, it } from 'vitest';
import { ControlToolMapFor } from '../drivers/control-tool-map';

describe('ControlToolMapFor', () => {
    it('maps each control-tool kind to its decision role and leaves Actions out', () => {
        const map = ControlToolMapFor([
            ['run_ad_hoc_query', { kind: 'action' }],
            ['delegate_to_query_strategist', { kind: 'subAgent', agent: { Name: 'Query Strategist' } }],
            ['payload_change_request', { kind: 'payloadChange' }],
            ['ask_user', { kind: 'askUser' }],
            ['complete_task', { kind: 'complete' }]
        ]);
        expect(map).toEqual({
            delegate_to_query_strategist: { kind: 'subAgent', name: 'Query Strategist' },
            payload_change_request: { kind: 'payloadChange' },
            ask_user: { kind: 'chat' },
            complete_task: { kind: 'taskComplete' }
        });
    });

    it('falls back to the tool name when a sub-agent binding carries no agent name', () => {
        expect(ControlToolMapFor([['delegate_to_x', { kind: 'subAgent', agent: {} }]])).toEqual({ delegate_to_x: { kind: 'subAgent', name: 'delegate_to_x' } });
    });
});
