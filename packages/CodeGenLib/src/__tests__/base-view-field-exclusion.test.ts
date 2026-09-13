/**
 * KEEPING A COLUMN OUT OF A BASE VIEW, and the interlock that makes it safe.
 *
 * A base view is what every read goes through, and both providers emit `SELECT alias.*` — so a
 * column no component reads is still fetched and held on every `RunView`, every `Load`, every grid.
 * Measured on one integration mirror: a single JSON bookkeeping column was 52-70% of the table's
 * stored bytes (96 MB of one table's 137 MB) and nothing read it.
 *
 * There is no column list to filter, so excluding a column means ENUMERATING columns. Three
 * properties make that shippable rather than a system-wide rewrite, and all three are pinned here:
 *
 *  1. `alias.*` UNLESS something is actually excluded. With the default (empty) config, every base
 *     view in every tenant is byte-identical to before — this is the golden-master guard.
 *  2. Exclusions are DISABLED until something explicitly permits them. The permission depends on a
 *     database fact (see 3), and the default must be the safe one.
 *  3. The interlock. CodeGen's own field prune asks "is this column in the base VIEW?" — the catalog
 *     view resolves columns view-first on both dialects — so an excluded column's `EntityField` row
 *     looks orphaned and gets DELETED on the next run. Verified against live PostgreSQL 16: the row
 *     is deleted without the protected list and survives with it. So the exclusion is only honoured
 *     where the prune can be told to leave that metadata alone.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('mssql', () => ({}));

import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import {
    excludedBaseViewFieldNames,
    setBaseViewExclusionsPermitted,
    resetBaseViewExclusionsPermitted,
    baseViewExclusionsPermitted,
} from '../Database/codeGenDatabaseProvider';
import type { BaseViewGenerationContext } from '../Database/codeGenDatabaseProvider';
import { buildHealSchemaRoutineParams } from '../Database/heal-schema-params';
import { configInfo } from '../Config/config';
import { EntityInfo } from '@memberjunction/core';

function field(name: string, sequence: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: `f-${name}`, Name: name, Type: 'nvarchar', Length: 100, Sequence: sequence,
        IsPrimaryKey: false, IsVirtual: false, AllowsNull: true, AutoIncrement: false,
        RelatedEntityID: null, ...extra,
    };
}

const SNAPSHOT = '__mj_integration_LastSyncedSnapshot';

function invoices(): EntityInfo {
    return new EntityInfo({
        ID: 'e-1', Name: 'Invoices', SchemaName: 'app', BaseTable: 'Invoice',
        BaseTableCodeName: 'Invoice', BaseView: 'vwInvoices', VirtualEntity: false,
        EntityFields: [
            field('ID', 1, { IsPrimaryKey: true, Type: 'uniqueidentifier' }),
            field('Number', 2),
            field('Total', 3),
            field(SNAPSHOT, 4),
            field('CustomerName', 5, { IsVirtual: true }),
        ],
    });
}

const emptyContext = (entity: EntityInfo): BaseViewGenerationContext => ({
    entity, relatedFieldsSelect: '', relatedFieldsJoins: '',
    parentFieldsSelect: '', parentJoins: '', rootFieldsSelect: '', rootJoins: '',
});

// configInfo is a module singleton; restore what we change.
let savedExclusions: string[];
beforeEach(() => {
    savedExclusions = configInfo.baseViewExcludedFields ?? [];
    resetBaseViewExclusionsPermitted();
});
afterEach(() => {
    configInfo.baseViewExcludedFields = savedExclusions;
    resetBaseViewExclusionsPermitted();
});

describe('excludedBaseViewFieldNames — matching, and the default-off switch', () => {
    it('is EMPTY until something permits exclusions, however the config is set', () => {
        expect(baseViewExclusionsPermitted()).toBe(false);
        expect(excludedBaseViewFieldNames('Invoices', [SNAPSHOT]).size).toBe(0);
    });

    it('matches a bare field name against every entity, case-insensitively', () => {
        setBaseViewExclusionsPermitted(true);
        expect([...excludedBaseViewFieldNames('Invoices', ['  __MJ_Integration_LastSyncedSnapshot '])])
            .toEqual([SNAPSHOT.toLowerCase()]);
        expect(excludedBaseViewFieldNames('Orders', [SNAPSHOT]).size).toBe(1);
    });

    it('scopes an EntityName.FieldName entry to that entity only', () => {
        setBaseViewExclusionsPermitted(true);
        expect(excludedBaseViewFieldNames('Invoices', [`Invoices.${SNAPSHOT}`]).size).toBe(1);
        expect(excludedBaseViewFieldNames('Orders', [`Invoices.${SNAPSHOT}`]).size).toBe(0);
    });

    it('handles an MJ entity name containing a colon and a space', () => {
        setBaseViewExclusionsPermitted(true);
        expect(excludedBaseViewFieldNames('MJ: Entities', ['MJ: Entities.Description']).size).toBe(1);
        expect(excludedBaseViewFieldNames('MJ: Entity Fields', ['MJ: Entities.Description']).size).toBe(0);
    });

    it('ignores blank entries and a trailing dot', () => {
        setBaseViewExclusionsPermitted(true);
        expect(excludedBaseViewFieldNames('Invoices', ['', '   ']).size).toBe(0);
        // "Invoices." names no field; treated as a bare (unmatchable) name, not a wildcard.
        expect(excludedBaseViewFieldNames('Invoices', ['Invoices.']).has('')).toBe(false);
    });
});

describe('base view emission — the star survives unless something is excluded', () => {
    it('SQL Server emits alias.* with exclusions off', () => {
        configInfo.baseViewExcludedFields = [SNAPSHOT];
        const sql = new SQLServerCodeGenProvider().generateBaseView(emptyContext(invoices()));
        expect(sql).toContain('    i.*');
        expect(sql).not.toContain('[Number]');
    });

    it('SQL Server emits alias.* when exclusions are ON but nothing matches this entity', () => {
        setBaseViewExclusionsPermitted(true);
        configInfo.baseViewExcludedFields = ['Orders.SomethingElse'];
        expect(new SQLServerCodeGenProvider().generateBaseView(emptyContext(invoices()))).toContain('    i.*');
    });

    it('SQL Server enumerates base-table columns, minus the excluded one, in Sequence order', () => {
        setBaseViewExclusionsPermitted(true);
        configInfo.baseViewExcludedFields = [SNAPSHOT];
        const sql = new SQLServerCodeGenProvider().generateBaseView(emptyContext(invoices()));
        expect(sql).not.toContain('i.*');
        expect(sql).not.toContain(SNAPSHOT);
        expect(sql).toContain('i.[ID],\n    i.[Number],\n    i.[Total]');
        // Virtual fields are the view's own joined columns; the caller appends them, so the
        // base-table list must not project them a second time.
        expect(sql).not.toContain('[CustomerName]');
    });

    it('PostgreSQL enumerates the same set with PG quoting', () => {
        setBaseViewExclusionsPermitted(true);
        configInfo.baseViewExcludedFields = [SNAPSHOT];
        const sql = new PostgreSQLCodeGenProvider().generateBaseView(emptyContext(invoices()));
        expect(sql).not.toContain(SNAPSHOT);
        expect(sql).toContain('i."ID"');
        expect(sql).toContain('i."Number"');
    });

    it('falls back to alias.* rather than emitting a zero-column view', () => {
        setBaseViewExclusionsPermitted(true);
        configInfo.baseViewExcludedFields = ['ID', 'Number', 'Total', SNAPSHOT];
        expect(new SQLServerCodeGenProvider().generateBaseView(emptyContext(invoices()))).toContain('    i.*');
    });
});

describe('the prune interlock — protected field names reach the routine call', () => {
    it('omits ProtectedFieldNames entirely when none are protected (EXEC shape unchanged)', () => {
        const p = buildHealSchemaRoutineParams({ authoredExclude: ['sys', 'staging'] });
        expect(p.names).toEqual(['ExcludedSchemaNames']);
    });

    it('appends ProtectedFieldNames last, after the existing parameters', () => {
        const p = buildHealSchemaRoutineParams({
            authoredExclude: ['sys'], entityIDs: ['id-1'], includeSchemas: ['app'],
            protectedFieldNames: [SNAPSHOT],
        });
        expect(p.names).toEqual(['ExcludedSchemaNames', 'EntityIDs', 'IncludedSchemaNames', 'ProtectedFieldNames']);
        expect(p.values[3]).toBe(`'${SNAPSHOT}'`);
    });

    it('renders as a named parameter both dialects accept', () => {
        const p = buildHealSchemaRoutineParams({ authoredExclude: ['sys'], protectedFieldNames: [SNAPSHOT] });
        expect(new SQLServerCodeGenProvider().callRoutineSQL('__mj', 'spDeleteUnneededEntityFields', p.values, p.names))
            .toContain(`@ProtectedFieldNames='${SNAPSHOT}'`);
        expect(new PostgreSQLCodeGenProvider().callRoutineSQL('__mj', 'spDeleteUnneededEntityFields', p.values, p.names))
            .toContain(`p_ProtectedFieldNames => '${SNAPSHOT}'`);
    });

    it('drops blanks and escapes a quote rather than breaking the literal', () => {
        const p = buildHealSchemaRoutineParams({ authoredExclude: ['sys'], protectedFieldNames: ['  ', "Od'd"] });
        expect(p.values[1]).toBe("'Od''d'");
    });
});
