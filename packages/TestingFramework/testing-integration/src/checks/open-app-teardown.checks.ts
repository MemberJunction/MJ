/**
 * open-app-teardown.checks.ts — the 'open-app-teardown' bundle (OAT1–OAT2): live integration checks
 * for the Open-App metadata teardown seam. Graduated VERBATIM from
 * integration-test-scripts/open-app-teardown-tests.ts (check bodies unchanged; the raw-SQL seed +
 * self-cleaning finally became a shared BundleLifecycle).
 *
 * Codifies the exact scenario the OpenApp PR proved: a *used* app whose entity has an orphaned
 * RecordChange (a NOT-NULL FK to __mj.Entity) plus a link-less, fixed-GUID nav Application. It drives
 * the REAL exported `RemoveAppEntityMetadata` (the `mj app remove` code path) and asserts:
 *   - OAT1: the FK-graph cascade removes ALL of the app's metadata — Entity, EntityField, SchemaInfo,
 *           AND the blocking RecordChange the old hardcoded-list path under-deleted.
 *   - OAT2: the migration-declared, link-less Application is removed (Solution 2) and can be re-created
 *           with the SAME fixed GUID without a PK_Application collision (the reinstall path this unblocks).
 *
 * Server transport only (raw SQL via the SQLServerDataProvider dialect). Deterministic (no model calls).
 * The lifecycle seeds + removes ALL its own throwaway __mj rows.
 */
import { randomUUID } from 'node:crypto';
import type { DatabaseProviderBase } from '@memberjunction/core';
import { RemoveAppEntityMetadata } from '@memberjunction/open-app-engine';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext, OpenAppTeardownFixture } from '../check';

const MJ_SCHEMA = '__mj';

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext): OpenAppTeardownFixture {
    Assert(ctx.OpenAppTeardownFixture != null, 'open-app-teardown fixture missing (bundle Setup did not run)');
    return ctx.OpenAppTeardownFixture!;
}

/**
 * The suite is server-transport only (registered on the "Deterministic" DB tier); ctx.Provider is always
 * a DatabaseProviderBase here. Narrow to it for the dialect-quoted raw-SQL seed/asserts the teardown
 * scenario needs (ExecuteSQL<T> + Dialect are not on the generic IMetadataProvider surface, and it is the
 * exact type RemoveAppEntityMetadata's DatabaseProvider option expects).
 */
function sqlHelpers(ctx: IntegrationCheckContext) {
    const db = ctx.Provider as unknown as DatabaseProviderBase;
    const d = db.Dialect;
    const T = (t: string): string => d.QuoteSchema(MJ_SCHEMA, t);
    const lit = (v: string): string => d.QuoteStringLiteral(v);
    const exec = (sql: string) => db.ExecuteSQL<Record<string, unknown>>(sql);
    const count = async (table: string, where: string): Promise<number> => {
        const rows = await exec(`SELECT COUNT(*) AS n FROM ${T(table)} WHERE ${where}`);
        return rows && rows[0] ? Number(rows[0].n) : 0;
    };
    return { db, T, lit, exec, count };
}

export const OpenAppTeardownChecks: NamedCheck[] = [
    {
        Id: 'open-app-teardown.OAT1',
        Name: 'OAT1: FK-graph teardown clears all metadata incl. the blocking RecordChange',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { AppSchema, EntityID } = fx(ctx);
            const { db, lit, count } = sqlHelpers(ctx);
            const user = ctx.User;

            // sanity: everything seeded
            AssertEqual(await count('Entity', `SchemaName = ${lit(AppSchema)}`), 1, 'seed: 1 entity');
            AssertEqual(await count('RecordChange', `EntityID = ${lit(EntityID)}`), 1, 'seed: 1 recordchange');

            const result = await RemoveAppEntityMetadata(AppSchema, user, undefined, ctx.Provider, {
                DatabaseProvider: db,
                MJCoreSchema: MJ_SCHEMA,
                DeclaredApplicationIds: [fx(ctx).ApplicationID], // link-less nav App → declared-id path (Solution 2)
            });
            Assert(result.Success, `RemoveAppEntityMetadata failed: ${result.ErrorMessage}`);

            AssertEqual(await count('Entity', `SchemaName = ${lit(AppSchema)}`), 0, 'Entity rows cleared');
            AssertEqual(await count('EntityField', `EntityID = ${lit(EntityID)}`), 0, 'EntityField rows cleared');
            AssertEqual(await count('RecordChange', `EntityID = ${lit(EntityID)}`), 0, 'blocking RecordChange cleared');
            AssertEqual(await count('SchemaInfo', `SchemaName = ${lit(AppSchema)}`), 0, 'SchemaInfo cleared');
        }
    },
    {
        Id: 'open-app-teardown.OAT2',
        Name: 'OAT2: link-less Application removed → re-create with same GUID has no PK collision',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { ApplicationID, Tag } = fx(ctx);
            const { T, lit, exec, count } = sqlHelpers(ctx);

            AssertEqual(await count('Application', `ID = ${lit(ApplicationID)}`), 0, 'declared link-less Application removed');
            // Re-insert the SAME fixed GUID — the reinstall path this fix unblocks. Would throw on PK collision.
            await exec(
                `INSERT INTO ${T('Application')} (ID, Name, Path) ` +
                `VALUES (${lit(ApplicationID)}, ${lit(`OA Teardown IT ${Tag}`)}, '/oa-teardown-it')`,
            );
            AssertEqual(await count('Application', `ID = ${lit(ApplicationID)}`), 1, 're-created Application present (no PK collision)');
        }
    }
];

for (const check of OpenAppTeardownChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('open-app-teardown', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const tag = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
        const fixture: OpenAppTeardownFixture = {
            Tag: tag,
            AppSchema: `oa_teardown_it_${tag}`,
            EntityID: randomUUID(),
            FieldID: randomUUID(),
            RecordChangeID: randomUUID(),
            ApplicationID: randomUUID(), // link-less nav Application — fixed for the PK-collision re-create test
        };
        const { T, lit, exec } = sqlHelpers(ctx);
        const user = ctx.User;

        // ── seed a used app: SchemaInfo + Entity + EntityField + a blocking RecordChange + a link-less App ──
        await exec(
            `INSERT INTO ${T('SchemaInfo')} (ID, SchemaName, EntityIDMin, EntityIDMax) ` +
            `VALUES (${lit(randomUUID())}, ${lit(fixture.AppSchema)}, 990000, 990999)`,
        );
        await exec(
            `INSERT INTO ${T('Entity')} (ID, Name, SchemaName, BaseTable, BaseView) ` +
            `VALUES (${lit(fixture.EntityID)}, ${lit(`OA Teardown IT ${tag}: Widget`)}, ${lit(fixture.AppSchema)}, 'Widget', 'vwWidgets')`,
        );
        await exec(
            `INSERT INTO ${T('EntityField')} (ID, EntityID, Sequence, Name, Type) ` +
            `VALUES (${lit(fixture.FieldID)}, ${lit(fixture.EntityID)}, 1, 'ID', 'uniqueidentifier')`,
        );
        // The dependent the old hardcoded list MISSES — a NOT-NULL FK RecordChange.EntityID -> Entity.
        await exec(
            `INSERT INTO ${T('RecordChange')} (ID, EntityID, RecordID, UserID, Type, Source, ChangedAt, ChangesJSON, ChangesDescription, FullRecordJSON, Status, CreatedAt, UpdatedAt) ` +
            `VALUES (${lit(fixture.RecordChangeID)}, ${lit(fixture.EntityID)}, 'widget-1', ${lit(user.ID)}, 'Create', 'Internal', SYSDATETIMEOFFSET(), '{}', 'teardown IT', '{}', 'Complete', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
        );
        await exec(
            `INSERT INTO ${T('Application')} (ID, Name, Path) ` +
            `VALUES (${lit(fixture.ApplicationID)}, ${lit(`OA Teardown IT ${tag}`)}, '/oa-teardown-it')`,
        );

        ctx.OpenAppTeardownFixture = fixture;
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.OpenAppTeardownFixture;
        if (!f) {
            return;
        }
        const { T, lit, exec } = sqlHelpers(ctx);
        // Self-cleaning: remove anything still present (order respects FKs: children before parents).
        const safe = async (sql: string): Promise<void> => { try { await exec(sql); } catch { /* best-effort */ } };
        await safe(`DELETE FROM ${T('RecordChange')} WHERE EntityID = ${lit(f.EntityID)}`);
        await safe(`DELETE FROM ${T('EntityField')} WHERE EntityID = ${lit(f.EntityID)}`);
        await safe(`DELETE FROM ${T('Entity')} WHERE ID = ${lit(f.EntityID)}`);
        await safe(`DELETE FROM ${T('SchemaInfo')} WHERE SchemaName = ${lit(f.AppSchema)}`);
        await safe(`DELETE FROM ${T('Application')} WHERE ID = ${lit(f.ApplicationID)}`);
        ctx.OpenAppTeardownFixture = undefined;
    }
});
