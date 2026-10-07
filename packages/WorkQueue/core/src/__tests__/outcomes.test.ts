import { describe, it, expect } from 'vitest';
import { IsWorkOutcome, MapHandlerReturn, MapThrownError, ResolveSettleAction } from '../runtime/outcomes';
import { FatalWorkError, TransientWorkError } from '../errors';
import { Outcome } from '../handler';
import { MakePolicy } from './fakes';

describe('IsWorkOutcome', () => {
    it('accepts the three outcome shapes', () => {
        expect(IsWorkOutcome({ Kind: 'Complete' })).toBe(true);
        expect(IsWorkOutcome({ Kind: 'Retry' })).toBe(true);
        expect(IsWorkOutcome({ Kind: 'Retry', DelaySeconds: 5, Reason: 'busy' })).toBe(true);
        expect(IsWorkOutcome({ Kind: 'DeadLetter', Reason: 'poison' })).toBe(true);
    });

    it('rejects anything else', () => {
        const invalid: unknown[] = [null, undefined, 'Complete', {}, { Kind: 'Retry', DelaySeconds: '5' }, { Kind: 'DeadLetter' }, { Kind: 'Other' }];
        for (const value of invalid) {
            expect(IsWorkOutcome(value)).toBe(false);
        }
    });
});

describe('MapThrownError', () => {
    it('maps FatalWorkError to DeadLetter with the error message as reason', () => {
        const result = MapThrownError(new FatalWorkError('bad payload'));
        expect(result.Outcome).toEqual({ Kind: 'DeadLetter', Reason: 'bad payload' });
        expect(result.ErrorText?.startsWith('FatalWorkError: bad payload')).toBe(true);
    });

    it('maps TransientWorkError to Retry with its delay', () => {
        expect(MapThrownError(new TransientWorkError('rate limited', 45)).Outcome).toEqual({ Kind: 'Retry', Reason: 'rate limited', DelaySeconds: 45 });
    });

    it('maps any other thrown value to Retry', () => {
        expect(MapThrownError(new Error('boom')).Outcome).toEqual({ Kind: 'Retry', Reason: 'boom' });
        const text = MapThrownError('plain text');
        expect(text.Outcome).toEqual({ Kind: 'Retry', Reason: 'plain text' });
        expect(text.ErrorText).toBe('plain text');
    });
});

describe('MapHandlerReturn', () => {
    it('passes valid outcomes through and turns invalid returns into Retry', () => {
        expect(MapHandlerReturn(Outcome.Complete())).toEqual({ Outcome: { Kind: 'Complete' }, ErrorText: null });
        const invalid = MapHandlerReturn(undefined);
        expect(invalid.Outcome.Kind).toBe('Retry');
        expect(invalid.ErrorText).toBe('Handler returned no valid outcome');
    });
});

describe('ResolveSettleAction', () => {
    const policy = MakePolicy({ MaxAttempts: 3, BackoffBaseSeconds: 10, BackoffMaxSeconds: 900 });

    it('completes', () => {
        expect(ResolveSettleAction({ Outcome: Outcome.Complete(), ErrorText: null }, 1, policy)).toEqual({ Kind: 'Complete' });
    });

    it('dead-letters with the handler reason truncated to 100 characters', () => {
        const action = ResolveSettleAction({ Outcome: Outcome.DeadLetter('r'.repeat(150)), ErrorText: 'details' }, 1, policy);
        expect(action.Kind).toBe('DeadLetter');
        if (action.Kind === 'DeadLetter') {
            expect(action.Reason).toHaveLength(100);
            expect(action.Error).toBe('details');
        }
    });

    it('retries with backoff while attempts remain, honouring a handler delay', () => {
        expect(ResolveSettleAction({ Outcome: Outcome.Retry('busy'), ErrorText: null }, 2, policy, () => 1))
            .toEqual({ Kind: 'Retry', DelaySeconds: 20, Error: 'busy' });
        expect(ResolveSettleAction({ Outcome: Outcome.Retry('busy', 45), ErrorText: null }, 2, policy, () => 1))
            .toEqual({ Kind: 'Retry', DelaySeconds: 45, Error: 'busy' });
    });

    it('dead-letters as MaxAttemptsExceeded on the final attempt', () => {
        expect(ResolveSettleAction({ Outcome: Outcome.Retry('busy'), ErrorText: 'stack' }, 3, policy))
            .toEqual({ Kind: 'DeadLetter', Reason: 'MaxAttemptsExceeded', Error: 'stack' });
    });

    it('uses the error text, then the reason, then a default as the retry error', () => {
        const retry = (errorText: string | null, reason?: string) =>
            ResolveSettleAction({ Outcome: Outcome.Retry(reason), ErrorText: errorText }, 1, policy, () => 0);
        expect(retry('stack', 'reason')).toMatchObject({ Error: 'stack' });
        expect(retry(null, 'reason')).toMatchObject({ Error: 'reason' });
        expect(retry(null)).toMatchObject({ Error: 'Retry requested by handler' });
    });
});
