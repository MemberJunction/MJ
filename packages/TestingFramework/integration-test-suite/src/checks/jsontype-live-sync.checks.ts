/**
 * jsontype-live-sync.checks.ts — the 'jsontype-live-sync' (server) and 'jsontype-live-sync-client'
 * (GraphQL wire) bundles, JL1–JL9: live-database proof that a JSONType field's typed object accessor
 * is a LIVE view of the raw field.
 *
 * WHAT IS BEING PROVEN. The accessor is backed by BaseEntity.GetJSONFieldObject /
 * SetJSONFieldObject (JSONFieldBinding). Unit tests prove the binding against a stub provider; only a
 * real database can prove the whole loop: edit a nested value IN PLACE → the raw column becomes
 * dirty → Save() writes it → a FRESH load from the database returns the edit. The pre-fix accessor
 * parsed on every read, so `entity.ConfigObject.a.b = 1` mutated a throwaway copy and the save
 * silently wrote nothing.
 *
 * FIXTURE. No production `__mj` field has a shipped live accessor yet, so this bundle registers a
 * test-only subclass of `MJ: Tests` that adds a `LiveConfig` accessor over the existing nullable
 * `Configuration` JSON text column, exactly as CodeGen now emits for an annotated field. The
 * accessor is client-side only, so the same subclass serves the wire variant: the server
 * round-trips plain text and never needs to know about it. Other bundles in the same `mj test`
 * process also resolve `MJ: Tests` to this subclass; it adds one accessor and changes nothing else.
 *
 * TRANSPORT. The same nine checks are registered twice. `jsontype-live-sync` runs in the
 * server-side block (ctx.Provider is a SQL provider). `jsontype-live-sync-client` runs in the client
 * block (ctx.Provider is a GraphQL provider) — the branch a browser uses, where Save() serializes
 * the raw field to a GraphQL mutation and Load() deserializes a query result. Text that survives one
 * transport can be re-encoded by the other (whitespace, key order), which is precisely what the
 * live binding's canonical-snapshot comparison has to tolerate.
 *
 * MUTATION TIER. Every check writes, so every check carries `RequiresMutation: true`. Rows are
 * prefixed per run, tagged "(mj-integration-test — safe to delete)", accumulated in the fixture and
 * swept by Teardown. No pre-existing record is ever touched.
 *
 * NOT YET EXECUTED. This bundle was authored without database access; it is type-checked and
 * registered but has not been run against a live database.
 */
import { BaseEntity, LogError, RunView } from '@memberjunction/core';
import { ToPlainJSON } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJTestEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const TEST_ENTITY = 'MJ: Tests';
const TEST_TYPE_ENTITY = 'MJ: Test Types';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const DEEP_LEVELS = 12;

/** A node of the recursive tree stored in `Configuration` for these checks. */
export interface LiveSyncNode {
    Label: string;
    Meta?: { Depth: number; Tags: string[] };
    Children: LiveSyncNode[];
}

/** Root shape stored in `MJ: Tests.Configuration` by these checks. */
export interface LiveSyncConfig {
    Version: number;
    Root: LiveSyncNode;
    Items: Array<{ Name: string; Qty: number }>;
}

/** Test-only subclass: a live typed accessor over `Configuration`, as CodeGen emits it. */
@RegisterClass(BaseEntity, TEST_ENTITY)
export class LiveSyncTestEntity extends MJTestEntity {
    public get LiveConfig(): LiveSyncConfig | null {
        return this.GetJSONFieldObject<LiveSyncConfig>('Configuration');
    }

    public set LiveConfig(value: LiveSyncConfig | null) {
        this.SetJSONFieldObject<LiveSyncConfig>('Configuration', value);
    }
}

interface LiveSyncFixture {
    Prefix: string;
    TypeID: string;
    TestIds: string[];
}

interface Fx {
    Current: LiveSyncFixture | undefined;
}

function buildConfig(): LiveSyncConfig {
    return {
        Version: 1,
        Root: { Label: 'root', Meta: { Depth: 0, Tags: ['a'] }, Children: [{ Label: 'c0', Children: [] }] },
        Items: [
            { Name: 'x', Qty: 1 },
            { Name: 'y', Qty: 2 },
            { Name: 'z', Qty: 3 },
        ],
    };
}

function requireFixture(fx: Fx): LiveSyncFixture {
    if (!fx.Current) {
        throw new Error('jsontype-live-sync: fixture missing — Setup did not run');
    }
    return fx.Current;
}

async function newRow(ctx: IntegrationCheckContext, fx: Fx, label: string, config: LiveSyncConfig | null): Promise<LiveSyncTestEntity> {
    const f = requireFixture(fx);
    const row = await ctx.Provider.GetEntityObject<LiveSyncTestEntity>(TEST_ENTITY, ctx.User);
    row.NewRecord();
    row.TypeID = f.TypeID;
    row.Name = `${f.Prefix}-${label}`;
    row.Description = FIXTURE_TAG;
    row.Status = 'Pending';
    if (config) {
        row.LiveConfig = config;
    }
    return row;
}

async function saveRow(row: LiveSyncTestEntity, fx: Fx, what: string): Promise<void> {
    Assert(await row.Save(), `${what}: save failed — ${row.LatestResult?.CompleteMessage}`);
    const f = requireFixture(fx);
    if (row.ID && !f.TestIds.some((id) => UUIDsEqual(id, row.ID))) {
        f.TestIds.push(row.ID);
    }
}

/** A brand-new entity object loaded from the database — never the instance that saved. */
async function freshLoad(ctx: IntegrationCheckContext, id: string, what: string): Promise<LiveSyncTestEntity> {
    const row = await ctx.Provider.GetEntityObject<LiveSyncTestEntity>(TEST_ENTITY, ctx.User);
    Assert(await row.Load(id), `${what}: fresh load of ${id} failed`);
    return row;
}

function deepestNode(config: LiveSyncConfig): LiveSyncNode {
    let node = config.Root;
    while (node.Children.length > 0) {
        node = node.Children[0];
    }
    return node;
}

function buildChain(config: LiveSyncConfig, levels: number): void {
    let node = config.Root;
    for (let i = 1; i <= levels; i++) {
        const child: LiveSyncNode = { Label: `n${i}`, Meta: { Depth: i, Tags: [] }, Children: [] };
        node.Children = [child];
        node = child;
    }
}

function buildChecks(bundle: string, fx: Fx): NamedCheck[] {
    const id = (n: number) => `${bundle}.JL${n}`;
    return [
        {
            Id: id(1),
            Name: 'JL1: a deep in-place edit through the accessor persists and a FRESH load returns it',
            RequiresMutation: true,
            Fn: async (ctx: IntegrationCheckContext) => {
                const row = await newRow(ctx, fx, 'jl1', buildConfig());
                buildChain(row.LiveConfig!, DEEP_LEVELS);
                await saveRow(row, fx, 'JL1 create');

                const live = row.LiveConfig!;
                deepestNode(live).Label = 'edited-deep';
                Assert(row.Dirty, 'JL1: an in-place edit twelve levels down must dirty the record');
                Assert(row.GetFieldByName('Configuration')!.Dirty, 'JL1: the raw Configuration field must be the dirty one');
                await saveRow(row, fx, 'JL1 edit');

                const fresh = await freshLoad(ctx, row.ID, 'JL1');
                AssertEqual(deepestNode(fresh.LiveConfig!).Label, 'edited-deep', 'JL1: deep edit must survive a fresh database load');
            },
        },
        {
            Id: id(2),
            Name: 'JL2: array push, splice and property delete each persist',
            RequiresMutation: true,
            Fn: async (ctx: IntegrationCheckContext) => {
                const row = await newRow(ctx, fx, 'jl2', buildConfig());
                await saveRow(row, fx, 'JL2 create');

                const cfg = row.LiveConfig!;
                cfg.Items.push({ Name: 'w', Qty: 4 });
                cfg.Items.splice(1, 1);
                delete cfg.Root.Meta;
                await saveRow(row, fx, 'JL2 edit');

                const fresh = (await freshLoad(ctx, row.ID, 'JL2')).LiveConfig!;
                AssertEqual(fresh.Items.map((i) => i.Name).join(','), 'x,z,w', 'JL2: push + splice must both persist');
                Assert(fresh.Root.Meta === undefined, 'JL2: a deleted property must be absent after reload');
            },
        },
        {
            Id: id(3),
            Name: 'JL3: a reference held ACROSS Save stays live and its later edits persist',
            RequiresMutation: true,
            Fn: async (ctx: IntegrationCheckContext) => {
                const row = await newRow(ctx, fx, 'jl3', buildConfig());
                await saveRow(row, fx, 'JL3 create');
                const held = row.LiveConfig!.Root;

                held.Label = 'first';
                await saveRow(row, fx, 'JL3 first save');
                held.Label = 'second';
                Assert(row.Dirty, 'JL3: an edit through a reference held across Save must dirty the record');
                await saveRow(row, fx, 'JL3 second save');

                AssertEqual((await freshLoad(ctx, row.ID, 'JL3')).LiveConfig!.Root.Label, 'second', 'JL3: held-reference edit must persist');
            },
        },
        {
            Id: id(4),
            Name: 'JL4: an object edited through the caller\'s OWN reference after assignment is still saved',
            RequiresMutation: true,
            Fn: async (ctx: IntegrationCheckContext) => {
                const row = await newRow(ctx, fx, 'jl4', null);
                const mine = buildConfig();
                row.LiveConfig = mine;
                mine.Items[0].Qty = 99; // through the un-proxied original, after assignment
                await saveRow(row, fx, 'JL4 create');

                AssertEqual((await freshLoad(ctx, row.ID, 'JL4')).LiveConfig!.Items[0].Qty, 99, 'JL4: safety-net flush must capture the late edit');
            },
        },
        {
            Id: id(5),
            Name: 'JL5: reading and a no-op write never dirty the record or issue an update',
            RequiresMutation: true,
            Fn: async (ctx: IntegrationCheckContext) => {
                const row = await newRow(ctx, fx, 'jl5', buildConfig());
                await saveRow(row, fx, 'JL5 create');
                const fresh = await freshLoad(ctx, row.ID, 'JL5');

                const cfg = fresh.LiveConfig!;
                void cfg.Items.length;
                cfg.Root.Label = cfg.Root.Label; // assigning the value it already has
                cfg.Items[0].Qty = cfg.Items[0].Qty;
                Assert(!fresh.Dirty, 'JL5: a read plus a no-op write must leave the record clean');
                Assert(await fresh.Save(), `JL5: a clean save must still succeed — ${fresh.LatestResult?.CompleteMessage}`);
            },
        },
        {
            Id: id(6),
            Name: 'JL6: after a change made behind the object\'s back the accessor re-parses and stale references detach',
            RequiresMutation: true,
            Fn: async (ctx: IntegrationCheckContext) => {
                const row = await newRow(ctx, fx, 'jl6', buildConfig());
                await saveRow(row, fx, 'JL6 create');

                const other = await freshLoad(ctx, row.ID, 'JL6 writer');
                other.LiveConfig!.Root.Label = 'changed-elsewhere';
                await saveRow(other, fx, 'JL6 writer save');

                const stale = row.LiveConfig!.Root;
                Assert(await row.Load(row.ID), 'JL6: reload failed');
                AssertEqual(row.LiveConfig!.Root.Label, 'changed-elsewhere', 'JL6: the reloaded record must show the database-side change');
                let threw = false;
                try {
                    stale.Label = 'stale-write';
                } catch {
                    threw = true;
                }
                Assert(threw, 'JL6: a write through a reference from before the reload must throw, not vanish');
                Assert(!row.Dirty, 'JL6: the rejected stale write must not have dirtied the record');
            },
        },
        {
            Id: id(7),
            Name: 'JL7: ToPlainJSON of a live object survives structuredClone and is independent of the entity',
            RequiresMutation: true,
            Fn: async (ctx: IntegrationCheckContext) => {
                const row = await newRow(ctx, fx, 'jl7', buildConfig());
                await saveRow(row, fx, 'JL7 create');

                const plain = ToPlainJSON(row.LiveConfig!);
                const cloned = structuredClone(plain);
                AssertEqual(cloned.Items.length, 3, 'JL7: structuredClone(ToPlainJSON(...)) must succeed and keep content');
                cloned.Root.Label = 'clone-edit';
                plain.Root.Label = 'plain-edit';
                AssertEqual(row.LiveConfig!.Root.Label, 'root', 'JL7: edits to the plain copies must not reach the entity');
                Assert(!row.Dirty, 'JL7: the entity must stay clean');
            },
        },
        {
            Id: id(8),
            Name: 'JL8: null↔object transitions and a full replacement persist',
            RequiresMutation: true,
            Fn: async (ctx: IntegrationCheckContext) => {
                const row = await newRow(ctx, fx, 'jl8', null);
                await saveRow(row, fx, 'JL8 create-null');
                Assert((await freshLoad(ctx, row.ID, 'JL8')).LiveConfig === null, 'JL8: a null field reads back as null');

                row.LiveConfig = buildConfig();
                await saveRow(row, fx, 'JL8 null->object');
                AssertEqual((await freshLoad(ctx, row.ID, 'JL8')).LiveConfig!.Version, 1, 'JL8: null→object must persist');

                const replacement = buildConfig();
                replacement.Version = 2;
                row.LiveConfig = replacement;
                await saveRow(row, fx, 'JL8 replace');
                AssertEqual((await freshLoad(ctx, row.ID, 'JL8')).LiveConfig!.Version, 2, 'JL8: replacement must persist');

                row.LiveConfig = null;
                await saveRow(row, fx, 'JL8 object->null');
                Assert((await freshLoad(ctx, row.ID, 'JL8')).LiveConfig === null, 'JL8: object→null must persist');
            },
        },
        {
            Id: id(9),
            Name: 'JL9: many nested mutations in one edit session collapse into ONE consistent save',
            RequiresMutation: true,
            Fn: async (ctx: IntegrationCheckContext) => {
                const row = await newRow(ctx, fx, 'jl9', buildConfig());
                await saveRow(row, fx, 'JL9 create');

                const cfg = row.LiveConfig!;
                for (let i = 0; i < 200; i++) {
                    cfg.Items.push({ Name: `bulk${i}`, Qty: i });
                    cfg.Items[0].Qty = i;
                }
                await saveRow(row, fx, 'JL9 bulk edit');

                const fresh = (await freshLoad(ctx, row.ID, 'JL9')).LiveConfig!;
                AssertEqual(fresh.Items.length, 203, 'JL9: every pushed item must persist');
                AssertEqual(fresh.Items[0].Qty, 199, 'JL9: the last write to a repeatedly-edited leaf wins');
            },
        },
    ];
}

async function sweep(ctx: IntegrationCheckContext, ids: string[]): Promise<void> {
    for (const id of [...ids].reverse()) {
        try {
            const row = await ctx.Provider.GetEntityObject<LiveSyncTestEntity>(TEST_ENTITY, ctx.User);
            // A row a check already deleted simply fails to load and is skipped; anything else is logged.
            if (await row.Load(id)) {
                if (!(await row.Delete())) {
                    LogError(`jsontype-live-sync teardown: leaked fixture row ${id} — delete failed: ${row.LatestResult?.CompleteMessage}`);
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`jsontype-live-sync teardown: leaked fixture row ${id} — ${message}`);
        }
    }
}

async function resolveTypeID(ctx: IntegrationCheckContext): Promise<string> {
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string }>(
        { EntityName: TEST_TYPE_ENTITY, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    if (!result.Success || result.Results.length === 0) {
        throw new Error(`jsontype-live-sync: no ${TEST_TYPE_ENTITY} row available to parent the fixture rows — ${result.ErrorMessage ?? 'empty'}`);
    }
    return result.Results[0].ID;
}

function registerBundle(bundle: string, checks: NamedCheck[], fx: Fx): void {
    for (const check of checks) {
        IntegrationCheckRegistry.Instance.Register(check);
    }
    IntegrationCheckRegistry.Instance.RegisterLifecycle(bundle, {
        Setup: async (ctx: IntegrationCheckContext) => {
            fx.Current = { Prefix: `mj-jl-${bundle.endsWith('client') ? 'c' : 's'}-${Date.now()}`, TypeID: await resolveTypeID(ctx), TestIds: [] };
        },
        Teardown: async (ctx: IntegrationCheckContext) => {
            if (!fx.Current) {
                return;
            }
            await sweep(ctx, fx.Current.TestIds);
            fx.Current = undefined;
        },
    });
}

const serverFixture: Fx = { Current: undefined };
const clientFixture: Fx = { Current: undefined };

/** JL1–JL9 on the server tier (SQL provider). */
export const JSONTypeLiveSyncChecks: NamedCheck[] = buildChecks('jsontype-live-sync', serverFixture);
/** JL1–JL9 on the client tier (GraphQL provider). */
export const JSONTypeLiveSyncClientChecks: NamedCheck[] = buildChecks('jsontype-live-sync-client', clientFixture);

registerBundle('jsontype-live-sync', JSONTypeLiveSyncChecks, serverFixture);
registerBundle('jsontype-live-sync-client', JSONTypeLiveSyncClientChecks, clientFixture);
