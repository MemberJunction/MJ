import { describe, it, expect } from 'vitest';
import { AgentToolCircuitBreaker } from '../native-tools/agent-tool-circuit-breaker';

describe('AgentToolCircuitBreaker', () => {
    it('lets a call run until the same arguments have failed the threshold number of times', () => {
        const breaker = new AgentToolCircuitBreaker(2, 5);
        expect(breaker.Check('edit', 'a')).toBeNull();
        breaker.RecordFailure('edit', 'a');
        expect(breaker.Check('edit', 'a')).toBeNull();
        breaker.RecordFailure('edit', 'a');
        expect(breaker.Check('edit', 'a')).toContain('already failed 2 times');
        expect(breaker.Check('edit', 'b')).toBeNull();
    });

    it('refuses any arguments once the consecutive-failure budget is spent', () => {
        const breaker = new AgentToolCircuitBreaker(2, 3);
        ['a', 'b', 'c'].forEach((key) => breaker.RecordFailure('edit', key));
        expect(breaker.Check('edit', 'fresh')).toContain('disabled for this run after 3 consecutive failures');
    });

    it('tracks each tool separately and clears a tool on success or reset', () => {
        const breaker = new AgentToolCircuitBreaker(1, 5);
        breaker.RecordFailure('edit', 'a');
        expect(breaker.Check('write', 'a')).toBeNull();
        breaker.RecordSuccess('edit');
        expect(breaker.Check('edit', 'a')).toBeNull();
        breaker.RecordFailure('edit', 'a');
        breaker.Reset();
        expect(breaker.Check('edit', 'a')).toBeNull();
    });
});
