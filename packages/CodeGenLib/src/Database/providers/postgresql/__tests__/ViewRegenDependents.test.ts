/**
 * The PostgreSQL base-view regeneration block's fallback path.
 *
 * When CREATE OR REPLACE VIEW cannot express a shape change (42P16), the block drops the view
 * with CASCADE and replays what the cascade removed. CASCADE removes dependents transitively —
 * views of views, and every function returning any of them — so the capture must be transitive
 * too. It used to capture only DIRECT dependents: regenerating vwTestSuiteRuns restored vwTestRuns
 * but left vwConversations and vwConversationDetails (which select from vwTestRuns), and their
 * CRUD functions, permanently missing on PostgreSQL.
 *
 * Exercised end to end against PostgreSQL during the v6.2.0-edge.2 build (a three-level chain is
 * fully restored); this pins the generated SQL so the transitive walk and the replay order cannot
 * silently regress.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { PostgreSQLCodeGenProvider } from '../PostgreSQLCodeGenProvider';
import type { BaseViewGenerationContext } from '../../../codeGenDatabaseProvider';

function block(): string {
    const entity = new EntityInfo({
        ID: 'e1', Name: 'Widgets', SchemaName: 's1', BaseTable: 'Widget', BaseTableCodeName: 'Widget',
        BaseView: 'vwWidgets', BaseViewGenerated: true, DeleteType: 'Hard',
        EntityFields: [
            { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, AllowsNull: false,
              IsVirtual: false, AllowUpdateAPI: false, AutoIncrement: false, Sequence: 1 },
        ],
    });
    const context = {
        entity, relatedFieldsSelect: '', relatedFieldsJoins: '', parentFieldsSelect: '',
        parentJoins: '', rootFieldsSelect: '', rootJoins: '',
    } as BaseViewGenerationContext;
    return new PostgreSQLCodeGenProvider().generateBaseView(context);
}

describe('PostgreSQL view regeneration: dependents removed by DROP ... CASCADE', () => {
    it('walks view dependents transitively, keeping the longest depth per view', () => {
        const sql = block();
        expect(sql).toContain('WITH RECURSIVE deps(view_oid, depth)');
        expect(sql).toContain('JOIN pg_depend d ON d.refobjid = deps.view_oid');
        expect(sql).toContain('SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid');
    });

    it('captures functions of every dropped view, not only the target', () => {
        const sql = block();
        expect(sql).toContain('c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)');
        expect(sql).toContain('pp.prorettype = c.reltype');
    });

    it('replays dependent views shallowest first, then the functions', () => {
        const sql = block();
        const views = sql.indexOf('FROM _vw_regen_deps ORDER BY depth, view_name LOOP');
        const fns = sql.indexOf('FROM _vw_regen_fn_deps LOOP');
        expect(views).toBeGreaterThan(-1);
        expect(fns).toBeGreaterThan(views);
    });
});
