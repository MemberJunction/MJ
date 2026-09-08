/**
 * layered-base-views.checks.ts — the 'layered-base-views' bundle (LBV1–LBV6).
 *
 * Proves the LAYERED base view arrangement against a live database, rather than against a
 * hand-built `EntityInfo`. When `Entity.GeneratedBaseViewName` is set, CodeGen writes its full
 * generated view under THAT name and the application owns `BaseView`, wrapping it as
 * `SELECT g.*, <extras> FROM <inner> g`.
 *
 * WHY THIS BUNDLE EXISTS. The unit tests assert what CodeGen *emits*; they cannot assert what
 * actually ends up in a database after migrate + codegen. The two failure modes that matter are
 * both invisible to emission-level tests:
 *
 *   · CodeGen overwriting the application's hand-written outer view — destroying SQL nobody
 *     re-reads until it is far too late.
 *   · The outer view failing to inherit a column the inner view generates, which is the exact
 *     silent staleness layering exists to eliminate: the column is ABSENT, not wrong, so nothing
 *     errors and no other test notices.
 *
 * ── TRANSPORT: SERVER (documented exception) ────────────────────────────────────────────────
 * Takes the same documented exception as `metadata-consistency`: `sys.objects` / `sys.columns` /
 * `sys.sql_modules` have no client surface, and "which physical columns does this view expose"
 * cannot be asked over the wire. LBV6 deliberately goes back through `RunView` so at least one
 * check proves the inherited column is reachable by ordinary client-facing data access, not just
 * present in the catalog.
 *
 * ── PLATFORM ────────────────────────────────────────────────────────────────────────────────
 * Catalog inspection (LBV2–LBV5) runs on BOTH platforms: `sys.columns` / `sys.sql_modules` via
 * `ctx.Pool` on SQL Server, `pg_catalog` via the provider's `ExecuteSQL` on PostgreSQL. They skip
 * only when neither seam is reachable. LBV1 and LBV6 are metadata + `RunView` and run everywhere.
 *
 * These checks previously skipped on PostgreSQL — and a skipped check still scores 1.0 and counts
 * as passed, so the bundle reported 6/6 / 100% while only two of six ran. LBV5 was among the
 * silent ones, which is the one that matters most here: PostgreSQL freezes `g.*` at CREATE VIEW,
 * so an outer view silently failing to inherit a new inner column is a PG-only failure mode.
 *
 * ── CHECKS ──────────────────────────────────────────────────────────────────────────────────
 *   LBV1 layering metadata is coherent (BaseViewGenerated=0, names differ, EntityInfo agrees)
 *   LBV2 both views physically exist, as distinct objects
 *   LBV3 the outer view actually selects FROM the inner one — i.e. it is a wrapper
 *   LBV4 CodeGen did not overwrite the outer view (it carries no generated banner)
 *   LBV5 every inner-view column is inherited by the outer view
 *   LBV6 a CodeGen-generated column that is NOT a base-table column reaches the public surface,
 *        is registered as a virtual EntityField, and is queryable through RunView
 */
import type { EntityInfo } from '@memberjunction/core';
import { RunView } from '@memberjunction/core';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Every entity in live metadata that declares a layered base view. */
function layeredEntities(ctx: IntegrationCheckContext): EntityInfo[] {
    return ctx.Provider.Entities.filter(e => e.HasLayeredBaseView);
}

/**
 * The layered entities, asserting the set is non-empty.
 *
 * Anti-vacuity matters more than usual here: every check iterates this set, so an empty one would
 * make the whole bundle pass while proving nothing. MJ core ships layered entities as of v6.1, so
 * an empty set is a real failure on any platform.
 */
function requireLayered(ctx: IntegrationCheckContext): EntityInfo[] {
    const entities = layeredEntities(ctx);
    Assert(entities.length > 0,
        'no entities declare GeneratedBaseViewName — MJ core ships layered entities as of v6.1, so an empty set means metadata did not load or the layering metadata was lost');
    return entities;
}

/**
 * Structural view of the run provider's raw-SQL seam.
 *
 * `IMetadataProvider` does not declare either member — both concrete database providers do
 * (`ExecuteSQL` is the shared seam `UserCache` already relies on to serve SQL Server and
 * PostgreSQL from one code path). Declared narrowly here rather than widening the interface,
 * and rather than reaching for `any`.
 */
interface CatalogQueryProvider {
    PlatformKey?: string;
    ExecuteSQL?<T>(query: string): Promise<T[]>;
}

/** Which catalog dialect this run can interrogate, and how to reach it. */
type CatalogAccess =
    | { kind: 'sqlserver' }
    | { kind: 'postgresql'; run: <T>(query: string) => Promise<T[]> };

/**
 * How this run reaches the physical catalog, or null when it cannot.
 *
 * SQL Server keeps its original `ctx.Pool` + `sys.*` path untouched. PostgreSQL goes through the
 * provider's `ExecuteSQL` against `pg_catalog`, so LBV2-LBV5 assert on PG rather than skipping.
 *
 * That they skipped was not a cosmetic gap: a skipped check still scored 1.0 and counted as
 * passed, so IT69 reported 6/6 / 100% on PostgreSQL while only LBV1 and LBV6 ran - including
 * LBV5, which is precisely the silent-staleness failure PostgreSQL has and SQL Server does not.
 */
function catalogAccess(ctx: IntegrationCheckContext): CatalogAccess | null {
    if (ctx.Pool) {
        return { kind: 'sqlserver' };
    }
    const provider = ctx.Provider as unknown as CatalogQueryProvider;
    if (provider?.PlatformKey === 'postgresql' && typeof provider.ExecuteSQL === 'function') {
        const execute = provider.ExecuteSQL.bind(provider);
        return { kind: 'postgresql', run: execute };
    }
    return null;
}

/**
 * The layered entities, or null when this run genuinely cannot reach any catalog.
 *
 * The skip is logged with the provider name so a green result is never mistaken for a real one.
 */
function catalogOrSkip(ctx: IntegrationCheckContext, checkId: string): EntityInfo[] | null {
    if (!catalogAccess(ctx)) {
        const providerName = ctx.Provider?.constructor?.name ?? 'unknown';
        console.log(`      → ${checkId} SKIPPED (no assertions ran): no catalog access on this run path (provider '${providerName}')`);
        return null;
    }
    return requireLayered(ctx);
}

/** Single-quote escape for an identifier interpolated into a catalog query as a literal. */
function sqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
}

/** Physical column names for a view, lowercased. Empty set when the object does not exist. */
async function viewColumns(ctx: IntegrationCheckContext, schema: string, view: string): Promise<Set<string>> {
    const access = catalogAccess(ctx);
    if (access?.kind === 'postgresql') {
        const rows = await access.run<{ name: string }>(
            `SELECT a.attname AS "name"
               FROM pg_attribute a
               JOIN pg_class c ON c.oid = a.attrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = '${sqlLiteral(schema)}'
                AND c.relname = '${sqlLiteral(view)}'
                AND a.attnum > 0
                AND NOT a.attisdropped`
        );
        return new Set(rows.map(r => String(r.name).toLowerCase()));
    }
    const result = await ctx.Pool!.request().query(
        `SELECT c.name FROM sys.columns c
         WHERE c.object_id = OBJECT_ID('[${schema}].[${view}]')`
    );
    return new Set(result.recordset.map((r: { name: string }) => r.name.toLowerCase()));
}

/**
 * The SQL text of a view, or null when it does not exist.
 *
 * PostgreSQL uses `pg_get_viewdef`, not `information_schema.views`: the latter is portable but
 * SQL Server truncates `VIEW_DEFINITION` at 4000 characters, and the FROM clause LBV3 looks for
 * sits at the end of the definition - exactly what truncation would drop.
 */
async function viewDefinition(ctx: IntegrationCheckContext, schema: string, view: string): Promise<string | null> {
    const access = catalogAccess(ctx);
    if (access?.kind === 'postgresql') {
        const rows = await access.run<{ definition: string | null }>(
            `SELECT pg_get_viewdef(to_regclass('"${schema.replace(/"/g, '""')}"."${view.replace(/"/g, '""')}"'), true) AS "definition"`
        );
        const definition = rows.length > 0 ? rows[0].definition : null;
        return definition ? String(definition) : null;
    }
    const result = await ctx.Pool!.request().query(
        `SELECT m.definition FROM sys.sql_modules m
         WHERE m.object_id = OBJECT_ID('[${schema}].[${view}]')`
    );
    return result.recordset.length > 0 ? (result.recordset[0].definition as string) : null;
}

export const LayeredBaseViewChecks: NamedCheck[] = [
    {
        Id: 'layered-base-views.LBV1',
        Name: 'LBV1: layering metadata is coherent — BaseViewGenerated=0, distinct names, EntityInfo agrees',
        Fn: async (ctx): Promise<void> => {
            const entities = requireLayered(ctx);

            for (const e of entities) {
                // BaseViewGenerated=1 with an inner name is refused by a CHECK constraint, because
                // generation gates on `BaseViewGenerated || HasLayeredBaseView` while the outer
                // view's refresh and GRANTs gate on `!BaseViewGenerated` — the two would disagree
                // and leave the public surface ungranted and unrefreshed.
                AssertEqual(e.BaseViewGenerated, false,
                    `${e.Name}: BaseViewGenerated must be 0 when GeneratedBaseViewName is set`);
                Assert(!!e.BaseView && e.BaseView.trim().length > 0,
                    `${e.Name}: BaseView must be set — layering needs a public view to layer onto`);
                Assert(e.GeneratedViewName.toLowerCase() !== e.BaseView.toLowerCase(),
                    `${e.Name}: inner and outer view names must differ — a view cannot select from itself`);
                // GeneratedViewName is the single resolution of "which view does CodeGen write";
                // if it ever disagreed with the raw column the view would land somewhere nothing reads.
                AssertEqual(e.GeneratedViewName, e.GeneratedBaseViewName!.trim(),
                    `${e.Name}: GeneratedViewName must resolve to the declared inner view name`);
            }
            console.log(`      → ${entities.length} layered entit${entities.length === 1 ? 'y' : 'ies'}: ${entities.map(e => e.Name).join(', ')}`);
        }
    },
    {
        Id: 'layered-base-views.LBV2',
        Name: 'LBV2: both the inner and outer views physically exist as distinct objects',
        Fn: async (ctx): Promise<void> => {
            const entities = catalogOrSkip(ctx, 'LBV2');
            if (!entities) return;

            for (const e of entities) {
                const inner = await viewColumns(ctx, e.SchemaName, e.GeneratedViewName);
                const outer = await viewColumns(ctx, e.SchemaName, e.BaseView);
                Assert(inner.size > 0,
                    `${e.Name}: inner view [${e.SchemaName}].[${e.GeneratedViewName}] does not exist — CodeGen never wrote it, or its DDL never reached this environment`);
                Assert(outer.size > 0,
                    `${e.Name}: outer view [${e.SchemaName}].[${e.BaseView}] does not exist — the application-owned wrapper was never created`);
            }
            console.log(`      → inner + outer views present for all ${entities.length} layered entities`);
        }
    },
    {
        Id: 'layered-base-views.LBV3',
        Name: 'LBV3: the outer view selects FROM the inner view — it is genuinely a wrapper',
        Fn: async (ctx): Promise<void> => {
            const entities = catalogOrSkip(ctx, 'LBV3');
            if (!entities) return;

            for (const e of entities) {
                const def = await viewDefinition(ctx, e.SchemaName, e.BaseView);
                Assert(def !== null, `${e.Name}: no definition for [${e.SchemaName}].[${e.BaseView}]`);
                Assert(def!.toLowerCase().includes(e.GeneratedViewName.toLowerCase()),
                    `${e.Name}: outer view does not reference ${e.GeneratedViewName} — it is not wrapping the generated view, so nothing underneath it regenerates`);
            }
            console.log(`      → every outer view references its inner view`);
        }
    },
    {
        Id: 'layered-base-views.LBV4',
        Name: 'LBV4: CodeGen has not overwritten the application-owned outer view',
        Fn: async (ctx): Promise<void> => {
            const entities = catalogOrSkip(ctx, 'LBV4');
            if (!entities) return;

            for (const e of entities) {
                const outer = await viewDefinition(ctx, e.SchemaName, e.BaseView);
                const inner = await viewDefinition(ctx, e.SchemaName, e.GeneratedViewName);
                Assert(outer !== null && inner !== null, `${e.Name}: both view definitions must exist`);
                // The generated view selects from the BASE TABLE. If the outer view did too, CodeGen
                // has replaced the wrapper with a generated view under the public name — hand-written
                // SQL destroyed, and nothing would error until somebody looked.
                const outerSelectsBaseTable = new RegExp(`\\[${e.BaseTable}\\]|"${e.BaseTable}"|\\b${e.BaseTable}\\b\\s+AS\\b`, 'i').test(outer!);
                Assert(!outerSelectsBaseTable || outer!.toLowerCase().includes(e.GeneratedViewName.toLowerCase()),
                    `${e.Name}: outer view [${e.BaseView}] reads the base table directly and does not reference the inner view — it looks like CodeGen overwrote the application's wrapper`);
                Assert(inner!.toLowerCase().includes(e.BaseTable.toLowerCase()),
                    `${e.Name}: inner view should select from the base table ${e.BaseTable}`);
            }
            console.log(`      → no outer view shows signs of being overwritten by CodeGen`);
        }
    },
    {
        Id: 'layered-base-views.LBV5',
        Name: 'LBV5: every inner-view column is inherited by the outer view',
        Fn: async (ctx): Promise<void> => {
            const entities = catalogOrSkip(ctx, 'LBV5');
            if (!entities) return;

            for (const e of entities) {
                const inner = await viewColumns(ctx, e.SchemaName, e.GeneratedViewName);
                const outer = await viewColumns(ctx, e.SchemaName, e.BaseView);
                const missing = [...inner].filter(c => !outer.has(c));
                AssertEqual(missing.length, 0,
                    `${e.Name}: ${missing.length} column(s) generated by the inner view never reach BaseView (${missing.slice(0, 5).join(', ')}) — the wrapper is not doing SELECT g.*, so newly generated columns silently disappear`);
            }
            console.log(`      → every inner-view column reaches the public surface`);
        }
    },
    {
        Id: 'layered-base-views.LBV6',
        Name: 'LBV6: a CodeGen-generated column reaches the public surface and is queryable via RunView',
        Fn: async (ctx): Promise<void> => {
            const entities = requireLayered(ctx);

            // The whole promise of layering, stated as an assertion: a related-entity DISPLAY field
            // — a column only CodeGen produces, from a join the custom layer never wrote — is
            // visible through the application's wrapper and usable like any other field. On a fully
            // custom view, adding one meant hand-editing SQL, and when nobody did, the column was
            // simply absent forever.
            //
            // Derived from METADATA rather than sys.columns, deliberately: this is the check that
            // matters most, so it must not be the one that silently skips when a run path provides
            // no mssql pool. The identification follows CodeGen's own convention — foreign key
            // `XxxID` yields a virtual display field `Xxx`.
            let proven = 0;
            for (const e of entities) {
                const displayFields = e.Fields
                    .filter(f => f.RelatedEntityID && f.Name.length > 2 && f.Name.toUpperCase().endsWith('ID'))
                    .map(f => f.Name.slice(0, -2))
                    .filter(base => e.Fields.some(v => v.Name.toLowerCase() === base.toLowerCase() && v.IsVirtual));

                if (displayFields.length === 0) {
                    continue; // no FK-derived display field on this entity — nothing to prove here
                }

                for (const col of displayFields) {
                    const field = e.Fields.find(f => f.Name.toLowerCase() === col.toLowerCase())!;
                    Assert(field.IsVirtual,
                        `${e.Name}: '${col}' should be a virtual field — it comes from a join, not the base table`);
                }

                // Reachable by ordinary client-facing data access, not merely present in metadata.
                // RunView selects THROUGH BaseView, so success proves the generated column actually
                // survived the wrapper. Asserted on Success rather than on rows, since a freshly
                // installed database legitimately has none.
                const rv = new RunView();
                const result = await rv.RunView({
                    EntityName: e.Name,
                    Fields: ['ID', ...displayFields],
                    MaxRows: 1,
                    ResultType: 'simple',
                }, ctx.User);
                Assert(result.Success,
                    `${e.Name}: RunView failed selecting generated display column(s) ${displayFields.join(', ')} through BaseView — ${result.ErrorMessage}`);
                proven++;
                console.log(`      → ${e.Name}: inherits generated display column(s) ${displayFields.join(', ')}; RunView selects them through BaseView`);
            }

            Assert(proven > 0,
                'no layered entity exposes a CodeGen-generated related-entity display field — the arrangement is in place but nothing proves it delivers a column the custom layer did not write itself');
        }
    }
];

for (const check of LayeredBaseViewChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
