import { describe, it, expect, beforeEach } from 'vitest';
import { SQLServerCodeGenProvider } from '../SQLServerCodeGenProvider';
import { EntityInfo } from '@memberjunction/core';
import type { BaseViewGenerationContext } from '../../../codeGenDatabaseProvider';

/**
 * Layered base views — CodeGen writes the INNER view, the application owns the outer one.
 *
 * `BaseViewGenerated = 0` used to be all-or-nothing: an application wanting one computed column
 * inherited the whole generated view and had to hand-maintain every related-entity display join
 * forever. A foreign key added later then silently never appeared. `GeneratedBaseViewName` keeps
 * CodeGen generating underneath a thin custom layer.
 *
 * What matters here is that the emitted DDL targets the INNER name. If it ever targeted the outer
 * one, CodeGen would overwrite the application's view — destroying hand-written SQL on the next
 * routine codegen run, which is about the worst outcome this feature could have.
 */
function entity(over: Record<string, unknown> = {}): EntityInfo {
    return new EntityInfo({
        ID: 'entity-1',
        Name: 'Order Headers',
        SchemaName: 'orders',
        BaseTable: 'OrderHeader',
        BaseTableCodeName: 'OrderHeader',
        BaseView: 'vwOrderHeaders',
        BaseViewGenerated: true,
        DeleteType: 'Hard',
        EntityFields: [
            {
                ID: 'pk-1',
                Name: 'ID',
                Type: 'uniqueidentifier',
                Length: 16,
                IsPrimaryKey: true,
                AllowsNull: false,
                AllowUpdateAPI: true,
                IsVirtual: false,
                AutoIncrement: false,
            },
        ],
        ...over,
    });
}

function context(e: EntityInfo): BaseViewGenerationContext {
    return {
        entity: e,
        relatedFieldsSelect: '',
        relatedFieldsJoins: '',
        parentFieldsSelect: '',
        parentJoins: '',
        rootFieldsSelect: '',
        rootJoins: '',
    } as BaseViewGenerationContext;
}

describe('SQLServerCodeGenProvider.generateBaseView with a layered entity', () => {
    let provider: SQLServerCodeGenProvider;

    beforeEach(() => {
        provider = new SQLServerCodeGenProvider();
    });

    it('creates the view under BaseView when nothing is layered', () => {
        const sql = provider.generateBaseView(context(entity()));
        expect(sql).toContain('CREATE VIEW [orders].[vwOrderHeaders]');
    });

    it('creates the view under the INNER name when one is given', () => {
        const sql = provider.generateBaseView(
            context(entity({ BaseViewGenerated: false, GeneratedBaseViewName: 'vwOrderHeadersGenerated' })),
        );
        expect(sql).toContain('CREATE VIEW [orders].[vwOrderHeadersGenerated]');
    });

    it('NEVER writes the application-owned outer view', () => {
        // The failure this exists to prevent: a routine codegen run silently replacing hand-written
        // SQL. Asserted as an absence, because the damage is invisible until somebody reads the view.
        const sql = provider.generateBaseView(
            context(entity({ BaseViewGenerated: false, GeneratedBaseViewName: 'vwOrderHeadersGenerated' })),
        );
        expect(sql).not.toContain('CREATE VIEW [orders].[vwOrderHeaders]\n');
        expect(sql).not.toContain('DROP VIEW [orders].[vwOrderHeaders];');
    });

    it('drops and recreates only the inner view', () => {
        const sql = provider.generateBaseView(
            context(entity({ BaseViewGenerated: false, GeneratedBaseViewName: 'vwOrderHeadersGenerated' })),
        );
        expect(sql).toContain("OBJECT_ID('[orders].[vwOrderHeadersGenerated]', 'V')");
    });

    it('still selects from the base TABLE, not from the outer view', () => {
        // The inner view is the one doing the real work; if it read the outer view the two would be
        // mutually recursive.
        const sql = provider.generateBaseView(
            context(entity({ BaseViewGenerated: false, GeneratedBaseViewName: 'vwOrderHeadersGenerated' })),
        );
        expect(sql).toContain('[orders].[OrderHeader]');
    });

    it('is unaffected when the inner name equals BaseView', () => {
        // Equal names are not a layering — a view cannot select from itself. `HasLayeredBaseView`
        // rejects it, so generation targets BaseView exactly as it always did.
        const sql = provider.generateBaseView(context(entity({ GeneratedBaseViewName: 'vwOrderHeaders' })));
        expect(sql).toContain('CREATE VIEW [orders].[vwOrderHeaders]');
    });

    it('is unaffected when the inner name differs from BaseView only by case', () => {
        // SQL Server object names are case-insensitive, so this is still the same object and still
        // not a layering. Generation must target BaseView with its ORIGINAL casing — writing the
        // uppercased string would be the same object here but an orphan on a case-sensitive dialect.
        const sql = provider.generateBaseView(context(entity({ GeneratedBaseViewName: 'VWORDERHEADERS' })));
        expect(sql).toContain('CREATE VIEW [orders].[vwOrderHeaders]');
        expect(sql).not.toContain('[VWORDERHEADERS]');
    });
});

/**
 * The bootstrap pass — the one CodeGen run where the application-owned outer view does not exist.
 *
 * Enabling layering has an unavoidable ordering: the outer view selects from the inner view, so it
 * cannot be created until CodeGen has written the inner one. That means the very run that sets the
 * arrangement up necessarily executes against a missing outer view. Unguarded, its `sp_refreshview`
 * and `GRANT` both fail — and the step they fail on is the documented setup procedure itself, so
 * layering could never be adopted at all.
 */
describe('refresh and permissions for an application-owned base view', () => {
    let provider: SQLServerCodeGenProvider;

    beforeEach(() => {
        provider = new SQLServerCodeGenProvider();
    });

    it('guards the wrapped SQL on the view existing', () => {
        const sql = provider.generateIfViewExistsSQL('orders', 'vwOrderHeaders', "EXEC sp_refreshview 'orders.vwOrderHeaders';");
        expect(sql).toContain("IF OBJECT_ID('[orders].[vwOrderHeaders]', 'V') IS NOT NULL");
        expect(sql).toContain('sp_executesql');
    });

    it('blocks and terminates the guard so concatenated statements stay outside it', () => {
        // recompileAllBaseViews appends these into one script with no separator between entries. A
        // bare single-statement IF would leave whatever follows looking like the guarded statement
        // to a reader, and the next entry butted onto the same line.
        const guarded = provider.generateIfViewExistsSQL('orders', 'vwOrderHeaders', "EXEC sp_refreshview 'orders.vwOrderHeaders';");
        expect(guarded).toContain('BEGIN');
        expect(guarded).toContain('END');
        expect(guarded.endsWith('\n')).toBe(true);

        const script = guarded + provider.generateViewRefreshSQL('orders', 'vwOther');
        expect(script).toContain("END\nEXEC sp_refreshview 'orders.vwOther';");
    });

    it('escapes quotes so the wrapped statement survives the string literal', () => {
        // sp_refreshview takes a quoted name, so the guarded body always contains quotes. Leaving
        // them unescaped would terminate the N'...' literal early and emit a syntax error.
        const sql = provider.generateIfViewExistsSQL('orders', 'vwOrderHeaders', "EXEC sp_refreshview 'orders.vwOrderHeaders';");
        expect(sql).toContain("EXEC sp_refreshview ''orders.vwOrderHeaders'';");
        expect(sql).not.toContain("N'EXEC sp_refreshview 'orders");
    });
});
