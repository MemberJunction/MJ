/**
 * `@memberjunction/connector-schema-merge`
 *
 * The never-shrink field-schema union a connector uses to enrich its DECLARED (docs/spec-derived)
 * introspected field set with fields observed by live SAMPLING, without ever losing or narrowing a
 * declared field. Wire it in the connector's `IntrospectSchema` override:
 *
 * ```ts
 * const info = await super.IntrospectSchema(companyIntegration, contextUser);
 * await Promise.all(info.Objects.map(async (obj) => {
 *   const sampled = await this.DiscoverFieldsViaFetch(companyIntegration, obj.ExternalName, contextUser);
 *   obj.Fields = mergeDeclaredWithSampledFields(obj.Fields, sampled);   // SourceFieldInfo[] × ExternalFieldSchema[]
 * }));
 * ```
 *
 * The two inputs are intentionally different engine shapes — the DECLARED side is the persisted
 * `SourceFieldInfo` (`SourceType`) that `IntrospectSchema` returns, and the SAMPLED side is the
 * `ExternalFieldSchema` (`DataType`) that `DiscoverFieldsViaFetch` returns. The helper maps sampled →
 * `SourceFieldInfo` internally and returns a single `SourceFieldInfo[]`, so the caller never has to
 * translate shapes. Connector-agnostic: no connector-specific logic.
 */
import type { SourceFieldInfo, ExternalFieldSchema } from '@memberjunction/integration-engine';

/** Numeric capacity attributes that must never SHRINK: take the larger of the two sources. */
const CAPACITY_ATTRIBUTES: ReadonlySet<string> = new Set(['MaxLength', 'Precision', 'Scale']);

const nameKey = (name: unknown): string => String(name ?? '').trim().toLowerCase();

/** Map a sampled `ExternalFieldSchema` to the persisted `SourceFieldInfo` shape (DataType → SourceType, defaults). */
function sampledToSource(f: ExternalFieldSchema): SourceFieldInfo {
    return {
        Name: f.Name,
        Label: f.Label,
        Description: f.Description,
        SourceType: f.DataType,
        IsRequired: f.IsRequired,
        AllowsNull: f.AllowsNull,
        MaxLength: f.MaxLength ?? null,
        Precision: f.Precision ?? null,
        Scale: f.Scale ?? null,
        DefaultValue: f.DefaultValue ?? null,
        IsPrimaryKey: f.IsPrimaryKey ?? false,
        IsUniqueKey: f.IsUniqueKey,
        IsReadOnly: f.IsReadOnly,
        IsForeignKey: f.IsForeignKey ?? false,
        ForeignKeyTarget: f.ForeignKeyTarget ?? null,
    };
}

/**
 * Merge a connector's DECLARED introspected fields (`SourceFieldInfo[]`) with a live SAMPLED field set
 * (`ExternalFieldSchema[]`) — never-shrink, provable-only, `max(declared, sampled)`.
 *
 * Rules:
 *  1. Every DECLARED field is kept, in its original order — the declared set never shrinks.
 *  2. For a field present in BOTH (matched case-insensitively + trimmed by `Name`), declared attributes
 *     are AUTHORITATIVE and win; a sampled attribute only fills a slot the declared field left
 *     `undefined`/`null` (augment gaps, never overwrite a provable declared value). Exception: a
 *     capacity attribute (`MaxLength`/`Precision`/`Scale`) takes the LARGER value so a column is never
 *     sized smaller than either source observed.
 *  3. A SAMPLED field with no declared counterpart is mapped to `SourceFieldInfo` and APPENDED — the
 *     source exposes a column the docs/spec didn't declare; capture it rather than drop it.
 *
 * @returns a new `SourceFieldInfo[]`; inputs are not mutated.
 */
export function mergeDeclaredWithSampledFields(
    declared: readonly SourceFieldInfo[] | undefined | null,
    sampled: readonly ExternalFieldSchema[] | undefined | null,
): SourceFieldInfo[] {
    const declaredList: readonly SourceFieldInfo[] = Array.isArray(declared) ? declared : [];
    const sampledList: readonly ExternalFieldSchema[] = Array.isArray(sampled) ? sampled : [];

    const sampledByName = new Map<string, SourceFieldInfo>();
    for (const f of sampledList) {
        if (f && f.Name != null) sampledByName.set(nameKey(f.Name), sampledToSource(f));
    }

    const declaredNames = new Set<string>();
    const merged: SourceFieldInfo[] = [];

    // 1. Every declared field — augmented (gaps filled / capacities widened) from its sampled twin. Never dropped.
    for (const d of declaredList) {
        if (!d || d.Name == null) { merged.push(d); continue; }
        const k = nameKey(d.Name);
        declaredNames.add(k);
        const s = sampledByName.get(k);
        merged.push(s ? augment(d, s) : d);
    }

    // 2. Sampled-only fields (a column the declaration didn't cover) — appended in sampled order.
    for (const f of sampledList) {
        if (!f || f.Name == null) continue;
        const k = nameKey(f.Name);
        if (!declaredNames.has(k)) merged.push(sampledByName.get(k)!);
    }

    return merged;
}

/** Declared attributes WIN; sampled fills empty slots; capacity attributes take the larger value. */
function augment(declared: SourceFieldInfo, sampled: SourceFieldInfo): SourceFieldInfo {
    const out: Record<string, unknown> = { ...(declared as unknown as Record<string, unknown>) };
    for (const [prop, sVal] of Object.entries(sampled as unknown as Record<string, unknown>)) {
        const dVal = out[prop];
        if ((dVal === undefined || dVal === null) && sVal !== undefined && sVal !== null) {
            out[prop] = sVal; // fill a declared gap
        } else if (CAPACITY_ATTRIBUTES.has(prop) && typeof dVal === 'number' && typeof sVal === 'number') {
            out[prop] = Math.max(dVal, sVal); // never shrink a capacity (MaxLength / Precision / Scale)
        }
    }
    return out as unknown as SourceFieldInfo;
}
