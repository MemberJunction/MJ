/**
 * class-resolution.checks.ts — the 'class-resolution' bundle (CR1–CR5): the ClassFactory
 * resolution contract, exercised against the REAL runtime registry of a bootstrapped provider
 * stack (Domain 2 of the integration-test expansion catalog: CD10 + the fallback/marker
 * contracts in MJGlobal's ClassFactory / RequiresSubclass / OptionalKeyedSpecialization).
 *
 * Unit tests cover the factory's mechanics against synthetic classes; what nothing covered is
 * the factory's behavior over the registry a REAL process actually builds — the generated +
 * extended entity registrations from `@memberjunction/core-entities`, the permission-provider
 * registrations, and the marker-bearing bases — reached through the same call paths production
 * uses (`provider.GetEntityObject`, EntityField hydration).
 *
 *   - CR1  Known entities resolve to their registered EXTENDED subclasses through the provider
 *          ('MJ: User Views' → MJUserViewEntityExtended, 'MJ: Queries' → MJQueryEntityExtended,
 *          'MJ: Dashboards' → MJDashboardEntityExtended — the MJCoreEntities/custom registrations).
 *   - CR2  An entity with only a GENERATED subclass still key-HITS (Resolved: true) — the
 *          generated tier is a real registration, not the fallback path.
 *   - CR3  Key-miss fallback contract on an unmarked base: CreateInstance does NOT throw and
 *          returns a base-class instance; TryCreateInstance reports Resolved:false + a Reason —
 *          the documented BaseEntity-style fallback.
 *   - CR4  '@RequiresSubclass()' bases hard-fail on a miss: CreateInstance THROWS, TryCreateInstance
 *          returns {Resolved:false, Instance:null}; the marker does NOT leak onto concrete
 *          subclasses; a real registered key (MJEntityPermissionProvider) still resolves.
 *   - CR5  The EntityField '@OptionalKeyedSpecialization()' probe stays SILENT on a miss (the
 *          per-field '<Entity>.<Field>' hydration probe is a designed fallback), while an
 *          unmarked base's keyed miss still WARNS — proving the reporter is alive, so the
 *          silence is a verified suppression rather than a dead logger.
 *
 * Entirely deterministic and read-only: no rows are created, no lifecycle is registered.
 */
import { BaseEntity, EntityField } from '@memberjunction/core';
import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import {
    MJGlobal,
    ClassRequiresSubclass,
    ClassIsOptionalKeyedSpecialization
} from '@memberjunction/global';
import { PermissionProviderBase } from '@memberjunction/core';
import {
    MJActionCategoryEntity,
    MJDashboardEntityExtended,
    MJQueryEntityExtended,
    MJUserViewEntityExtended
} from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const CATEGORY_ENTITY = 'MJ: Action Categories';

/** A key that is guaranteed unregistered for any base (unique per process run). */
const NEVER_REGISTERED_KEY = `mj-cr-never-registered-${Date.now()}`;

/**
 * A deliberately UNMARKED, never-registered local base class for CR5's control leg: keyed misses
 * against it must produce the factory's fallback WARNING (proving the reporter is live), in
 * contrast to the marked EntityField whose identical miss must stay silent.
 */
class MjCrUnmarkedProbeBase {
    public Ping(): string {
        return 'base';
    }
}

/** Resolves an entity's metadata, failing loudly if it is missing. */
function requireEntity(ctx: IntegrationCheckContext, name: string): EntityInfo {
    const info = ctx.Provider.EntityByName(name);
    Assert(info != null, `entity '${name}' not found in provider metadata`);
    return info!;
}

/**
 * Runs `fn` while capturing console.warn + console.error output, restoring the console in a
 * finally. Returns every captured line (joined args) so callers can filter for the messages
 * they care about without asserting global silence (other subsystems may legitimately log).
 */
async function captureConsole(fn: () => Promise<void> | void): Promise<string[]> {
    const captured: string[] = [];
    const originalWarn = console.warn;
    const originalError = console.error;
    const capture = (...args: unknown[]): void => {
        captured.push(args.map(a => String(a)).join(' '));
    };
    console.warn = capture;
    console.error = capture;
    try {
        await fn();
    } finally {
        console.warn = originalWarn;
        console.error = originalError;
    }
    return captured;
}

export const ClassResolutionChecks: NamedCheck[] = [
    {
        Id: 'class-resolution.CR1',
        Name: 'CR1: known entities resolve to their registered extended subclasses through the real provider',
        Fn: async (ctx: IntegrationCheckContext) => {
            // The provider path (GetEntityObject → ClassFactory) is exactly what production runs;
            // instanceof-the-extended-class holds even when a transport registers a further
            // subclass on top (e.g. a server *EntityServer extending the Extended class).
            const view = await ctx.Provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', ctx.User);
            Assert(view instanceof MJUserViewEntityExtended,
                `'MJ: User Views' resolved to ${view.constructor.name}, which is not (a descendant of) MJUserViewEntityExtended`);
            Assert(view instanceof BaseEntity, 'resolved User View must still be a BaseEntity');

            const query = await ctx.Provider.GetEntityObject<MJQueryEntityExtended>('MJ: Queries', ctx.User);
            Assert(query instanceof MJQueryEntityExtended,
                `'MJ: Queries' resolved to ${query.constructor.name}, which is not (a descendant of) MJQueryEntityExtended`);

            const dashboard = await ctx.Provider.GetEntityObject<MJDashboardEntityExtended>('MJ: Dashboards', ctx.User);
            Assert(dashboard instanceof MJDashboardEntityExtended,
                `'MJ: Dashboards' resolved to ${dashboard.constructor.name}, which is not (a descendant of) MJDashboardEntityExtended`);

            // Registry-level agreement: the winning registration for the key IS the class the
            // provider handed back (same resolution, observed from the other end).
            const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, 'MJ: User Views');
            Assert(reg != null, `the registry has no winning registration for BaseEntity + 'MJ: User Views'`);
            AssertEqual(view.constructor.name, (reg!.SubClass as { name: string }).name,
                'the instance the provider built must be the registry winner for the key');

            console.log(`      → User Views→${view.constructor.name}, Queries→${query.constructor.name}, Dashboards→${dashboard.constructor.name}`);
        }
    },
    {
        Id: 'class-resolution.CR2',
        Name: 'CR2: a generated-only entity is a key HIT (Resolved: true), not a fallback',
        Fn: async (ctx: IntegrationCheckContext) => {
            const info = requireEntity(ctx, CATEGORY_ENTITY);
            // TryCreateInstance is the explicit-result surface — it distinguishes "the generated
            // subclass registration matched" from "we fell back to BaseEntity", which the plain
            // CreateInstance return value cannot.
            const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseEntity>(BaseEntity, CATEGORY_ENTITY, info);
            AssertEqual(res.Resolved, true, `'${CATEGORY_ENTITY}' must resolve via its GENERATED registration, not fall back`);
            Assert(res.Instance != null, 'a resolved key must produce an instance');
            Assert(res.Instance instanceof MJActionCategoryEntity,
                `'${CATEGORY_ENTITY}' resolved to ${res.Instance!.constructor.name}, not (a descendant of) the generated MJActionCategoryEntity`);
            Assert(res.Reason === undefined, 'a resolved lookup must carry no failure Reason');

            console.log(`      → '${CATEGORY_ENTITY}' key-HIT → ${res.Instance!.constructor.name} (generated tier is a real registration)`);
        }
    },
    {
        Id: 'class-resolution.CR3',
        Name: 'CR3: key-miss on an unmarked base falls back to the base class without throwing',
        Fn: async (ctx: IntegrationCheckContext) => {
            const info = requireEntity(ctx, CATEGORY_ENTITY);
            const factory = MJGlobal.Instance.ClassFactory;

            // Explicit-result surface: Resolved false, but a USABLE base instance + a Reason.
            const res = factory.TryCreateInstance<BaseEntity>(BaseEntity, NEVER_REGISTERED_KEY, info);
            AssertEqual(res.Resolved, false, 'an unregistered key must not report Resolved');
            Assert(res.Instance != null, 'the unmarked-base contract is fallback-to-base, never null');
            Assert(res.Instance instanceof BaseEntity, 'the fallback must be a BaseEntity');
            AssertEqual(res.Instance!.constructor.name, 'BaseEntity',
                'the fallback must be the anchor base ITSELF — not some keyed registration leaking in');
            Assert(!(res.Instance instanceof MJActionCategoryEntity),
                'a missed key must not be served another key\'s registration');
            Assert(!!res.Reason && res.Reason.includes('no registration found'),
                `Reason must explain the miss; got: ${res.Reason ?? '(none)'}`);

            // Throwing surface: CreateInstance must NOT throw for an unmarked base — the
            // long-standing fallback contract legitimate consumers (BaseEntity) rely on.
            const direct = factory.CreateInstance<BaseEntity>(BaseEntity, NEVER_REGISTERED_KEY, info);
            Assert(direct != null && direct instanceof BaseEntity,
                'CreateInstance on an unmarked base must fall back to a base instance, not throw/return null');

            console.log(`      → miss on unmarked base: Resolved=false, base-class fallback instance, Reason present, no throw`);
        }
    },
    {
        Id: 'class-resolution.CR4',
        Name: 'CR4: @RequiresSubclass bases hard-fail on a miss, resolve normally on a hit, and the marker does not leak to subclasses',
        Fn: async (ctx: IntegrationCheckContext) => {
            const factory = MJGlobal.Instance.ClassFactory;
            Assert(ClassRequiresSubclass(PermissionProviderBase),
                'PermissionProviderBase must carry the @RequiresSubclass marker (the premise of this check)');

            // Positive control FIRST: a REAL registered key resolves — so the hard failure below is
            // about the miss, not about the base being unusable in general.
            const hit = factory.TryCreateInstance<PermissionProviderBase>(PermissionProviderBase, 'MJEntityPermissionProvider');
            Assert(hit.Resolved && hit.Instance != null,
                `registered key 'MJEntityPermissionProvider' must resolve (got Resolved=${hit.Resolved}: ${hit.Reason ?? ''})`);
            AssertEqual(hit.Instance!.DomainName, 'Entity Permissions', 'the resolved provider must be the real implementation');
            Assert(!ClassRequiresSubclass(hit.Instance!.constructor),
                'the @RequiresSubclass marker must NOT leak onto concrete subclasses (own-property contract) — a leaked marker would make every resolved provider throw');

            // TryCreateInstance on a miss: explicit null — no hollow abstract instance.
            const miss = factory.TryCreateInstance<PermissionProviderBase>(PermissionProviderBase, NEVER_REGISTERED_KEY);
            AssertEqual(miss.Resolved, false, 'unregistered key must not resolve');
            Assert(miss.Instance === null, 'a @RequiresSubclass base must NEVER be handed back as a fallback instance');
            Assert(!!miss.Reason && miss.Reason.includes('RequiresSubclass'),
                `Reason must name the marker contract; got: ${miss.Reason ?? '(none)'}`);

            // CreateInstance on a miss: throws loudly (the whole point of the marker).
            let threw = false;
            let message = '';
            try {
                factory.CreateInstance<PermissionProviderBase>(PermissionProviderBase, NEVER_REGISTERED_KEY);
            } catch (error) {
                threw = true;
                message = error instanceof Error ? error.message : String(error);
            }
            Assert(threw, 'CreateInstance on a @RequiresSubclass miss must THROW, not return a hollow base instance');
            Assert(message.includes('CANNOT be used as a fallback'),
                `the thrown message must state the base cannot be a fallback; got: ${message.slice(0, 300)}`);

            console.log(`      → hit resolves (${hit.Instance!.constructor.name}), miss: Try→null + CreateInstance throws, marker not inherited`);
        }
    },
    {
        Id: 'class-resolution.CR5',
        Name: 'CR5: the EntityField @OptionalKeyedSpecialization probe stays silent on a miss — while an unmarked miss still warns',
        Fn: async (ctx: IntegrationCheckContext) => {
            const factory = MJGlobal.Instance.ClassFactory;
            const info = requireEntity(ctx, CATEGORY_ENTITY);
            Assert(info.Fields.length > 0, `'${CATEGORY_ENTITY}' has no field metadata`);
            const fieldInfo: EntityFieldInfo = info.Fields[0];
            Assert(ClassIsOptionalKeyedSpecialization(EntityField),
                'EntityField must carry the @OptionalKeyedSpecialization marker (the premise of this check)');

            // ---- CONTROL (anti-vacuity): the reporter must be provably ALIVE in this process,
            // otherwise "no warning" below would also pass with a broken/suppressed logger. An
            // unmarked, never-registered base with a supplied key is the exact case the factory
            // documents as warn-worthy. Fresh base class + fresh key → immune to the per-base
            // volume cap and the per-(base,key) dedup.
            const controlLines = await captureConsole(() => {
                const res = factory.TryCreateInstance<MjCrUnmarkedProbeBase>(MjCrUnmarkedProbeBase, NEVER_REGISTERED_KEY);
                Assert(res.Instance != null && res.Instance.Ping() === 'base', 'control fallback instance must be functional');
            });
            Assert(controlLines.some(l => l.includes('no registration found') && l.includes('MjCrUnmarkedProbeBase')),
                `the fallback reporter did not fire for an unmarked keyed miss — silence checks below would be vacuous (captured: ${controlLines.join(' | ').slice(0, 300)})`);

            // ---- THE PROBE: the exact key shape BaseEntity hydration uses ('<Entity>.<Field>'),
            // guaranteed unregistered. Fallback must succeed AND stay silent — this probe runs for
            // every field of every entity, so a single warning here means a console firehose in
            // every real process.
            const probeKey = `${info.Name}.MjCrNoSuchField${Date.now()}`;
            const probeLines = await captureConsole(() => {
                const res = factory.TryCreateInstance<EntityField>(EntityField, probeKey, fieldInfo);
                AssertEqual(res.Resolved, false, 'the specialization probe key must not resolve');
                Assert(res.Instance != null && res.Instance instanceof EntityField,
                    'the probe must fall back to a functional EntityField');
                AssertEqual(res.Instance!.Name, fieldInfo.Name, 'the fallback EntityField must be built from the supplied field info');
            });
            const entityFieldNoise = probeLines.filter(l => l.includes('ClassFactory') && l.includes('EntityField'));
            AssertEqual(entityFieldNoise.length, 0,
                `the EntityField probe must be SILENT (designed fallback); captured: ${entityFieldNoise.join(' | ').slice(0, 300)}`);

            // ---- and the real hydration path (one EntityField probe per field) is silent too.
            const hydrationLines = await captureConsole(async () => {
                const cat = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User);
                cat.NewRecord();
                AssertEqual(cat.Fields.length, info.Fields.length, 'hydration must build one EntityField per metadata field');
            });
            const hydrationNoise = hydrationLines.filter(l => l.includes('ClassFactory') && l.includes('EntityField'));
            AssertEqual(hydrationNoise.length, 0,
                `real field hydration must not emit ClassFactory fallback noise; captured: ${hydrationNoise.join(' | ').slice(0, 300)}`);

            console.log(`      → unmarked miss warned (reporter alive); EntityField probe + full hydration (${info.Fields.length} fields) silent`);
        }
    }
];

for (const check of ClassResolutionChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
