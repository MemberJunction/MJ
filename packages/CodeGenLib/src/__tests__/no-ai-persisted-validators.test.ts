/**
 * `mj codegen --no-ai` must still load persisted CHECK-constraint validators.
 *
 * With `skipDBUpdate` (load-only) the validator path calls `runValidationGeneration` with
 * `generateNewCode = false`, which only reads Approved `GeneratedCode` rows and never reaches
 * an LLM. Gating that read on the `ParseCheckConstraints` feature flag made `--no-ai` runs
 * delete every committed `Validate()` override, and the regression shipped twice with a
 * success log either way. These cases pin the predicate in
 * `manageEntityFieldValuesAndValidatorFunctions`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const flags = vi.hoisted(() => ({ parseCheckConstraints: false }));

vi.mock('../Misc/advanced_generation', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../Misc/advanced_generation')>();
    class StubAdvancedGeneration {
        public featureEnabled(featureName: string): boolean {
            return featureName === 'ParseCheckConstraints' && flags.parseCheckConstraints;
        }
    }
    return { ...actual, AdvancedGeneration: StubAdvancedGeneration };
});

import { ManageMetadataBase } from '../Database/manage-metadata';
import type { CodeGenConnection, CodeGenDatabaseProvider, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const POOL = {} as CodeGenConnection;

/** One row of `vwEntityFieldsWithCheckConstraints`; a blank EntityFieldID marks a table-level constraint. */
interface CheckConstraintRow {
    EntityFieldID: string | null;
    EntityName: string;
    ColumnName: string | null;
    ConstraintDefinition: string;
}

/** A column-level constraint the value-list parser cannot turn into a list, so it goes to validator generation. */
const COLUMN_CONSTRAINT: CheckConstraintRow = {
    EntityFieldID: 'field-end-date',
    EntityName: 'Events',
    ColumnName: 'EndDate',
    ConstraintDefinition: '([EndDate]>=getdate())',
};

const TABLE_CONSTRAINT: CheckConstraintRow = {
    EntityFieldID: null,
    EntityName: 'Events',
    ColumnName: null,
    ConstraintDefinition: '([EndDate]>[StartDate])',
};

/** Signature of the private method under observation. */
type RunValidationGeneration = (
    r: CheckConstraintRow,
    allEntityFields: unknown[],
    generateNewCode: boolean,
    currentUser: UserInfo,
) => Promise<void>;

class Testable extends ManageMetadataBase {
    public constraints: CheckConstraintRow[] = [COLUMN_CONSTRAINT, TABLE_CONSTRAINT];

    protected override get dbProvider(): CodeGenDatabaseProvider {
        return { getCheckConstraintsSchemaFilter: () => '' } as unknown as CodeGenDatabaseProvider;
    }
    protected override qs(schema: string, object: string): string {
        return `${schema}.${object}`;
    }
    protected override async runQuery(_pool: CodeGenConnection, sql: string): Promise<CodeGenQueryResult> {
        if (sql.includes('vwEntityFieldsWithCheckConstraints')) {
            return { recordset: this.constraints } as unknown as CodeGenQueryResult;
        }
        if (sql.includes('vwEntityFields')) {
            return { recordset: [{ ID: 'field-end-date', Type: 'datetime', IsPrimaryKey: false }] } as unknown as CodeGenQueryResult;
        }
        return { recordset: [] } as unknown as CodeGenQueryResult;
    }
    protected override async manageJSONCheckValidators(): Promise<void> {
        // JSON @CHECK validators have their own suite; out of scope here.
    }
    public run(skipDBUpdate: boolean): Promise<boolean> {
        return this.manageEntityFieldValuesAndValidatorFunctions(POOL, [], USER, skipDBUpdate);
    }
}

describe('manageEntityFieldValuesAndValidatorFunctions: persisted validators under --no-ai', () => {
    let runValidationGeneration: ReturnType<typeof vi.fn<RunValidationGeneration>>;

    beforeEach(() => {
        flags.parseCheckConstraints = false;
        runValidationGeneration = vi.fn<RunValidationGeneration>(async () => undefined);
        const proto = ManageMetadataBase.prototype as unknown as { runValidationGeneration: RunValidationGeneration };
        vi.spyOn(proto, 'runValidationGeneration').mockImplementation(runValidationGeneration);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('load-only with the feature off still loads column- and table-level validators, without generation', async () => {
        await expect(new Testable().run(true)).resolves.toBe(true);

        expect(runValidationGeneration).toHaveBeenCalledTimes(2);
        const rows = runValidationGeneration.mock.calls.map((c) => c[0]);
        expect(rows).toContain(COLUMN_CONSTRAINT);
        expect(rows).toContain(TABLE_CONSTRAINT);
        for (const call of runValidationGeneration.mock.calls) {
            expect(call[2]).toBe(false);
        }
    });

    it('a full run with the feature off neither loads nor generates validators', async () => {
        await expect(new Testable().run(false)).resolves.toBe(true);

        expect(runValidationGeneration).not.toHaveBeenCalled();
    });

    it('a full run with the feature on may generate new validators', async () => {
        flags.parseCheckConstraints = true;

        await expect(new Testable().run(false)).resolves.toBe(true);

        expect(runValidationGeneration).toHaveBeenCalledTimes(2);
        for (const call of runValidationGeneration.mock.calls) {
            expect(call[2]).toBe(true);
        }
    });
});
