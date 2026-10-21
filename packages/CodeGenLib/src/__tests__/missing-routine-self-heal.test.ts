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

    public SeedRoutineDefinitions(defs: Record<string, string> | null): void {
        this.existingRoutineDefinitions = defs === null ? null : new Map(Object.entries(defs));
    }

    public Missing(schema: string, name: string): boolean {
        return this.isRoutineMissing(schema, name);
    }

    public Force(schema: string, name: string, baseViewChanged: boolean): boolean {
        return this.forceLogForRoutine({ SchemaName: schema } as EntityInfo, name, baseViewChanged);
    }

    public ForceEntity(entity: Partial<EntityInfo>, name: string, baseViewChanged: boolean): boolean {
        return this.forceLogForRoutine(entity as EntityInfo, name, baseViewChanged);
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

    it('force-logs spCreate and spUpdate when SaveReturnMode changed to datestamps_only via mj sync push', () => {
        const gen = new TestableSQLCodeGen();
        gen.SeedRoutines(['__mj.spcreateaiagentrunstep', '__mj.spupdateaiagentrunstep', '__mj.spdeleteaiagentrunstep']);
        gen.SeedRoutineDefinitions({
            '__mj.spcreateaiagentrunstep': 'CREATE PROC [__mj].[spCreateAIAgentRunStep] AS SELECT * FROM [__mj].[vwAIAgentRunSteps]',
            '__mj.spupdateaiagentrunstep': 'CREATE PROC [__mj].[spUpdateAIAgentRunStep] AS SELECT * FROM [__mj].[vwAIAgentRunSteps]',
            '__mj.spdeleteaiagentrunstep': 'CREATE PROC [__mj].[spDeleteAIAgentRunStep] AS DELETE FROM [__mj].[AIAgentRunStep]',
        });
        const entity: Partial<EntityInfo> = {
            SchemaName: '__mj',
            BaseTable: 'AIAgentRunStep',
            BaseTableCodeName: 'AIAgentRunStep',
            BaseView: 'vwAIAgentRunSteps',
            spCreate: 'spCreateAIAgentRunStep',
            spUpdate: 'spUpdateAIAgentRunStep',
            spDelete: 'spDeleteAIAgentRunStep',
            SaveReturnMode: 'datestamps_only',
        };
        expect(gen.ForceEntity(entity, 'spCreateAIAgentRunStep', false)).toBe(true);
        expect(gen.ForceEntity(entity, 'spUpdateAIAgentRunStep', false)).toBe(true);
        expect(gen.ForceEntity(entity, 'spDeleteAIAgentRunStep', false)).toBe(false);
    });

    it('does not force-log when DB routine already matches datestamps_only', () => {
        const gen = new TestableSQLCodeGen();
        gen.SeedRoutines(['__mj.spcreateaiagentrunstep']);
        gen.SeedRoutineDefinitions({
            '__mj.spcreateaiagentrunstep': 'CREATE PROC [__mj].[spCreateAIAgentRunStep] AS SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [__mj].[AIAgentRunStep]',
        });
        const entity: Partial<EntityInfo> = {
            SchemaName: '__mj',
            BaseTable: 'AIAgentRunStep',
            BaseTableCodeName: 'AIAgentRunStep',
            BaseView: 'vwAIAgentRunSteps',
            spCreate: 'spCreateAIAgentRunStep',
            SaveReturnMode: 'datestamps_only',
        };
        expect(gen.ForceEntity(entity, 'spCreateAIAgentRunStep', false)).toBe(false);
    });
});

