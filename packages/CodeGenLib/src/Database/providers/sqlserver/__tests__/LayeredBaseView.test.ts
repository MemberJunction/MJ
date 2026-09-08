import { describe, it, expect, beforeEach } from 'vitest';
import { SQLServerCodeGenProvider } from '../SQLServerCodeGenProvider';
import { SQLCodeGenBase } from '../../../sql_codegen';
import { EntityInfo } from '@memberjunction/core';
import type { BaseViewGenerationContext, CodeGenConnection } from '../../../codeGenDatabaseProvider';

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

/**
 * STEP 4.5 — the refresh statements CodeGen writes into the MIGRATION LOG, which is the SQL that
 * runs on staging and production rather than on the dev box.
 *
 * A layered entity has `BaseViewGenerated = 0`, so it qualifies as a "custom base view" entity here
 * alongside genuinely hand-written ones. The two are not interchangeable: for a fully custom view
 * the object is a standing prerequisite and a missing one should fail loudly, while a layered
 * entity's outer view legitimately does not exist during the bootstrap pass. Emitting an unguarded
 * refresh for both treats the bootstrap case as an error — and the run it breaks is the documented
 * setup procedure.
 */
class RefreshProbe extends SQLCodeGenBase {
    public build(entities: EntityInfo[]): string {
        return this.buildCustomBaseViewRefreshSQL(entities);
    }
}

describe('sp_refreshview emitted into the migration log', () => {
    let probe: RefreshProbe;

    beforeEach(() => {
        probe = new RefreshProbe();
        probe.DBProvider = new SQLServerCodeGenProvider();
    });

    const layered = (): EntityInfo =>
        entity({ BaseViewGenerated: false, GeneratedBaseViewName: 'vwOrderHeadersGenerated' });

    it('refreshes the INNER view before the outer one', () => {
        // The outer view selects `g.*` and caches its column list, so it must never be re-resolved
        // against a stale inner. Asserted by position, since both statements name a view and a
        // substring check alone would pass with the order reversed. The two anchors are chosen to
        // be unambiguous: 'vwOrderHeaders' is a prefix of 'vwOrderHeadersGenerated', and the outer
        // refresh is nested inside sp_executesql with its quotes doubled.
        const sql = probe.build([layered()]);
        const inner = sql.indexOf("sp_refreshview 'orders.vwOrderHeadersGenerated'");
        const outer = sql.indexOf("OBJECT_ID('[orders].[vwOrderHeaders]'");
        expect(inner).toBeGreaterThan(-1);
        expect(outer).toBeGreaterThan(-1);
        expect(inner).toBeLessThan(outer);
    });

    it('guards the outer refresh on the application-owned view existing', () => {
        const sql = probe.build([layered()]);
        expect(sql).toContain("IF OBJECT_ID('[orders].[vwOrderHeaders]', 'V') IS NOT NULL");
    });

    it('leaves a fully custom base view unguarded and unchanged', () => {
        // Not a layering, so there is no inner view and no bootstrap window. A missing view here is
        // a real misconfiguration and must stay a loud failure rather than a silent skip.
        const sql = probe.build([entity({ BaseViewGenerated: false })]);
        expect(sql).toContain("EXEC sp_refreshview 'orders.vwOrderHeaders';");
        expect(sql).not.toContain('OBJECT_ID');
    });
});

/**
 * The GRANTs CodeGen emits alongside a generated base view.
 *
 * `generateViewPermissions` grants on `entity.BaseView` — the PUBLIC view. For an ordinary entity
 * that is the same object the view DDL just created, so the two travel together harmlessly. For a
 * LAYERED entity they are DIFFERENT objects, and the public one may not exist: the documented setup
 * is "name the inner view -> run CodeGen -> then create BaseView", so the bootstrap pass necessarily
 * grants against a view that is not there yet. Unguarded, that pass fails on the one run meant to
 * enable the feature.
 *
 * Both assertions below were red before the guard was added, and the third exists because the fix
 * initially broke the formatting: `generateViewPermissions` returns a string with a LEADING NEWLINE,
 * and wrapping it verbatim pulled that newline inside the sp_executesql literal, emitting `GOIF
 * OBJECT_ID` — the batch separator fused to the next statement, which is a syntax error rather than
 * anything a substring assertion would notice.
 */
const stubConnection: CodeGenConnection = {
    // Only reachable for entities with related-entity join fields; the fixtures here have none, so
    // every method throws rather than silently returning something that could mask a real query.
    get Dialect(): never { throw new Error('stubConnection: Dialect must not be read in these tests'); },
    query: () => { throw new Error('stubConnection: query() must not be called in these tests'); },
    queryWithParams: () => { throw new Error('stubConnection: queryWithParams() must not be called'); },
    executeStoredProcedure: () => { throw new Error('stubConnection: executeStoredProcedure() must not be called'); },
    beginTransaction: () => { throw new Error('stubConnection: beginTransaction() must not be called'); },
};

class PermissionsProbe extends SQLCodeGenBase {
    public pieces(e: EntityInfo): Promise<{ viewSQL: string; viewPermSQL: string }> {
        return this.generateBaseViewPieces(stubConnection, e);
    }
    public wholeView(e: EntityInfo): Promise<string> {
        return this.generateBaseView(stubConnection, e);
    }
}

describe('base view permissions for a layered entity', () => {
    let probe: PermissionsProbe;

    beforeEach(() => {
        probe = new PermissionsProbe();
        probe.DBProvider = new SQLServerCodeGenProvider();
    });

    /** The fixture entity carries one role so `generateViewPermissions` emits something. */
    const withRole = (over: Record<string, unknown> = {}): EntityInfo =>
        entity({ EntityPermissions: [{ RoleSQLName: 'cdp_UI' }], ...over });

    const layered = (): EntityInfo =>
        withRole({ BaseViewGenerated: false, GeneratedBaseViewName: 'vwOrderHeadersGenerated' });

    it('guards the GRANT on the application-owned view existing', async () => {
        const { viewPermSQL } = await probe.pieces(layered());
        expect(viewPermSQL).toContain("IF OBJECT_ID('[orders].[vwOrderHeaders]', 'V') IS NOT NULL");
        expect(viewPermSQL).toContain('GRANT SELECT ON [orders].[vwOrderHeaders]');
    });

    it('keeps the batch separator on its own line', async () => {
        // The view DDL ends in `GO`. If the guard swallows the leading newline the emitted script
        // reads `GOIF OBJECT_ID(...)`, which SQL Server cannot parse — and which every
        // "does it contain the guard" assertion would still pass.
        const sql = await probe.wholeView(layered());
        expect(sql).not.toContain('GOIF');
        expect(sql).toContain("GO\nIF OBJECT_ID('[orders].[vwOrderHeaders]', 'V') IS NOT NULL");
    });

    it('leaves a NON-layered entity byte-identical', async () => {
        // The guard must not reformat the ordinary path, or every entity in the repo regenerates.
        const { viewPermSQL } = await probe.pieces(withRole());
        expect(viewPermSQL).toBe('\nGRANT SELECT ON [orders].[vwOrderHeaders] TO [cdp_UI]');
        expect(viewPermSQL).not.toContain('OBJECT_ID');
    });

    it('emits nothing at all when the entity has no roles', async () => {
        // An empty permissions string must stay empty rather than becoming an empty guarded block.
        const { viewPermSQL } = await probe.pieces(
            entity({ BaseViewGenerated: false, GeneratedBaseViewName: 'vwOrderHeadersGenerated' }),
        );
        expect(viewPermSQL.trim()).toBe('');
    });
});
