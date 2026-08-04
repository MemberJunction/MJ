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
});
