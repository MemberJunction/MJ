/**
 * codegen-determinism.checks.ts — the 'codegen-determinism' bundle (CD1–CD6).
 *
 * Domain 9 deterministic legs that verify the INTERNAL CONSISTENCY of the EXISTING generated
 * artifacts WITHOUT running CodeGen: every live core-schema entity must have a matching
 * `@RegisterClass(BaseEntity, '<Entity Name>')` registration, a `<ClassName>Entity` class export,
 * and a `<ClassName>Schema` Zod schema whose shape agrees field-for-field with the live metadata
 * (including the CHECK-constraint value-list unions — the rule-2c drift class). The reverse
 * direction (a generated schema/class pair with no live entity = stale artifact) is asserted too.
 *
 * All checks are read-only (metadata + module exports + an optional source-tree spot check) —
 * no fixtures, no lifecycle, no DB writes. Because the live metadata comes from the same
 * database CodeGen last ran against, a red here means schema/codegen drift (e.g. a migration
 * was applied without re-running CodeGen) — exactly the smoke this bundle exists to catch.
 *
 * Zod is deliberately NOT imported: schemas are inspected through narrow structural duck-types
 * (`shape` + `safeParse`) so this bundle does not couple to the zod version core-entities uses.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BaseEntity, EntityFieldTSType, Metadata } from '@memberjunction/core';
import type { EntityInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import * as CoreEntities from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Narrow structural view of a zod field: all we need is `safeParse`. */
interface ZodLikeField {
    safeParse(value: unknown): { success: boolean };
}

/** Narrow structural view of a zod object schema: `shape` (keys) + `safeParse`. */
interface ZodLikeObject extends ZodLikeField {
    shape: Record<string, ZodLikeField>;
}

/** Duck-type an unknown export as a zod object schema, or undefined when it isn't one. */
function asZodObject(candidate: unknown): ZodLikeObject | undefined {
    if (candidate == null || typeof candidate !== 'object') {
        return undefined;
    }
    const record = candidate as { shape?: unknown; safeParse?: unknown };
    if (typeof record.safeParse !== 'function' || record.shape == null || typeof record.shape !== 'object') {
        return undefined;
    }
    return candidate as ZodLikeObject;
}

/** The core-entities package as a name → export map (for `<ClassName>Entity` / `<ClassName>Schema` lookups). */
const coreEntityExports: Record<string, unknown> = CoreEntities as unknown as Record<string, unknown>;

/** All live entities in the core schema (the schema MJCoreEntities is generated from). */
function coreEntities(ctx: IntegrationCheckContext): EntityInfo[] {
    const schema = ctx.Schema ?? '__mj';
    const entities = ctx.Provider.Entities.filter(e => e.SchemaName === schema);
    // Anti-vacuity: a core MJ install has hundreds of __mj entities. A tiny result means the
    // filter (or the provider bootstrap) is broken, and every downstream assertion would be vacuous.
    Assert(entities.length > 100, `expected >100 '${schema}' entities in live metadata, got ${entities.length} — check bundle preconditions`);
    return entities;
}

/**
 * Match a live field CodeName against the generated schema keys. CodeGen renames generated
 * properties that collide with BaseEntity members by appending '_' (the only such field today
 * is `Config` → `Config_`), so a field matches on either its CodeName or CodeName + '_'.
 */
function schemaKeyForField(shape: Record<string, ZodLikeField>, codeName: string): string | undefined {
    if (codeName in shape) {
        return codeName;
    }
    const suffixed = `${codeName}_`;
    if (suffixed in shape) {
        return suffixed;
    }
    return undefined;
}

/** The reverse of {@link schemaKeyForField}: does a schema key correspond to a live field CodeName? */
function fieldCodeNameForKey(codeNames: Set<string>, key: string): boolean {
    if (codeNames.has(key)) {
        return true;
    }
    return key.endsWith('_') && codeNames.has(key.slice(0, -1));
}

/**
 * The generated entity-subclass source: the per-schema files when CodeGen split them, the
 * single `entity_subclasses.ts` otherwise.
 *
 * With `fileEmit.perSchema` on, `entity_subclasses.ts` is a barrel re-exporting one file per
 * schema and carries no registrations of its own. Reading whichever shape is on disk — rather
 * than parsing the barrel — keeps this check correct with that flag set either way.
 */
function readGeneratedEntitySource(generatedDir: string): string {
    const entry = fs.readFileSync(path.join(generatedDir, 'entity_subclasses.ts'), 'utf8');
    // Decide on the entry file's CONTENT, not on whether `entities/` exists. Turning `perSchema`
    // off rewrites the entry file but leaves the old per-schema directory behind, so keying off
    // the directory would count a stale roster and pass while the real artifact had drifted.
    if (!entry.includes("export * from './entities/")) {
        return entry;
    }
    const splitDir = path.join(generatedDir, 'entities');
    const files = fs.existsSync(splitDir) ? fs.readdirSync(splitDir).filter((f) => f.endsWith('.ts')).sort() : [];
    Assert(files.length > 0, 'entity_subclasses.ts re-exports entities/ but no generated files are there — the emit is incomplete');
    return files.map((f) => fs.readFileSync(path.join(splitDir, f), 'utf8')).join('\n');
}

/** Walk up from cwd looking for the MJ repo root (identified by the generated core-entities file). */
function findRepoRoot(): string | undefined {
    const marker = path.join('packages', 'MJCoreEntities', 'src', 'generated', 'entity_subclasses.ts');
    let dir = process.cwd();
    for (let i = 0; i < 12; i++) {
        if (fs.existsSync(path.join(dir, marker))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return undefined;
}

export const CodegenDeterminismChecks: NamedCheck[] = [
    {
        Id: 'codegen-determinism.CD1',
        Name: 'CD1: every core entity has a ClassFactory BaseEntity registration whose SubClass extends BaseEntity',
        Fn: async (ctx): Promise<void> => {
            const entities = coreEntities(ctx);
            const failures: string[] = [];
            for (const e of entities) {
                const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, e.Name);
                if (!reg) {
                    failures.push(`'${e.Name}': no @RegisterClass(BaseEntity, ...) registration`);
                    continue;
                }
                const sub: unknown = reg.SubClass;
                if (typeof sub !== 'function' || !((sub as { prototype: unknown }).prototype instanceof BaseEntity)) {
                    failures.push(`'${e.Name}': registered SubClass is not a BaseEntity subclass`);
                }
            }
            Assert(failures.length === 0,
                `${failures.length}/${entities.length} core entities have broken registrations:\n  ${failures.slice(0, 15).join('\n  ')}${failures.length > 15 ? `\n  … +${failures.length - 15} more` : ''}`);
            console.log(`      → all ${entities.length} core entities resolve a BaseEntity registration by name`);
        }
    },
    {
        Id: 'codegen-determinism.CD2',
        Name: 'CD2: every core entity ClassName maps to exported <ClassName>Entity + <ClassName>Schema artifacts',
        Fn: async (ctx): Promise<void> => {
            const entities = coreEntities(ctx);

            // Anti-vacuity precondition: pin the ClassName → export-name mapping on a known entity
            // so a mapping-convention change fails HERE with a clear message, not as 300 misses below.
            const users = new Metadata().EntityByName('MJ: Users'); // global-provider-ok: integration test script — single-provider process by design
            Assert(!!users && !!users.ClassName, "'MJ: Users' must exist with a non-empty ClassName");
            Assert(typeof coreEntityExports[`${users!.ClassName}Entity`] === 'function' && !!asZodObject(coreEntityExports[`${users!.ClassName}Schema`]),
                `mapping precondition failed: expected exports '${users!.ClassName}Entity' + '${users!.ClassName}Schema' for 'MJ: Users' — the ClassName→export convention changed`);

            const failures: string[] = [];
            for (const e of entities) {
                if (!e.ClassName || e.ClassName.trim().length === 0) {
                    failures.push(`'${e.Name}': empty ClassName in metadata (see POSTGRES_SCHEMA_CASING_GUIDE)`);
                    continue;
                }
                const cls = coreEntityExports[`${e.ClassName}Entity`];
                if (typeof cls !== 'function') {
                    failures.push(`'${e.Name}': missing generated class export '${e.ClassName}Entity'`);
                }
                if (!asZodObject(coreEntityExports[`${e.ClassName}Schema`])) {
                    failures.push(`'${e.Name}': missing generated zod schema export '${e.ClassName}Schema'`);
                }
            }
            Assert(failures.length === 0,
                `${failures.length} generated-artifact gaps (schema drift — re-run CodeGen?):\n  ${failures.slice(0, 15).join('\n  ')}${failures.length > 15 ? `\n  … +${failures.length - 15} more` : ''}`);
            console.log(`      → ${entities.length} core entities all export <ClassName>Entity + <ClassName>Schema`);
        }
    },
    {
        Id: 'codegen-determinism.CD3',
        Name: 'CD3: generated zod schema shapes agree field-for-field with live entity metadata',
        Fn: async (ctx): Promise<void> => {
            const entities = coreEntities(ctx);
            const failures: string[] = [];
            let comparedFields = 0;
            for (const e of entities) {
                const schema = asZodObject(coreEntityExports[`${e.ClassName}Schema`]);
                if (!schema) {
                    continue; // CD2 owns this failure mode
                }
                const codeNames = new Set(e.Fields.map(f => f.CodeName));
                for (const f of e.Fields) {
                    comparedFields++;
                    if (!schemaKeyForField(schema.shape, f.CodeName)) {
                        failures.push(`'${e.Name}'.${f.Name}: live field missing from generated schema (CodeGen behind the DB?)`);
                    }
                }
                for (const key of Object.keys(schema.shape)) {
                    if (!fieldCodeNameForKey(codeNames, key)) {
                        failures.push(`'${e.Name}'.${key}: generated schema key has no live field (stale generated artifact?)`);
                    }
                }
            }
            Assert(comparedFields > 1000, `expected >1000 core fields to compare, got ${comparedFields} — vacuous run`);
            Assert(failures.length === 0,
                `${failures.length} schema↔metadata field mismatches:\n  ${failures.slice(0, 20).join('\n  ')}${failures.length > 20 ? `\n  … +${failures.length - 20} more` : ''}`);
            console.log(`      → ${comparedFields} fields across ${entities.length} entities agree between live metadata and generated schemas`);
        }
    },
    {
        Id: 'codegen-determinism.CD4',
        Name: "CD4: value-list ('List') fields — every live CHECK value parses, a bogus value is rejected (rule-2c drift)",
        Fn: async (ctx): Promise<void> => {
            const entities = coreEntities(ctx);
            const failures: string[] = [];
            let constrainedFields = 0;
            for (const e of entities) {
                const schema = asZodObject(coreEntityExports[`${e.ClassName}Schema`]);
                if (!schema) {
                    continue;
                }
                for (const f of e.Fields) {
                    if (f.ValueListType?.trim().toLowerCase() !== 'list' || f.TSType !== EntityFieldTSType.String) {
                        continue; // 'ListOrUserEntry' generates an open string type — only strict lists are unions
                    }
                    const values = f.EntityFieldValues ?? [];
                    if (values.length === 0) {
                        continue;
                    }
                    const key = schemaKeyForField(schema.shape, f.CodeName);
                    if (!key) {
                        continue; // CD3 owns the missing-key failure
                    }
                    constrainedFields++;
                    const fieldSchema = schema.shape[key];
                    for (const v of values) {
                        if (!fieldSchema.safeParse(v.Value).success) {
                            failures.push(`'${e.Name}'.${f.Name}: live value '${v.Value}' rejected by the generated union (CodeGen behind the CHECK constraint)`);
                        }
                    }
                    if (fieldSchema.safeParse('__MJ_IT_BOGUS_VALUE__').success) {
                        failures.push(`'${e.Name}'.${f.Name}: generated type accepts an arbitrary string — the value-list union was not generated`);
                    }
                }
            }
            Assert(constrainedFields > 50, `expected >50 strict value-list fields in core metadata, got ${constrainedFields} — vacuous run`);
            Assert(failures.length === 0,
                `${failures.length} value-list drift findings:\n  ${failures.slice(0, 20).join('\n  ')}${failures.length > 20 ? `\n  … +${failures.length - 20} more` : ''}`);
            console.log(`      → ${constrainedFields} value-list fields: every live value parses, bogus values rejected`);
        }
    },
    {
        Id: 'codegen-determinism.CD5',
        Name: 'CD5: no orphaned generated schema/class pairs (every MJ*Schema export maps back to a live core entity)',
        Fn: async (ctx): Promise<void> => {
            const entities = coreEntities(ctx);
            const byClassName = new Map<string, EntityInfo>();
            for (const e of entities) {
                if (e.ClassName) {
                    byClassName.set(e.ClassName, e);
                }
            }
            const orphans: string[] = [];
            let generatedPairs = 0;
            for (const exportName of Object.keys(coreEntityExports)) {
                if (!/^MJ\w+Schema$/.test(exportName) || !asZodObject(coreEntityExports[exportName])) {
                    continue;
                }
                const base = exportName.slice(0, -'Schema'.length);
                const cls: unknown = coreEntityExports[`${base}Entity`];
                if (typeof cls !== 'function' || !((cls as { prototype: unknown }).prototype instanceof BaseEntity)) {
                    continue; // not a generated schema/class pair (hand-written schema export)
                }
                generatedPairs++;
                if (!byClassName.has(base)) {
                    orphans.push(`${exportName}/${base}Entity: no live core entity with ClassName '${base}' (entity deleted but artifacts not regenerated?)`);
                }
            }
            Assert(generatedPairs >= entities.length, `expected at least ${entities.length} generated schema/class pairs, found ${generatedPairs} — export scan is broken`);
            Assert(orphans.length === 0,
                `${orphans.length} stale generated artifacts:\n  ${orphans.slice(0, 15).join('\n  ')}${orphans.length > 15 ? `\n  … +${orphans.length - 15} more` : ''}`);
            console.log(`      → ${generatedPairs} generated schema/class pairs, all map back to live core entities`);
        }
    },
    {
        Id: 'codegen-determinism.CD6',
        Name: 'CD6: generated source markers + registration-count parity (source-tree spot check)',
        Fn: async (ctx): Promise<void> => {
            // Runtime leg (always runs): the tree-shaking anchor the bootstraps rely on.
            Assert(typeof CoreEntities.loadModule === 'function', "core-entities must export the 'loadModule' tree-shaking anchor");
            CoreEntities.loadModule();

            const root = findRepoRoot();
            if (!root) {
                console.warn('  ⚠ codegen-determinism.CD6 source legs SKIPPED — MJ repo source tree not reachable from cwd '
                    + `('${process.cwd()}'); run from inside the repo to exercise the generated-file marker checks`);
                return;
            }
            const generatedDir = path.join(root, 'packages', 'MJCoreEntities', 'src', 'generated');
            const entitySource = fs.readFileSync(path.join(generatedDir, 'entity_subclasses.ts'), 'utf8');
            Assert(entitySource.includes('export const loadModule'), 'entity_subclasses.ts must carry the loadModule anchor');

            // Registration-count parity: the checked-in generated file must register exactly one
            // BaseEntity subclass per live core entity — fewer means CodeGen is behind the DB,
            // more means the DB lost entities the artifacts still carry.
            const rosterSource = readGeneratedEntitySource(generatedDir);
            const registrations = rosterSource.match(/@RegisterClass\(BaseEntity, '/g) ?? [];
            const entities = coreEntities(ctx);
            AssertEqual(registrations.length, entities.length,
                `the generated entity subclasses register ${registrations.length} entities but live metadata has ${entities.length} core entities — generated files and DB are out of step`);

            const remoteOpsPath = path.join(generatedDir, 'remote_operations.ts');
            const remoteOps = fs.readFileSync(remoteOpsPath, 'utf8');
            Assert(remoteOps.includes('GENERATED CODE - DO NOT MODIFY'),
                'remote_operations.ts must carry the GENERATED CODE do-not-modify banner');
            console.log(`      → source markers present; ${registrations.length} registrations in the generated file match live metadata`);
        }
    }
];

for (const check of CodegenDeterminismChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
