/**
 * The audit row cannot be suppressed over the wire.
 *
 * `EntityDeleteOptions.SkipRecordChanges` is an IN-PROCESS capability for machine writers (an
 * integration sync applying tens of thousands of records). It appears on `DeleteOptionsInput`
 * only because the schema-sync gate mirrors every `EntityDeleteOptions` field onto the InputType
 * — not because a client was ever meant to set it.
 *
 * That distinction is a security boundary, because the only authorization a delete mutation
 * performs is `entity:delete`: it asks *may you delete*, never *may you delete without an audit
 * row*. Honouring the flag from the wire would let any caller permitted to delete override an
 * administrator's entity-level `TrackRecordChanges` decision, per call — and leave the delete
 * path strictly more permissive than the save path, whose twin options are inexpressible over
 * GraphQL (there is no `SaveOptionsInput`).
 *
 * These tests exist so the sanitizer cannot be "simplified" away later: they pin the downgrade
 * itself, that it is a downgrade rather than a rejection (throwing would yield no delete AND no
 * audit row), and that it leaves every other option untouched.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const logErrorCalls: string[] = [];
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: (msg: string) => { logErrorCalls.push(msg); } };
});

import { DeleteOptionsInput } from '../generic/DeleteOptionsInput.js';

/** A wire-shaped options object with every field populated, as type-graphql would deliver it. */
function wireOptions(overrides: Partial<DeleteOptionsInput> = {}): DeleteOptionsInput {
    return {
        SkipEntityAIActions: false,
        SkipEntityActions: false,
        ReplayOnly: false,
        IsParentEntityDelete: false,
        SkipRecordChanges: false,
        ...overrides,
    } as DeleteOptionsInput;
}

describe('DeleteOptionsInput.SanitizeFromWire', () => {
    beforeEach(() => { logErrorCalls.length = 0; });

    it('forces a client-supplied SkipRecordChanges:true back to false', () => {
        const sanitized = DeleteOptionsInput.SanitizeFromWire(
            wireOptions({ SkipRecordChanges: true }), 'Customers', 'attacker@example.test'
        );
        expect(sanitized.SkipRecordChanges).toBe(false);
    });

    it('DOWNGRADES rather than throws — the delete still proceeds, so the audit row is written', () => {
        expect(() => DeleteOptionsInput.SanitizeFromWire(
            wireOptions({ SkipRecordChanges: true }), 'Customers', 'attacker@example.test'
        )).not.toThrow();
    });

    it('logs the attempt, naming the entity and the caller', () => {
        DeleteOptionsInput.SanitizeFromWire(wireOptions({ SkipRecordChanges: true }), 'Customers', 'attacker@example.test');
        expect(logErrorCalls).toHaveLength(1);
        expect(logErrorCalls[0]).toContain('SkipRecordChanges');
        expect(logErrorCalls[0]).toContain('Customers');
        expect(logErrorCalls[0]).toContain('attacker@example.test');
    });

    it('leaves every OTHER option exactly as the client sent it', () => {
        const sanitized = DeleteOptionsInput.SanitizeFromWire(
            wireOptions({ SkipRecordChanges: true, SkipEntityActions: true, ReplayOnly: true, IsParentEntityDelete: true }),
            'Customers', 'someone@example.test'
        );
        expect(sanitized.SkipEntityActions).toBe(true);
        expect(sanitized.ReplayOnly).toBe(true);
        expect(sanitized.IsParentEntityDelete).toBe(true);
        expect(sanitized.SkipEntityAIActions).toBe(false);
    });

    it('is a no-op — same object, no log — for the ordinary request that never asked', () => {
        const original = wireOptions();
        const sanitized = DeleteOptionsInput.SanitizeFromWire(original, 'Customers', 'user@example.test');
        expect(sanitized).toBe(original);          // untouched, not a copy
        expect(logErrorCalls).toHaveLength(0);     // and no noise in the log for normal traffic
    });

    it('survives a caller with no identifiable email rather than throwing on it', () => {
        const sanitized = DeleteOptionsInput.SanitizeFromWire(wireOptions({ SkipRecordChanges: true }), 'Customers', undefined);
        expect(sanitized.SkipRecordChanges).toBe(false);
        expect(logErrorCalls[0]).toContain('unidentified');
    });
});

/**
 * The resolver-level pin: what actually reaches `entityObject.Delete()`.
 *
 * The unit tests above prove the sanitizer transforms correctly; this proves it is WIRED —
 * that a client-supplied `SkipRecordChanges: true` arriving at the mutation that every generated
 * `DeleteX` routes through is `false` by the time the entity sees it. Without this, the sanitize
 * call could be dropped from `DeleteRecord` and every test above would still pass.
 */
describe('ResolverBase.DeleteRecord — the sanitize is wired, not just available', () => {
    beforeEach(() => { logErrorCalls.length = 0; });

    /** Captures the options the entity is deleted with. */
    function makeHarness() {
        const seen: { options?: DeleteOptionsInput } = {};
        const entityObject = {
            InnerLoad: async () => true,
            GetAll: () => ({ ID: 'row-1' }),
            Delete: async (options: DeleteOptionsInput) => { seen.options = options; return true; },
            LatestResult: { Message: '' },
        };
        const provider = { GetEntityObject: async () => entityObject } as unknown as Parameters<typeof callDeleteRecord>[1];
        return { seen, provider };
    }

    /**
     * Drives the REAL `ResolverBase.DeleteRecord` with its collaborators stubbed on the instance
     * — the scope check, the Before/After hooks and the subscription listener are separate
     * concerns with their own tests; the production body under test is unmodified.
     */
    async function callDeleteRecord(options: DeleteOptionsInput, provider: unknown) {
        const { ResolverBase } = await import('../generic/ResolverBase.js');
        const resolver = Object.create(ResolverBase.prototype) as Record<string, unknown> & {
            DeleteRecord: (...args: unknown[]) => Promise<unknown>;
        };
        resolver.CheckAPIKeyScopeAuthorization = async () => undefined;
        resolver.BeforeDelete = async () => true;
        resolver.AfterDelete = async () => undefined;
        resolver.ListenForEntityMessages = () => undefined;
        resolver.GetUserFromPayload = () => ({ ID: 'u-1' });
        return resolver.DeleteRecord(
            'Customers',
            { KeyValuePairs: [{ FieldName: 'ID', Value: 'row-1' }] },
            options,
            provider,
            { email: 'attacker@example.test' },
            { publish: async () => undefined },
        );
    }

    it('a client asking to suppress the audit row reaches entityObject.Delete with it FALSE', async () => {
        const { seen, provider } = makeHarness();
        await callDeleteRecord(wireOptions({ SkipRecordChanges: true }), provider);
        expect(seen.options).toBeDefined();
        expect(seen.options!.SkipRecordChanges).toBe(false);
        expect(logErrorCalls).toHaveLength(1); // and the attempt is on the record
    });

    it('an ordinary delete passes its other options through untouched', async () => {
        const { seen, provider } = makeHarness();
        await callDeleteRecord(wireOptions({ ReplayOnly: true }), provider);
        expect(seen.options!.ReplayOnly).toBe(true);
        expect(seen.options!.SkipRecordChanges).toBe(false);
        expect(logErrorCalls).toHaveLength(0);
    });
});
