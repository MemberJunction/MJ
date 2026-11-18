/**
 * Refuses a schema build whose selected objects produced no target table.
 *
 * `buildTargetConfigs` drops a selected object that is not in the source schema, has no fields or
 * has no primary key, and logs each drop — but every execution caller then built and ran a migration
 * anyway. With nothing accepted that migration is a header-only file: RSU wrote it, opened and merged
 * a PR, ran CodeGen, redeployed Explorer, and the sync "completed" over zero entity maps, every signal
 * green. Seen 2026-10-29 on a PropFuel connection: three selections requested, three dropped as
 * notInSchema, three empty migrations committed.
 *
 * A caller that asked for tables and gets none has failed, and should hear so with the names it asked
 * for and why each was dropped — in the error itself, because an API or UI caller cannot read the
 * server log line that used to be the only place the reasons appeared. Preview is deliberately not
 * gated: an empty preview is an honest answer.
 */
import type { TargetTableConfig } from '@memberjunction/integration-schema-builder';

/** Why `buildTargetConfigs` left each selected object out. */
export interface TargetConfigDrops {
    NotInSchema: string[];
    NoFields: string[];
    NoPrimaryKey: string[];
}

/** How many names one list in the error shows before summarising the rest — the summary log's cap. */
export const TARGET_CONFIG_NAME_SAMPLE = 5;

/** An empty set of drop lists, for `buildTargetConfigs` to fill. */
export function NewTargetConfigDrops(): TargetConfigDrops {
    return { NotInSchema: [], NoFields: [], NoPrimaryKey: [] };
}

/** `a, b, c, d, e and 163 more` — so a large selection cannot make a multi-KB error. */
export function SampleNames(names: ReadonlyArray<string>): string {
    const head = names.slice(0, TARGET_CONFIG_NAME_SAMPLE).join(', ');
    const rest = names.length - TARGET_CONFIG_NAME_SAMPLE;
    return rest > 0 ? `${head} and ${rest} more` : head;
}

/**
 * Throws `NO_TARGET_TABLES` when objects were selected and none produced a target table.
 *
 * @param drops why each object was dropped; without it the error lists the three possible reasons.
 * @param alreadyCommitted what the caller had already written before the build, for a caller that
 *   cannot honestly say "Nothing was applied" (schema evolution persists the catalog and disables the
 *   removed objects' maps first).
 */
export function AssertTargetConfigs(
    objects: ReadonlyArray<{ SourceObjectName: string }>,
    targetConfigs: ReadonlyArray<TargetTableConfig>,
    sourceType: string,
    drops?: TargetConfigDrops,
    alreadyCommitted?: string,
): void {
    if (objects.length === 0 || targetConfigs.length > 0) return;
    const reasons = drops ? describeDrops(drops) : '';
    throw new Error(
        `NO_TARGET_TABLES: none of the ${objects.length} selected object(s) for ${sourceType} produced a target table ` +
        `(${SampleNames(objects.map(o => o.SourceObjectName))}). ` +
        (reasons || 'Each was dropped as not in the source schema, without fields, or without a primary key.') +
        ` ${alreadyCommitted ?? 'Nothing was applied.'} Re-run discovery for this connection and apply again.`
    );
}

function describeDrops(drops: TargetConfigDrops): string {
    const parts: string[] = [];
    if (drops.NotInSchema.length > 0) parts.push(`not in the source schema: ${SampleNames(drops.NotInSchema)}`);
    if (drops.NoFields.length > 0) parts.push(`no fields: ${SampleNames(drops.NoFields)}`);
    if (drops.NoPrimaryKey.length > 0) parts.push(`no primary key: ${SampleNames(drops.NoPrimaryKey)}`);
    return parts.length > 0 ? `Dropped as ${parts.join('; ')}.` : '';
}
