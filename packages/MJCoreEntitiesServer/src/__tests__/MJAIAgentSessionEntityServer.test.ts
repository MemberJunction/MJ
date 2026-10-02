/**
 * Unit tests for the server-authoritative `Config` guard on `MJ: AI Agent Sessions`.
 *
 * The session OWNER can write their own row (the `UI` and `Widget Guest` roles hold `CanUpdate`
 * scoped to it), so without this guard an owner could rewrite the janitor's `maxSessionDeadlineIso`
 * to extend their own session, or forge `identityVerification` to mark themselves verified. What is
 * under test is the invariant "an untrusted save cannot change a protected key; a trusted one can",
 * for both the pure diff and the entity wrapper around it.
 *
 * The generated base (`MJAIAgentSessionEntity`) is mocked to a settable stub, matching the approach
 * in MJRoleEntityServer.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';

// Neutralize the class-factory registration decorator; leave everything else real.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

/** The slice of an entity field the guard reads. */
interface StubConfigField {
    Dirty: boolean;
    OldValue: unknown;
}

// Declared INSIDE the factory because `vi.mock` is hoisted above every top-level declaration here.
vi.mock('@memberjunction/core-entities', () => {
    /** Minimal stand-in for the generated MJAIAgentSessionEntity. */
    class StubSessionEntity {
        public IsSaved = true;
        public Config_: string | null = null;
        public ConfigField: StubConfigField | null = { Dirty: true, OldValue: null };

        public Validate(): { Success: boolean; Errors: unknown[] } {
            return { Success: true, Errors: [] };
        }

        public GetFieldByName(name: string): StubConfigField | null {
            return name === 'Config' ? this.ConfigField : null;
        }
    }
    return { MJAIAgentSessionEntity: StubSessionEntity };
});

import {
    FindProtectedSessionConfigChanges,
    IsTrustedSessionConfigWriteActive,
    PROTECTED_SESSION_CONFIG_KEYS,
    RunWithTrustedSessionConfigWrites,
} from '../custom/sessionConfigGuard';
import { MJAIAgentSessionEntityServer } from '../custom/MJAIAgentSessionEntityServer.server';

const DEADLINE = '2026-10-02T12:30:00.000Z';
const VERIFICATION = { Policy: { requireBusinessDomain: true }, SendCount: 1 };

/** Builds a session entity stub in a given persisted/edited state. */
function session(opts: { saved: boolean; previous: string | null; next: string | null; dirty?: boolean }): MJAIAgentSessionEntityServer {
    const entity = new MJAIAgentSessionEntityServer();
    const stub = entity as unknown as { IsSaved: boolean; Config_: string | null; ConfigField: StubConfigField | null };
    stub.IsSaved = opts.saved;
    stub.Config_ = opts.next;
    stub.ConfigField = { Dirty: opts.dirty ?? true, OldValue: opts.previous };
    return entity;
}

describe('PROTECTED_SESSION_CONFIG_KEYS', () => {
    it('protects the janitor deadline and the verification state', () => {
        expect(PROTECTED_SESSION_CONFIG_KEYS).toEqual(['maxSessionDeadlineIso', 'identityVerification']);
    });
});

describe('FindProtectedSessionConfigChanges', () => {
    it('reports nothing when neither side carries a protected key', () => {
        expect(FindProtectedSessionConfigChanges('{"targetAgentID":"a"}', '{"targetAgentID":"b","coAgentRunID":"r"}')).toEqual([]);
        expect(FindProtectedSessionConfigChanges(null, null)).toEqual([]);
    });

    it('reports an added protected key', () => {
        expect(FindProtectedSessionConfigChanges('{"a":1}', JSON.stringify({ a: 1, maxSessionDeadlineIso: DEADLINE }))).toEqual([
            'maxSessionDeadlineIso',
        ]);
    });

    it('reports an altered deadline (the extend-my-own-session attack)', () => {
        const before = JSON.stringify({ maxSessionDeadlineIso: DEADLINE });
        const after = JSON.stringify({ maxSessionDeadlineIso: '2099-01-01T00:00:00.000Z' });
        expect(FindProtectedSessionConfigChanges(before, after)).toEqual(['maxSessionDeadlineIso']);
    });

    it('reports a removed protected key (the drop-my-deadline attack)', () => {
        expect(FindProtectedSessionConfigChanges(JSON.stringify({ maxSessionDeadlineIso: DEADLINE }), '{}')).toEqual([
            'maxSessionDeadlineIso',
        ]);
    });

    it('reports a forged identityVerification, including a nested change', () => {
        const before = JSON.stringify({ identityVerification: VERIFICATION });
        const forged = JSON.stringify({ identityVerification: { ...VERIFICATION, Verified: { Email: 'a@b.c' } } });
        expect(FindProtectedSessionConfigChanges(before, forged)).toEqual(['identityVerification']);
    });

    it('treats key order and whitespace as no change (a server re-serialization is not a change)', () => {
        const before = '{"identityVerification":{"SendCount":1,"Policy":{"requireBusinessDomain":true}},"maxSessionDeadlineIso":"' + DEADLINE + '"}';
        const after = JSON.stringify({ maxSessionDeadlineIso: DEADLINE, identityVerification: { Policy: { requireBusinessDomain: true }, SendCount: 1 } }, null, 2);
        expect(FindProtectedSessionConfigChanges(before, after)).toEqual([]);
    });

    it('treats corrupting the blob as removing the protected keys', () => {
        expect(FindProtectedSessionConfigChanges(JSON.stringify({ maxSessionDeadlineIso: DEADLINE }), '{not json')).toEqual([
            'maxSessionDeadlineIso',
        ]);
        expect(FindProtectedSessionConfigChanges(JSON.stringify({ maxSessionDeadlineIso: DEADLINE }), '[1,2]')).toEqual([
            'maxSessionDeadlineIso',
        ]);
    });

    it('treats an unreadable previous value as carrying no protected keys', () => {
        expect(FindProtectedSessionConfigChanges('{garbage', '{}')).toEqual([]);
    });
});

describe('RunWithTrustedSessionConfigWrites', () => {
    it('is inactive by default and active only inside the scope, across awaits', async () => {
        expect(IsTrustedSessionConfigWriteActive()).toBe(false);
        await RunWithTrustedSessionConfigWrites(async () => {
            expect(IsTrustedSessionConfigWriteActive()).toBe(true);
            await Promise.resolve();
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(IsTrustedSessionConfigWriteActive()).toBe(true);
        });
        expect(IsTrustedSessionConfigWriteActive()).toBe(false);
    });

    it('does not leak into a concurrently running untrusted flow', async () => {
        let untrustedSawTrust = true;
        const trusted = RunWithTrustedSessionConfigWrites(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
        const untrusted = (async () => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            untrustedSawTrust = IsTrustedSessionConfigWriteActive();
        })();
        await Promise.all([trusted, untrusted]);
        expect(untrustedSawTrust).toBe(false);
    });

    it('returns the work result and ends the scope when the work throws', async () => {
        await expect(RunWithTrustedSessionConfigWrites(async () => 7)).resolves.toBe(7);
        await expect(
            RunWithTrustedSessionConfigWrites(async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');
        expect(IsTrustedSessionConfigWriteActive()).toBe(false);
    });
});

describe('MJAIAgentSessionEntityServer.Validate', () => {
    it('refuses an untrusted update that changes the deadline', () => {
        const entity = session({
            saved: true,
            previous: JSON.stringify({ maxSessionDeadlineIso: DEADLINE }),
            next: JSON.stringify({ maxSessionDeadlineIso: '2099-01-01T00:00:00.000Z' }),
        });
        const result = entity.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Message).toContain('maxSessionDeadlineIso');
    });

    it('refuses an untrusted update that adds identityVerification', () => {
        const entity = session({ saved: true, previous: '{}', next: JSON.stringify({ identityVerification: VERIFICATION }) });
        expect(entity.Validate().Success).toBe(false);
    });

    it('refuses an untrusted CREATE that carries a protected key', () => {
        const entity = session({ saved: false, previous: null, next: JSON.stringify({ maxSessionDeadlineIso: DEADLINE }) });
        expect(entity.Validate().Success).toBe(false);
    });

    it('allows an untrusted update that leaves protected keys untouched', () => {
        const config = JSON.stringify({ targetAgentID: 'a', maxSessionDeadlineIso: DEADLINE });
        const entity = session({ saved: true, previous: config, next: JSON.stringify({ maxSessionDeadlineIso: DEADLINE, targetAgentID: 'b' }) });
        expect(entity.Validate().Success).toBe(true);
    });

    it('does not inspect Config when it was not edited', () => {
        const entity = session({
            saved: true,
            previous: JSON.stringify({ maxSessionDeadlineIso: DEADLINE }),
            next: '{}', // would be a violation if it were inspected
            dirty: false,
        });
        expect(entity.Validate().Success).toBe(true);
    });

    it('allows the same changes inside a trusted scope', async () => {
        const entity = session({
            saved: true,
            previous: JSON.stringify({ maxSessionDeadlineIso: DEADLINE }),
            next: JSON.stringify({ maxSessionDeadlineIso: '2026-10-02T13:00:00.000Z', identityVerification: VERIFICATION }),
        });
        const result = await RunWithTrustedSessionConfigWrites(async () => entity.Validate());
        expect(result.Success).toBe(true);
        // ...and the guard is back on the moment the scope ends.
        expect(entity.Validate().Success).toBe(false);
    });

    it('keeps the base validation result when the base already failed', () => {
        const entity = session({ saved: true, previous: '{}', next: '{}' });
        const base = Object.getPrototypeOf(MJAIAgentSessionEntityServer.prototype) as { Validate: () => { Success: boolean; Errors: unknown[] } };
        const original = base.Validate;
        base.Validate = () => ({ Success: false, Errors: ['base failure'] });
        try {
            const result = entity.Validate();
            expect(result.Success).toBe(false);
            expect(result.Errors).toContain('base failure');
        } finally {
            base.Validate = original;
        }
    });
});
