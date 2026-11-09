import { describe, it, expect } from 'vitest';
import { FatalWorkError, TransientWorkError, WorkQueueConfigurationError } from '../errors';
import { Outcome } from '../handler';

describe('work-queue errors', () => {
    it('FatalWorkError is an Error with its own name', () => {
        const error = new FatalWorkError('payload is malformed');
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(FatalWorkError);
        expect(error.name).toBe('FatalWorkError');
        expect(error.message).toBe('payload is malformed');
    });

    it('TransientWorkError carries an optional retry-after', () => {
        expect(new TransientWorkError('busy', 45).RetryAfterSeconds).toBe(45);
        expect(new TransientWorkError('busy').RetryAfterSeconds).toBeUndefined();
        expect(new TransientWorkError('busy').name).toBe('TransientWorkError');
    });

    it('WorkQueueConfigurationError is distinguishable from handler errors', () => {
        const error = new WorkQueueConfigurationError('unknown topic');
        expect(error.name).toBe('WorkQueueConfigurationError');
        expect(error).not.toBeInstanceOf(FatalWorkError);
    });
});

describe('Outcome helpers', () => {
    it('builds Complete', () => {
        expect(Outcome.Complete()).toEqual({ Kind: 'Complete' });
    });

    it('builds Retry without undefined properties', () => {
        expect(Outcome.Retry()).toEqual({ Kind: 'Retry' });
        expect(Object.keys(Outcome.Retry())).toEqual(['Kind']);
        expect(Outcome.Retry('rate limited', 30)).toEqual({ Kind: 'Retry', Reason: 'rate limited', DelaySeconds: 30 });
    });

    it('builds DeadLetter', () => {
        expect(Outcome.DeadLetter('poison')).toEqual({ Kind: 'DeadLetter', Reason: 'poison' });
    });
});
