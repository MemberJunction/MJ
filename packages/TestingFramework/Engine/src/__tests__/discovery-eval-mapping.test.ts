/**
 * @fileoverview Mapping a discovery request to production's state, and the requests production
 * would ask nothing about.
 */
import { describe, it, expect } from 'vitest';
import { CATALOG_NARROWING_REQUEST_MAX_CHARS, OpeningRequestText } from '@memberjunction/ai-agents';
import { DiscoveryDecisionState } from '../decision-eval/discovery-mapping';
import { DiscoverySkipReason } from '../drivers/DecisionEvalDriver';

const SAGE = { ID: 'E1000000-0000-4000-8000-0000000000FF', Name: 'Sage' };
const BILLING = { ID: 'E1000000-0000-4000-8000-000000000002', Name: 'Billing Agent' };
const ENVIRONMENT = { AllAgents: [SAGE, BILLING], ConversationManager: SAGE };

describe('DiscoveryDecisionState', () => {
    it("is production's opening request for a conversation holding only the request", () => {
        const request = '  Invoice Acme for March, please.\n';
        expect(DiscoveryDecisionState(request)).toBe('Invoice Acme for March, please.');
        expect(DiscoveryDecisionState(request)).toBe(OpeningRequestText([{ role: 'user', content: request }]));
    });

    it("is capped at production's limit", () => {
        const long = 'x'.repeat(CATALOG_NARROWING_REQUEST_MAX_CHARS + 50);
        expect(DiscoveryDecisionState(long)).toHaveLength(CATALOG_NARROWING_REQUEST_MAX_CHARS);
    });

    it('is empty for a blank request', () => {
        expect(DiscoveryDecisionState('   \n ')).toBe('');
    });
});

describe('DiscoverySkipReason', () => {
    it('asks about an ordinary request', () => {
        expect(DiscoverySkipReason('Please invoice Acme', ENVIRONMENT)).toBeNull();
    });

    it('skips an empty request', () => {
        expect(DiscoverySkipReason('', ENVIRONMENT)).toContain('empty');
    });

    it('skips a request that @mentions another agent, by name or by token', () => {
        expect(DiscoverySkipReason('@Billing Agent please invoice Acme', ENVIRONMENT)).toContain('@mentions an agent');
        const token = `@{"_mode":"mention","type":"agent","id":"${BILLING.ID}","name":"Billing Agent"}`;
        expect(DiscoverySkipReason(`${token} invoice Acme`, ENVIRONMENT)).toContain('@mentions an agent');
    });

    it('still asks when the only mention is of the conversation manager', () => {
        expect(DiscoverySkipReason('@Sage who should invoice Acme?', ENVIRONMENT)).toBeNull();
    });
});
