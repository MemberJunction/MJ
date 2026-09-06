/**
 * Sync-scoped write-side-effect suppression.
 *
 * The capability model this pins: Record Changes and geocoding are per-WRITE side effects, so
 * suppressing them belongs to the WRITER (the sync run), not to the entity. A connection that
 * asks for it gets EntitySaveOptions/EntityDeleteOptions on the sync's own saves; the entity
 * flags are untouched, so every other writer of the same entities — a human in the UI, an API
 * caller — still gets audit rows and geocoding. And the ask fails closed: absent, malformed,
 * or wrongly-typed configuration keeps the side effects ON.
 */
import { describe, it, expect } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

type Host = {
    ReadWriteSideEffects: (ci: MJCompanyIntegrationEntity) => string;
    syncSaveOptions: { SkipRecordChanges?: boolean; SkipGeoCoding?: boolean } | undefined;
    syncDeleteOptions: { SkipRecordChanges?: boolean } | undefined;
};

function makeHost(): Host {
    return Object.create(IntegrationEngine.prototype) as unknown as Host;
}

function ci(configuration: unknown): MJCompanyIntegrationEntity {
    return {
        Get: (name: string) => (name === 'Configuration' ? configuration : undefined),
    } as unknown as MJCompanyIntegrationEntity;
}

/** Enter the engine's run-context scope with the given flags, mirroring ExecuteEntityMaps. */
function inRunContext<T>(suppress: boolean | undefined, fn: () => T): T {
    const als = (IntegrationEngine as unknown as { runContext: { run: (ctx: unknown, fn: () => T) => T } }).runContext;
    return als.run({ suppressWriteSideEffects: suppress }, fn);
}

describe('ReadWriteSideEffects — the ask fails closed', () => {
    it("returns 'suppressed' only for the exact string ask", () => {
        const host = makeHost();
        expect(host.ReadWriteSideEffects(ci(JSON.stringify({ writeSideEffects: 'suppressed' })))).toBe('suppressed');
    });

    it('every malformed shape keeps the side effects on', () => {
        const host = makeHost();
        expect(host.ReadWriteSideEffects(ci(null))).toBe('');
        expect(host.ReadWriteSideEffects(ci(''))).toBe('');
        expect(host.ReadWriteSideEffects(ci('not json at all'))).toBe('');
        expect(host.ReadWriteSideEffects(ci(JSON.stringify({})))).toBe('');
        expect(host.ReadWriteSideEffects(ci(JSON.stringify({ writeSideEffects: true })))).toBe('');
        expect(host.ReadWriteSideEffects(ci(JSON.stringify({ writeSideEffects: 1 })))).toBe('');
    });
});

describe('the options exist only inside a run that asked', () => {
    it('suppressing run: save options skip BOTH side effects; delete options skip the audit row', () => {
        const host = makeHost();
        inRunContext(true, () => {
            expect(host.syncSaveOptions?.SkipRecordChanges).toBe(true);
            expect(host.syncSaveOptions?.SkipGeoCoding).toBe(true);
            expect(host.syncDeleteOptions?.SkipRecordChanges).toBe(true);
        });
    });

    it('non-suppressing run: undefined — the Save()/Delete() calls are identical to before the feature', () => {
        const host = makeHost();
        inRunContext(false, () => {
            expect(host.syncSaveOptions).toBeUndefined();
            expect(host.syncDeleteOptions).toBeUndefined();
        });
    });

    it('outside any run context (interactive/API writers): undefined — suppression can never leak to other writers', () => {
        const host = makeHost();
        expect(host.syncSaveOptions).toBeUndefined();
        expect(host.syncDeleteOptions).toBeUndefined();
    });
});
