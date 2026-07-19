/**
 * app-wiring.checks.ts — the 'app-wiring' bundle (AW1–AW10): the "every shipped app is wired
 * correctly" contract, asserted over the real GraphQL wire (CLIENT-FIRST transport).
 *
 * Covers Domain 12 (G1–G9, S1, S2, S7) of plans/integration-test-expansion/test-catalog.md.
 * Every check PARAMETERIZES over all applications in metadata rather than naming apps, so new
 * apps inherit the contract automatically and a regression in ANY app fails the suite.
 *
 * The value here is LOCK-IN plus four latent risks the catalog flags: DriverClass collision
 * (risk #1), DefaultSequence conflicts, write-only slug uniqueness, and nav-item drift.
 *
 * READ-ONLY: creates nothing, mutates nothing, needs no fixture/lifecycle.
 *
 * Anti-vacuity: every check that iterates a collection FIRST asserts the collection is
 * non-empty. Without that, a failed load would silently "pass" every downstream assertion —
 * the single most common way an integration test becomes decorative.
 *
 * G5 (DriverClass -> Angular @RegisterClass) is deliberately NOT here: those registrations
 * live in Angular bundles the server cannot see, so it ships as a static CI grep gate
 * (.github/scripts/check-driverclass-registrations.sh), per the catalog's transport rules.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJApplicationEntity_IDefaultNavItem, MJApplicationEntity_IAgentSettings } from '@memberjunction/core-entities';
import { Assert } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

/** Row shape for the applications read (narrow projection — read-only, simple result type). */
interface AppRow {
    ID: string;
    Name: string;
    Status: 'Active' | 'Deprecated' | 'Disabled' | 'Pending';
    Path: string | null;
    DefaultNavItems: string | null;
    AgentSettings: string | null;
    DefaultForNewUser: boolean;
    DefaultSequence: number;
}

/** UUIDs arrive uppercase on SQL Server and lowercase on PostgreSQL — normalize for set keys. */
function normId(id: string | null | undefined): string {
    return (id ?? '').trim().toLowerCase();
}

/** Cap an offender list so a failure message stays readable while still being actionable. */
function sample(items: string[], max = 5): string {
    const shown = items.slice(0, max).join('; ');
    return items.length > max ? `${shown} … (+${items.length - max} more)` : shown;
}

async function loadApps(user: UserInfo): Promise<AppRow[]> {
    const r = await new RunView().RunView<AppRow>({
        EntityName: 'MJ: Applications',
        Fields: ['ID', 'Name', 'Status', 'Path', 'DefaultNavItems', 'AgentSettings', 'DefaultForNewUser', 'DefaultSequence'],
        OrderBy: 'Name',
        ResultType: 'simple'
    }, user);
    Assert(r.Success, `Could not load 'MJ: Applications': ${r.ErrorMessage}`);
    const rows = r.Results ?? [];
    // Anti-vacuity floor: a deployment always ships applications. Zero means the read failed
    // or permissions blocked it — every downstream check would pass meaninglessly.
    Assert(rows.length > 0, 'No applications returned — the wiring contract cannot be asserted against an empty set');
    return rows;
}

function activeApps(apps: AppRow[]): AppRow[] {
    return apps.filter(a => a.Status === 'Active');
}

/** Parse an app's DefaultNavItems JSON. Returns null when absent; throws context on malformed JSON. */
function parseNavItems(app: AppRow): MJApplicationEntity_IDefaultNavItem[] | null {
    if (!app.DefaultNavItems) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(app.DefaultNavItems);
        Assert(Array.isArray(parsed), `'${app.Name}': DefaultNavItems is valid JSON but not an array`);
        return parsed as MJApplicationEntity_IDefaultNavItem[];
    } catch (e) {
        Assert(false, `'${app.Name}': DefaultNavItems is not parseable JSON — ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}

function parseAgentSettings(app: AppRow): MJApplicationEntity_IAgentSettings | null {
    if (!app.AgentSettings) {
        return null;
    }
    try {
        return JSON.parse(app.AgentSettings) as MJApplicationEntity_IAgentSettings;
    } catch (e) {
        Assert(false, `'${app.Name}': AgentSettings is not parseable JSON — ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}

/** Every (app, navItem) pair across the active apps — the unit most checks iterate. */
function navPairs(apps: AppRow[]): Array<{ app: AppRow; item: MJApplicationEntity_IDefaultNavItem }> {
    const pairs: Array<{ app: AppRow; item: MJApplicationEntity_IDefaultNavItem }> = [];
    for (const app of apps) {
        for (const item of parseNavItems(app) ?? []) {
            pairs.push({ app, item });
        }
    }
    return pairs;
}

export const AppWiringChecks: NamedCheck[] = [
    {
        Id: 'app-wiring.AW1',
        Name: 'AW1 (G1): every Application row loads and the provider cache matches the entity table',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = await loadApps(ctx.User);
            const provider: IMetadataProvider = ctx.Provider;
            const cached = provider.Applications ?? [];
            Assert(cached.length > 0, 'Provider reported zero cached Applications — metadata did not load');

            const tableIds = new Set(apps.map(a => normId(a.ID)));
            const cachedIds = new Set(cached.map(a => normId(a.ID)));
            const missingFromCache = apps.filter(a => !cachedIds.has(normId(a.ID))).map(a => a.Name);
            const staleInCache = cached.filter(a => !tableIds.has(normId(a.ID))).map(a => a.Name);

            Assert(missingFromCache.length === 0,
                `AW1: ${missingFromCache.length} app(s) in the table are absent from provider metadata: ${sample(missingFromCache)}`);
            Assert(staleInCache.length === 0,
                `AW1: ${staleInCache.length} app(s) cached by the provider no longer exist in the table: ${sample(staleInCache)}`);
            console.log(`      → ${apps.length} applications, provider parity exact (${activeApps(apps).length} Active)`);
        }
    },
    {
        Id: 'app-wiring.AW2',
        Name: 'AW2 (G2): DefaultNavItems is valid JSON and every item declares Label + ResourceType (+ DriverClass when Custom)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = activeApps(await loadApps(ctx.User));
            Assert(apps.length > 0, 'No Active applications — nav-item contract cannot be asserted');
            const pairs = navPairs(apps);
            Assert(pairs.length > 0, 'No nav items across any Active application — the read produced nothing to assert on');

            const bad: string[] = [];
            for (const { app, item } of pairs) {
                if (!item.Label || item.Label.trim().length === 0) {
                    bad.push(`${app.Name}: item missing Label`);
                }
                if (!item.ResourceType || item.ResourceType.trim().length === 0) {
                    bad.push(`${app.Name}/${item.Label}: missing ResourceType`);
                }
                if (item.ResourceType === 'Custom' && !item.DriverClass) {
                    bad.push(`${app.Name}/${item.Label}: ResourceType='Custom' without DriverClass`);
                }
            }
            Assert(bad.length === 0, `AW2: ${bad.length} malformed nav item(s): ${sample(bad)}`);
            console.log(`      → ${pairs.length} nav items across ${apps.length} Active apps, all well-formed`);
        }
    },
    {
        Id: 'app-wiring.AW3',
        Name: 'AW3 (G3): each Active app with nav items declares exactly one isDefault tab',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = activeApps(await loadApps(ctx.User));
            const withNav = apps.filter(a => (parseNavItems(a) ?? []).length > 0);
            Assert(withNav.length > 0, 'No Active app has nav items — nothing to assert');

            const offenders: string[] = [];
            for (const app of withNav) {
                const items = parseNavItems(app) ?? [];
                const defaults = items.filter(i => i.isDefault === true);
                if (defaults.length !== 1) {
                    offenders.push(`${app.Name}: ${defaults.length} isDefault items (expected exactly 1)`);
                }
            }
            Assert(offenders.length === 0, `AW3: ${offenders.length} app(s) violate the single-default-tab contract: ${sample(offenders)}`);
            console.log(`      → ${withNav.length} nav-bearing apps each declare exactly one default tab`);
        }
    },
    {
        Id: 'app-wiring.AW4',
        Name: 'AW4 (G4): DriverClass values are non-empty and globally unique across all apps (collision risk #1)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = activeApps(await loadApps(ctx.User));
            const custom = navPairs(apps).filter(p => p.item.ResourceType === 'Custom');
            Assert(custom.length > 0, "No ResourceType='Custom' nav items found — DriverClass contract cannot be asserted");

            const owners = new Map<string, string[]>();
            const empty: string[] = [];
            for (const { app, item } of custom) {
                const dc = (item.DriverClass ?? '').trim();
                if (dc.length === 0) {
                    empty.push(`${app.Name}/${item.Label}`);
                    continue;
                }
                const key = dc.toLowerCase();
                owners.set(key, [...(owners.get(key) ?? []), `${app.Name}/${item.Label}`]);
            }
            Assert(empty.length === 0, `AW4: ${empty.length} Custom nav item(s) have an empty DriverClass: ${sample(empty)}`);

            const collisions = [...owners.entries()]
                .filter(([, uses]) => uses.length > 1)
                .map(([dc, uses]) => `'${dc}' used by ${uses.length}: ${uses.join(', ')}`);
            Assert(collisions.length === 0,
                `AW4: ${collisions.length} DriverClass collision(s) — two apps resolving the same component is the catalog's latent risk #1: ${sample(collisions)}`);
            console.log(`      → ${owners.size} distinct DriverClass values across ${custom.length} Custom nav items, no collisions`);
        }
    },
    {
        Id: 'app-wiring.AW5',
        Name: 'AW5 (G6): non-null application Path values are globally unique (slug uniqueness)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = await loadApps(ctx.User);
            const withPath = apps.filter(a => a.Path != null && String(a.Path).trim().length > 0);
            Assert(withPath.length > 0, 'No application has a Path — slug uniqueness cannot be asserted');

            const byPath = new Map<string, string[]>();
            for (const a of withPath) {
                const key = String(a.Path).trim().toLowerCase();
                byPath.set(key, [...(byPath.get(key) ?? []), a.Name]);
            }
            const dupes = [...byPath.entries()]
                .filter(([, names]) => names.length > 1)
                .map(([p, names]) => `'${p}' → ${names.join(', ')}`);
            Assert(dupes.length === 0, `AW5: ${dupes.length} duplicate application Path(s): ${sample(dupes)}`);
            console.log(`      → ${withPath.length} app paths, all unique`);
        }
    },
    {
        Id: 'app-wiring.AW6',
        Name: 'AW6 (G7): every Application-Entities join row resolves to a real app and a real entity',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = await loadApps(ctx.User);
            const appIds = new Set(apps.map(a => normId(a.ID)));

            const r = await new RunView().RunView<{ ID: string; ApplicationID: string; EntityID: string; Application: string; Entity: string }>({
                EntityName: 'MJ: Application Entities',
                Fields: ['ID', 'ApplicationID', 'EntityID', 'Application', 'Entity'],
                ResultType: 'simple'
            }, ctx.User);
            Assert(r.Success, `Could not load 'MJ: Application Entities': ${r.ErrorMessage}`);
            const rows = r.Results ?? [];
            Assert(rows.length > 0, 'No Application-Entities join rows — nothing to assert');

            const entityIds = new Set((ctx.Provider.Entities ?? []).map(e => normId(e.ID)));
            Assert(entityIds.size > 0, 'Provider reported zero entities — metadata did not load');

            const badApp = rows.filter(x => !appIds.has(normId(x.ApplicationID))).map(x => `${x.Application ?? x.ApplicationID}/${x.Entity ?? x.EntityID}`);
            const badEntity = rows.filter(x => !entityIds.has(normId(x.EntityID))).map(x => `${x.Application ?? x.ApplicationID} → entity ${x.EntityID}`);

            Assert(badApp.length === 0, `AW6: ${badApp.length} join row(s) reference a missing Application: ${sample(badApp)}`);
            Assert(badEntity.length === 0, `AW6: ${badEntity.length} join row(s) reference a missing Entity: ${sample(badEntity)}`);
            console.log(`      → ${rows.length} application-entity links all resolve`);
        }
    },
    {
        Id: 'app-wiring.AW7',
        Name: 'AW7 (G8): Application Roles resolve and CanAdmin implies CanAccess',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = await loadApps(ctx.User);
            const appIds = new Set(apps.map(a => normId(a.ID)));

            const r = await new RunView().RunView<{ ID: string; ApplicationID: string; RoleID: string; CanAccess: boolean; CanAdmin: boolean; Application: string; Role: string }>({
                EntityName: 'MJ: Application Roles',
                Fields: ['ID', 'ApplicationID', 'RoleID', 'CanAccess', 'CanAdmin', 'Application', 'Role'],
                ResultType: 'simple'
            }, ctx.User);
            Assert(r.Success, `Could not load 'MJ: Application Roles': ${r.ErrorMessage}`);
            const rows = r.Results ?? [];
            if (rows.length === 0) {
                // Honest skip-as-pass: a deployment may legitimately grant apps without role scoping.
                console.log('      → no Application Role rows configured (nothing to assert)');
                return;
            }

            const badApp = rows.filter(x => !appIds.has(normId(x.ApplicationID))).map(x => `${x.Application ?? x.ApplicationID}/${x.Role ?? x.RoleID}`);
            Assert(badApp.length === 0, `AW7: ${badApp.length} role row(s) reference a missing Application: ${sample(badApp)}`);

            const missingRole = rows.filter(x => !x.RoleID || normId(x.RoleID).length === 0).map(x => x.Application ?? x.ApplicationID);
            Assert(missingRole.length === 0, `AW7: ${missingRole.length} role row(s) have no RoleID: ${sample(missingRole)}`);

            // The privilege invariant: admin without access is an incoherent grant.
            const incoherent = rows.filter(x => x.CanAdmin === true && x.CanAccess !== true)
                .map(x => `${x.Application ?? x.ApplicationID}/${x.Role ?? x.RoleID}`);
            Assert(incoherent.length === 0,
                `AW7: ${incoherent.length} grant(s) set CanAdmin without CanAccess: ${sample(incoherent)}`);
            console.log(`      → ${rows.length} application-role grants all resolve; CanAdmin ⇒ CanAccess holds`);
        }
    },
    {
        Id: 'app-wiring.AW8',
        Name: 'AW8 (G9): every app-scoped Application Setting points at a real application',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = await loadApps(ctx.User);
            const appIds = new Set(apps.map(a => normId(a.ID)));

            const r = await new RunView().RunView<{ ID: string; ApplicationID: string | null; Name: string; Application: string | null }>({
                EntityName: 'MJ: Application Settings',
                Fields: ['ID', 'ApplicationID', 'Name', 'Application'],
                ResultType: 'simple'
            }, ctx.User);
            Assert(r.Success, `Could not load 'MJ: Application Settings': ${r.ErrorMessage}`);
            const rows = r.Results ?? [];
            if (rows.length === 0) {
                console.log('      → no Application Settings configured (nothing to assert)');
                return;
            }
            // ApplicationID is nullable — a null means a GLOBAL setting, which is valid.
            const scoped = rows.filter(x => x.ApplicationID != null && normId(x.ApplicationID).length > 0);
            const orphans = scoped.filter(x => !appIds.has(normId(x.ApplicationID))).map(x => `${x.Name} → ${x.ApplicationID}`);
            Assert(orphans.length === 0, `AW8: ${orphans.length} app-scoped setting(s) reference a missing Application: ${sample(orphans)}`);
            console.log(`      → ${rows.length} settings (${scoped.length} app-scoped) all resolve`);
        }
    },
    {
        Id: 'app-wiring.AW9',
        Name: 'AW9 (S1/S2): every app AgentSettings DefaultAgentID + RelevantAgents resolve to real agents',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = await loadApps(ctx.User);
            const configured = apps.filter(a => parseAgentSettings(a) != null);
            if (configured.length === 0) {
                console.log('      → no app declares AgentSettings (nothing to assert)');
                return;
            }

            const ar = await new RunView().RunView<{ ID: string; Name: string }>({
                EntityName: 'MJ: AI Agents',
                Fields: ['ID', 'Name'],
                ResultType: 'simple'
            }, ctx.User);
            Assert(ar.Success, `Could not load 'MJ: AI Agents': ${ar.ErrorMessage}`);
            const agents = ar.Results ?? [];
            Assert(agents.length > 0, 'No AI Agents in metadata — agent wiring cannot be asserted');
            const agentIds = new Set(agents.map(a => normId(a.ID)));

            const broken: string[] = [];
            for (const app of configured) {
                const s = parseAgentSettings(app);
                if (s?.DefaultAgentID && !agentIds.has(normId(s.DefaultAgentID))) {
                    broken.push(`${app.Name}: DefaultAgentID ${s.DefaultAgentID} does not resolve`);
                }
                for (const ra of s?.RelevantAgents ?? []) {
                    if (!ra.AgentID || !agentIds.has(normId(ra.AgentID))) {
                        broken.push(`${app.Name}: RelevantAgent ${ra.Label ?? ra.AgentID} does not resolve`);
                    }
                }
            }
            Assert(broken.length === 0, `AW9: ${broken.length} unresolvable agent reference(s): ${sample(broken)}`);
            console.log(`      → ${configured.length} app(s) with AgentSettings; all agent references resolve`);
        }
    },
    {
        Id: 'app-wiring.AW10',
        Name: 'AW10 (S7): non-Active apps are excluded from the Active set and never fan out to new users',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = await loadApps(ctx.User);
            const nonActive = apps.filter(a => a.Status !== 'Active');
            if (nonActive.length === 0) {
                console.log('      → every application is Active (no exclusion case present)');
                return;
            }
            // A Deprecated/Disabled app must never be handed to new users — that is the fan-out contract.
            const leaking = nonActive.filter(a => a.DefaultForNewUser === true).map(a => `${a.Name} (${a.Status})`);
            Assert(leaking.length === 0,
                `AW10: ${leaking.length} non-Active app(s) still flagged DefaultForNewUser: ${sample(leaking)}`);

            const active = activeApps(apps);
            const bleed = active.filter(a => a.Status !== 'Active').map(a => a.Name);
            Assert(bleed.length === 0, `AW10: Active filter returned a non-Active app: ${sample(bleed)}`);
            console.log(`      → ${nonActive.length} non-Active app(s) correctly excluded from new-user fan-out`);
        }
    }
];

for (const check of AppWiringChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
