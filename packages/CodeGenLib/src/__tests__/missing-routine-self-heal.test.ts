import { describe, it, expect } from 'vitest';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import type { EntityInfo } from '@memberjunction/core';

/**
 * Expose the missing-routine helpers without going through ClassFactory-heavy
 * SQL generation. SQLCodeGenBase still constructs (provider + utility are
 * factory-resolved); if construction fails in a stripped test env the suite
 * will fail loudly rather than silently skip.
 */
class TestableSQLCodeGen extends SQLCodeGenBase {
    public SeedRoutines(keys: string[] | null): void {
        this.existingRoutines = keys === null ? null : new Set(keys);
    }

    public Missing(schema: string, name: string): boolean {
        return this.isRoutineMissing(schema, name);
    }

    public Force(schema: string, name: string, baseViewChanged: boolean): boolean {
        return this.forceLogForRoutine({ SchemaName: schema } as EntityInfo, name, baseViewChanged);
    }
}

describe('missing CRUD routine self-heal', () => {
    it('does not force-log when the catalog snapshot was not loaded', () => {
        const gen = new TestableSQLCodeGen();
        gen.SeedRoutines(null);
        expect(gen.Missing('bsd_billing', 'spCreateBillingChild_003')).toBe(false);
        expect(gen.Force('bsd_billing', 'spCreateBillingChild_003', false)).toBe(false);
    });

    it('force-logs a proc that is absent from the snapshot', () => {
        const gen = new TestableSQLCodeGen();
        gen.SeedRoutines(['bsd_billing.spcreatebillingchild_006']);
        expect(gen.Missing('bsd_billing', 'spCreateBillingChild_003')).toBe(true);
        expect(gen.Force('bsd_billing', 'spCreateBillingChild_003', false)).toBe(true);
    });

    it('does not force-log a proc that is already in the database', () => {
        const gen = new TestableSQLCodeGen();
        gen.SeedRoutines(['bsd_billing.spcreatebillingchild_003']);
        expect(gen.Missing('bsd_billing', 'spCreateBillingChild_003')).toBe(false);
        expect(gen.Force('bsd_billing', 'spCreateBillingChild_003', false)).toBe(false);
    });

    it('still force-logs when the base view itself changed', () => {
        const gen = new TestableSQLCodeGen();
        gen.SeedRoutines(['bsd_billing.spcreatebillingchild_003']);
        expect(gen.Force('bsd_billing', 'spCreateBillingChild_003', true)).toBe(true);
    });
});
