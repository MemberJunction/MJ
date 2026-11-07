/**
 * `MJTaskEntityServer` keeps `Task.SecurityEnvelope` immutable after insert: the envelope holds the
 * constraints of the run that submitted a task graph, and an edit could only loosen them.
 *
 * The generated base is mocked to a minimal stub whose `Validate()` succeeds and whose
 * `SecurityEnvelope` field reports dirtiness, so the test exercises only the guard the subclass adds.
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationResult } from '@memberjunction/core';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core-entities', () => {
    class MockMJTaskEntity {
        public SecurityEnvelope: string | null = null;
        public envelopeDirty = false;
        private saved = false;
        public get IsSaved(): boolean {
            return this.saved;
        }
        public markSaved(): void {
            this.saved = true;
        }
        public GetFieldByName(name: string): { Dirty: boolean } | undefined {
            return name === 'SecurityEnvelope' ? { Dirty: this.envelopeDirty } : undefined;
        }
        public Validate(): ValidationResult {
            const result = new ValidationResult();
            result.Success = true;
            return result;
        }
    }
    return { MJTaskEntity: MockMJTaskEntity };
});

import { MJTaskEntityServer, SecurityEnvelopeChangeRefusal } from '../custom/MJTaskEntityServer.server';

type TestTask = MJTaskEntityServer & { envelopeDirty: boolean; markSaved(): void };

function task(opts: { saved: boolean; envelopeDirty: boolean }): TestTask {
    const t = new MJTaskEntityServer() as TestTask;
    t.SecurityEnvelope = '{"Version":1,"IsRunTainted":false}';
    t.envelopeDirty = opts.envelopeDirty;
    if (opts.saved) t.markSaved();
    return t;
}

describe('SecurityEnvelopeChangeRefusal', () => {
    it('allows writing the envelope on a new row (the server submitting a graph)', () => {
        expect(SecurityEnvelopeChangeRefusal(false, true)).toBeNull();
    });

    it('allows saving an existing row that leaves the envelope alone', () => {
        expect(SecurityEnvelopeChangeRefusal(true, false)).toBeNull();
    });

    it('refuses changing the envelope on an existing row', () => {
        expect(SecurityEnvelopeChangeRefusal(true, true)).toContain('cannot be changed');
    });
});

describe('MJTaskEntityServer.Validate', () => {
    it('fails validation when an existing task changes its envelope', () => {
        const result = task({ saved: true, envelopeDirty: true }).Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('SecurityEnvelope');
    });

    it('passes when a new task sets its envelope', () => {
        expect(task({ saved: false, envelopeDirty: true }).Validate().Success).toBe(true);
    });

    it('passes when an existing task saves other fields', () => {
        expect(task({ saved: true, envelopeDirty: false }).Validate().Success).toBe(true);
    });
});
