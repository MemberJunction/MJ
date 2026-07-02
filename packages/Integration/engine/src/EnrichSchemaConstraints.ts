import type { SourceObjectInfo, SourceFieldInfo } from './types.js';

/** Sentinel for a normalized name that maps to more than one object (ambiguous). */
const AMBIGUOUS = 'ambiguous';

/**
 * Optional one-shot description generator. When supplied, objects/fields with no
 * Description get ONE best-effort call (no iterate/converge). Omitted on AI-less
 * instances → descriptions are left as honest gaps, never fabricated. Return null to
 * leave the description unset.
 */
export type DescribeFn = (input: {
    kind: 'object' | 'field';
    objectName: string;
    fieldName?: string;
    sourceType?: string;
}) => Promise<string | null>;

export interface EnrichOptions {
    describeFn?: DescribeFn;
}

export interface EnrichResult {
    inferredForeignKeys: number;
    descriptionsAdded: number;
}

/**
 * Lightweight post-discovery enrichment — the runtime "LightweightConstraintDiscovery"
 * from the integration design. Fills PROVABLE gaps with NO hard AI dependency:
 *
 *  - Deterministic, naming-based FK inference: for a field the source did NOT declare
 *    as a foreign key, infer `ForeignKeyTarget` only when the column name unambiguously
 *    points at exactly one sibling object (e.g. `CompanyId` → `companies`, or a field
 *    whose name equals a sibling's PK field name). Ambiguous or self-referential
 *    matches are left alone — provable-only, never guess.
 *  - Optional one-shot descriptions when a `describeFn` is supplied (AI-optional; a
 *    no-op on instances without an AI provider, which is the common BI case).
 *
 * Operates on the discovered SourceObjectInfo[] in place, BEFORE persistence, so the
 * inferred FKs flow through IntegrationSchemaSync's normal Declared/Discovered merge
 * (they land as `MetadataSource='Discovered'`, soft FKs). Never throws.
 */
export class EnrichSchemaConstraints {
    public static async Enrich(objects: SourceObjectInfo[], options: EnrichOptions = {}): Promise<EnrichResult> {
        const inferredForeignKeys = this.InferForeignKeys(objects);
        let descriptionsAdded = 0;
        if (options.describeFn) {
            descriptionsAdded = await this.FillDescriptions(objects, options.describeFn);
        }
        return { inferredForeignKeys, descriptionsAdded };
    }

    /**
     * Deterministic naming-based FK inference. Mutates fields in place
     * (IsForeignKey + ForeignKeyTarget + the object's Relationships). Returns the count
     * inferred. Provable-only: a field is inferred to be an FK ONLY when its name maps
     * to exactly one OTHER object.
     */
    public static InferForeignKeys(objects: SourceObjectInfo[]): number {
        const byName = this.buildObjectNameIndex(objects);
        const pkNameToObject = this.buildPKNameIndex(objects);

        let count = 0;
        for (const obj of objects) {
            // A single (surrogate) PK is never an FK to itself, so it is skipped. But a
            // COMPOSITE PK is the junction/association pattern where each PK part is
            // typically an FK to a parent — e.g. a contacts↔companies association whose PK
            // is [contact_id, company_id]. Those MUST be inferred so the object becomes
            // FK-reachable and the sync DAG orders it AFTER its parents; without it the
            // association table never orders after its parents and silently fills in nothing.
            const isCompositePK = obj.PrimaryKeyFields.length > 1;
            for (const field of obj.Fields) {
                if (field.IsForeignKey && field.ForeignKeyTarget) continue; // already declared
                if (field.IsPrimaryKey && !isCompositePK) continue;          // surrogate PK ≠ FK; composite-PK parts may be

                const target = this.inferFieldTarget(field, byName, pkNameToObject);
                if (!target || target === AMBIGUOUS || target === obj.ExternalName) continue; // skip ambiguous / self

                field.IsForeignKey = true;
                field.ForeignKeyTarget = target;
                if (!obj.Relationships.some(r => r.FieldName === field.Name)) {
                    const targetObj = objects.find(o => o.ExternalName === target);
                    obj.Relationships.push({
                        FieldName: field.Name,
                        TargetObject: target,
                        TargetField: targetObj?.PrimaryKeyFields[0] ?? 'id',
                    });
                }
                count++;
            }
        }
        return count;
    }

    /** Fills missing Descriptions via a single describeFn call each. Best-effort, never throws. */
    private static async FillDescriptions(objects: SourceObjectInfo[], describe: DescribeFn): Promise<number> {
        let added = 0;
        for (const obj of objects) {
            if (!obj.Description) {
                const d = await this.safeDescribe(describe, { kind: 'object', objectName: obj.ExternalName });
                if (d) { obj.Description = d; added++; }
            }
            for (const field of obj.Fields) {
                if (!field.Description) {
                    const d = await this.safeDescribe(describe, { kind: 'field', objectName: obj.ExternalName, fieldName: field.Name, sourceType: field.SourceType });
                    if (d) { field.Description = d; added++; }
                }
            }
        }
        return added;
    }

    private static async safeDescribe(describe: DescribeFn, input: Parameters<DescribeFn>[0]): Promise<string | null> {
        try { return await describe(input); } catch { return null; }
    }

    /** Resolves the target object name a field's name points at, or null / AMBIGUOUS. */
    private static inferFieldTarget(
        field: SourceFieldInfo,
        byName: Map<string, string>,
        pkNameToObject: Map<string, string>
    ): string | null {
        // 1) Strip a trailing id-suffix and match the base against object-name variants.
        const base = field.Name.replace(/[_-]?id$/i, '');
        if (base && base.toLowerCase() !== field.Name.toLowerCase()) {
            const hit = this.lookupVariant(base, byName);
            if (hit) return hit; // may be AMBIGUOUS
        }
        // 2) Field name equals a sibling object's PK field name (e.g. ProfileID → object whose PK is ProfileID).
        const pkHit = pkNameToObject.get(field.Name.toLowerCase());
        if (pkHit) return pkHit; // may be AMBIGUOUS
        return null;
    }

    private static lookupVariant(base: string, byName: Map<string, string>): string | null {
        for (const v of this.normalizedVariants(base)) {
            const hit = byName.get(v);
            if (hit) return hit;
        }
        return null;
    }

    /** Map of normalized object-name variants → ExternalName (or AMBIGUOUS when >1 object shares it). */
    private static buildObjectNameIndex(objects: SourceObjectInfo[]): Map<string, string> {
        const map = new Map<string, string>();
        for (const o of objects) {
            for (const v of this.normalizedVariants(o.ExternalName)) {
                const existing = map.get(v);
                if (existing === undefined) map.set(v, o.ExternalName);
                else if (existing !== o.ExternalName) map.set(v, AMBIGUOUS);
            }
        }
        return map;
    }

    /** Map of lowercased PK field name → the single object declaring it (or AMBIGUOUS). */
    private static buildPKNameIndex(objects: SourceObjectInfo[]): Map<string, string> {
        const map = new Map<string, string>();
        for (const o of objects) {
            for (const pk of o.PrimaryKeyFields) {
                const key = pk.toLowerCase();
                const existing = map.get(key);
                if (existing === undefined) map.set(key, o.ExternalName);
                else if (existing !== o.ExternalName) map.set(key, AMBIGUOUS);
            }
        }
        return map;
    }

    /** Conservative singular/plural + lowercase variants of a name for matching. */
    private static normalizedVariants(name: string): string[] {
        const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const set = new Set<string>([lower]);
        if (lower.endsWith('ies')) set.add(lower.slice(0, -3) + 'y'); // companies → company
        if (lower.endsWith('es')) set.add(lower.slice(0, -2));         // boxes → box
        if (lower.endsWith('s')) set.add(lower.slice(0, -1));          // deals → deal
        set.add(lower + 's');                                          // company → companys (loose)
        if (lower.endsWith('y')) set.add(lower.slice(0, -1) + 'ies');  // company → companies
        return Array.from(set).filter(Boolean);
    }
}
