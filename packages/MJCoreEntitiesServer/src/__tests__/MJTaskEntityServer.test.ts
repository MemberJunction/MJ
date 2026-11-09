/**
 * `MJTaskEntityServer` keeps `Task.SecurityEnvelope` immutable after insert (the envelope holds the
 * constraints of the run that submitted a task graph, and an edit could only loosen them) and keeps
 * the runtime security fields of `Task.Configuration` dispatcher-owned (an edit could clear a step's
 * recorded taint, or change what its compensation runs with).
 *
 * The generated base is mocked to a minimal stub whose `Validate()` succeeds and whose fields report
 * dirtiness and their stored value, so the test exercises only the guards the subclass adds.
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationResult } from '@memberjunction/core';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    class MockMJTaskEntity {
        public SecurityEnvelope: string | null = null;
        public envelopeDirty = false;
        public Configuration: string | null = null;
        /** The `Configuration` the row held before this save. */
        public storedConfiguration: string | null = null;
        private saved = false;
        public get IsSaved(): boolean {
            return this.saved;
        }
        public markSaved(): void {
            this.saved = true;
        }
        public GetFieldByName(name: string): { Dirty: boolean; OldValue?: unknown } | undefined {
            if (name === 'SecurityEnvelope') return { Dirty: this.envelopeDirty };
            if (name === 'Configuration') return { Dirty: this.Configuration !== this.storedConfiguration, OldValue: this.storedConfiguration };
            return undefined;
        }
        public Validate(): ValidationResult {
            const result = new ValidationResult();
            result.Success = true;
            return result;
        }
    }
    return { ...(await importOriginal<object>()), MJTaskEntity: MockMJTaskEntity };
});

import { MJTaskEntityServer, RuntimeSecurityChangeRefusal, SecurityEnvelopeChangeRefusal } from '../custom/MJTaskEntityServer.server';

type TestTask = MJTaskEntityServer & { envelopeDirty: boolean; storedConfiguration: string | null; markSaved(): void };

function task(opts: { saved: boolean; envelopeDirty?: boolean; stored?: object | null; next?: object | null }): TestTask {
    const t = new MJTaskEntityServer() as TestTask;
    t.SecurityEnvelope = '{"Version":1,"IsRunTainted":false}';
    t.envelopeDirty = opts.envelopeDirty ?? false;
    t.storedConfiguration = opts.stored ? JSON.stringify(opts.stored) : null;
    const next = opts.next === undefined ? opts.stored : opts.next;
    t.Configuration = next ? JSON.stringify(next) : null;
    if (opts.saved) t.markSaved();
    return t;
}

const config = (runtime: object, extra: object = {}): string => JSON.stringify({ inputMapping: '{"A":"payload.a"}', ...extra, runtime });

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

describe('RuntimeSecurityChangeRefusal', () => {
    const tainted = config({ actionLogID: 'log-1', isOutputTainted: true, actionInput: { OrderID: 'ORD-42' } });

    it("refuses setting a step's recorded taint back to false", () => {
        expect(RuntimeSecurityChangeRefusal(tainted, config({ actionLogID: 'log-1', isOutputTainted: false, actionInput: { OrderID: 'ORD-42' } })))
            .toContain('isOutputTainted');
    });

    it('refuses removing the recorded taint, or the whole runtime bag', () => {
        expect(RuntimeSecurityChangeRefusal(tainted, config({ actionLogID: 'log-1', actionInput: { OrderID: 'ORD-42' } }))).toContain('isOutputTainted');
        expect(RuntimeSecurityChangeRefusal(tainted, JSON.stringify({ inputMapping: '{}' }))).not.toBeNull();
        expect(RuntimeSecurityChangeRefusal(tainted, null)).not.toBeNull();
        expect(RuntimeSecurityChangeRefusal(tainted, '{not json')).not.toBeNull();
    });

    it('refuses changing the parameters a compensation runs with', () => {
        expect(RuntimeSecurityChangeRefusal(tainted, config({ actionLogID: 'log-1', isOutputTainted: true, actionInput: { OrderID: 'ORD-99' } })))
            .toContain('actionInput');
    });

    it('refuses a new row that arrives with runtime security fields already recorded', () => {
        expect(RuntimeSecurityChangeRefusal(null, config({ isOutputTainted: false }))).toContain('isOutputTainted');
    });

    it('allows an edit that leaves them as they were, and rows that have none', () => {
        expect(RuntimeSecurityChangeRefusal(tainted, JSON.stringify({ ...JSON.parse(tainted), layout: { x: 1, y: 2 } }))).toBeNull();
        expect(RuntimeSecurityChangeRefusal(null, JSON.stringify({ inputMapping: '{}' }))).toBeNull();
        expect(RuntimeSecurityChangeRefusal(config({ actionLogID: 'a' }), config({ actionLogID: 'b' }))).toBeNull();
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

    it("refuses a save that clears a step's recorded taint, whoever makes it", () => {
        const result = task({ saved: true, stored: { runtime: { isOutputTainted: true } }, next: { runtime: { isOutputTainted: false } } }).Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('Configuration');
    });

    it("passes the dispatcher's own full-row saves, which carry the recorded fields unchanged", () => {
        const stored = { runtime: { isOutputTainted: true, actionInput: { OrderID: 'ORD-42' } } };
        expect(task({ saved: true, stored, next: { ...stored, layout: { x: 10, y: 20 } } }).Validate().Success).toBe(true);
    });
});
