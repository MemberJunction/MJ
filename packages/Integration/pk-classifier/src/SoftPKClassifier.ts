import type {
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';

/** Strategy that produced the classifier's nominee, when one exists. */
export type PKClassifierStrategy =
    | 'universal-convention'
    | 'naming-heuristic'
    | 'statistical'
    | 'composite'
    | 'llm'
    | 'synthetic'
    | 'none';

/**
 * Canonical name of the synthetic identity-hash column nominated by the
 * synthetic-fallback tier. The framework materializes this column (an identity
 * hash of the record) so a table that has no provable natural PK is still
 * syncable (plan.md §4).
 */
export const SYNTHETIC_PK_FIELD_NAME = '__mj_integration_IdentityHash' as const;

/** Result returned by SoftPKClassifier.Classify(). */
export interface PKClassifierResult {
    /** Whether the classifier reached a confident nominee. */
    Confident: boolean;
    /**
     * Field name of the PK nominee, when Confident=true.
     * - Single-column natural PK → the resolving column's name.
     * - Synthetic fallback → SYNTHETIC_PK_FIELD_NAME.
     * - Composite key → the first member of NomineeFields (for callers that
     *   only read a single name); NomineeFields carries the full set.
     */
    Nominee?: string;
    /**
     * Ordered set of field names that together form the key. Populated for the
     * composite strategy (the minimal unique+stable column set). For single-column
     * and synthetic strategies this is the one-element set matching Nominee.
     */
    NomineeFields?: string[];
    /** Confidence score 0..1. */
    Confidence: number;
    /** Which strategy in the cascade produced the nominee. */
    Strategy: PKClassifierStrategy;
    /** Human-readable reason — used in audit trail + structured progress events. */
    Reason: string;
}

/** Options passed per Classify() call. */
export interface ClassifyOptions {
    /** The IntegrationObject being classified. */
    object: MJIntegrationObjectEntity;
    /** All IOF rows for that object. */
    fields: MJIntegrationObjectFieldEntity[];
    /**
     * Optional vendor-wide universal PK hint (e.g. "all HubSpot object PKs are `id`").
     * When set and a matching field exists, returned with strategy='universal-convention'
     * and high confidence. Agent populates this from research.
     */
    universalConvention?: string;
    /**
     * Optional pre-fetched sample rows for statistical uniqueness check.
     * When omitted, the statistical step is skipped (no chicken-and-egg fetching).
     */
    sampleRows?: Array<Record<string, unknown>>;
    /**
     * Optional LLM callback for the one-shot fallback. When omitted, the LLM step
     * is skipped and the classifier returns Confident=false rather than guessing.
     */
    llmInference?: LLMOneShotCallback;
    /** Confidence floor for Confident=true. Defaults to 0.7. */
    confidenceFloor?: number;
    /**
     * Largest column-set size the composite-key uniqueness scan will try when
     * no single column is unique. Defaults to 3 (try 2-col then 3-col sets).
     * Only consulted when sampleRows are present.
     */
    maxCompositeKeySize?: number;
    /**
     * When true (default), and every other tier fails to find/prove a PK, the
     * classifier returns a Confident synthetic verdict nominating
     * SYNTHETIC_PK_FIELD_NAME — an identity-hash column the framework
     * materializes so NO table is left without a PK (plan.md §4). Set false to
     * opt out and receive the honest 'none' verdict instead.
     */
    syntheticFallback?: boolean;
}

/** Callback shape for the one-shot LLM step. */
export type LLMOneShotCallback = (prompt: LLMPrompt) => Promise<LLMResponse>;
export interface LLMPrompt {
    objectName: string;
    fields: Array<{ name: string; type?: string | null; isUnique?: boolean | null; length?: number | null }>;
    sampleSnippet?: string;
}
export interface LLMResponse {
    nominee: string | null;
    confidence: number;
    reason: string;
}

/**
 * Lightweight PK classifier. Cascade (each step is independent; first confident
 * nominee wins):
 *
 *   1. Universal convention   — vendor-wide hint matches a field
 *   2. Naming heuristic       — common PK names (id, ID, <ObjectName>Id, …)
 *   3. Statistical uniqueness — sample rows: exactly one column is unique+non-null
 *   4. One-shot LLM           — single inference; no iteration; honest 'none'
 *
 * Returns Confident=false when nothing is confident enough. The pipeline then
 * leaves the IO row PK-less; no `__mj.Entity` is created for it until a PK
 * resolves (the runtime D7 rule). No fabrication.
 */
export class SoftPKClassifier {
    public async Classify(opts: ClassifyOptions): Promise<PKClassifierResult> {
        const floor = opts.confidenceFloor ?? 0.7;

        // 1) Universal convention
        if (opts.universalConvention) {
            const m = opts.fields.find(f => this.nameMatches(f.Name, opts.universalConvention!));
            if (m) {
                return {
                    Confident: true,
                    Nominee: m.Name,
                    Confidence: 0.95,
                    Strategy: 'universal-convention',
                    Reason: `Vendor universal convention "${opts.universalConvention}" matched field "${m.Name}".`,
                };
            }
        }

        // 2) Naming heuristic
        const namingMatch = this.namingHeuristic(opts.object.Name, opts.fields);
        if (namingMatch) {
            return {
                Confident: true,
                Nominee: namingMatch.fieldName,
                Confidence: namingMatch.confidence,
                Strategy: 'naming-heuristic',
                Reason: namingMatch.reason,
            };
        }

        // 3) Statistical (when sample rows present)
        if (opts.sampleRows && opts.sampleRows.length > 0) {
            const statMatch = this.statisticalUniqueness(opts.fields, opts.sampleRows);
            if (statMatch && statMatch.confidence >= floor) {
                return {
                    Confident: true,
                    Nominee: statMatch.fieldName,
                    NomineeFields: [statMatch.fieldName],
                    Confidence: statMatch.confidence,
                    Strategy: 'statistical',
                    Reason: statMatch.reason,
                };
            }
        }

        // 3b) Composite uniqueness (when no single column is unique) — try minimal
        //     2- then 3-col concatenated key sets; smallest unique+stable set wins.
        if (opts.sampleRows && opts.sampleRows.length > 0) {
            const maxSetSize = opts.maxCompositeKeySize ?? 3;
            const compMatch = this.compositeUniqueness(opts.fields, opts.sampleRows, maxSetSize);
            if (compMatch && compMatch.confidence >= floor) {
                return {
                    Confident: true,
                    Nominee: compMatch.fieldNames[0],
                    NomineeFields: compMatch.fieldNames,
                    Confidence: compMatch.confidence,
                    Strategy: 'composite',
                    Reason: compMatch.reason,
                };
            }
        }

        // 4) LLM one-shot (when callback provided)
        if (opts.llmInference) {
            try {
                const llm = await opts.llmInference({
                    objectName: opts.object.Name,
                    fields: opts.fields.map(f => ({
                        name: f.Name,
                        type: f.Type ?? null,
                        isUnique: f.IsUniqueKey,
                        length: f.Length ?? null,
                    })),
                    sampleSnippet: opts.sampleRows ? JSON.stringify(opts.sampleRows.slice(0, 3)) : undefined,
                });
                if (llm.nominee && llm.confidence >= floor) {
                    const exists = opts.fields.some(f => f.Name === llm.nominee);
                    if (exists) {
                        return {
                            Confident: true,
                            Nominee: llm.nominee,
                            NomineeFields: [llm.nominee],
                            Confidence: llm.confidence,
                            Strategy: 'llm',
                            Reason: llm.reason || 'LLM one-shot classification.',
                        };
                    }
                }
            } catch (err) {
                // LLM failures never crash the pipeline. Fall through to the synthetic
                // fallback (when enabled) so the table is still rescued; otherwise 'none'.
                const llmFailNote = `LLM inference failed: ${err instanceof Error ? err.message : String(err)}.`;
                return this.finalVerdict(opts, llmFailNote);
            }
        }

        // 5) Synthetic fallback (default) or honest no-PK.
        return this.finalVerdict(opts);
    }

    /**
     * Terminal tier. When syntheticFallback is on (default), nominates the
     * synthetic identity-hash column so no table is left PK-less (plan.md §4).
     * When off, returns the honest 'none' verdict.
     */
    private finalVerdict(opts: ClassifyOptions, prefix?: string): PKClassifierResult {
        const note = prefix ? `${prefix} ` : '';
        if (opts.syntheticFallback ?? true) {
            return {
                Confident: true,
                Nominee: SYNTHETIC_PK_FIELD_NAME,
                NomineeFields: [SYNTHETIC_PK_FIELD_NAME],
                Confidence: 0.7,
                Strategy: 'synthetic',
                Reason: `${note}No natural PK proven via universal-convention, naming, statistical, composite, or LLM strategies. Falling back to a synthetic identity-hash key "${SYNTHETIC_PK_FIELD_NAME}" so the table remains syncable (plan.md §4).`,
            };
        }
        return {
            Confident: false,
            Confidence: 0,
            Strategy: 'none',
            Reason: `${note}No confident PK candidate via universal-convention, naming, statistical, composite, or LLM strategies, and synthetic fallback is disabled. IO row persists; MJ entity not generated until a PK resolves.`,
        };
    }

    /** Case-insensitive equality with simple whitespace tolerance. */
    private nameMatches(actual: string, hint: string): boolean {
        return actual.trim().toLowerCase() === hint.trim().toLowerCase();
    }

    /** Common PK naming patterns. Order matters — most-specific first. */
    private namingHeuristic(
        objectName: string,
        fields: MJIntegrationObjectFieldEntity[]
    ): { fieldName: string; confidence: number; reason: string } | undefined {
        const sing = this.singularize(objectName);
        const candidates: Array<{ pattern: RegExp; confidence: number; reasonTpl: string }> = [
            { pattern: new RegExp(`^${this.escapeRe(sing)}_?id$`, 'i'), confidence: 0.9, reasonTpl: 'Field matches "<ObjectNameSingular>Id" pattern' },
            { pattern: new RegExp(`^${this.escapeRe(objectName)}_?id$`, 'i'), confidence: 0.88, reasonTpl: 'Field matches "<ObjectName>Id" pattern' },
            { pattern: /^id$/i, confidence: 0.85, reasonTpl: 'Field is named "id" (common universal PK)' },
            { pattern: /^uuid$/i, confidence: 0.8, reasonTpl: 'Field is named "uuid"' },
            { pattern: /^guid$/i, confidence: 0.75, reasonTpl: 'Field is named "guid"' },
        ];
        for (const c of candidates) {
            const m = fields.find(f => c.pattern.test(f.Name));
            if (m) {
                return {
                    fieldName: m.Name,
                    confidence: c.confidence,
                    reason: c.reasonTpl.replace('<ObjectName>', objectName).replace('<ObjectNameSingular>', sing),
                };
            }
        }
        return undefined;
    }

    /** Sample uniqueness: exactly one field is unique + non-null across the sample. */
    private statisticalUniqueness(
        fields: MJIntegrationObjectFieldEntity[],
        rows: Array<Record<string, unknown>>
    ): { fieldName: string; confidence: number; reason: string } | undefined {
        const candidates: Array<{ fieldName: string; uniqueRatio: number; nullRatio: number }> = [];
        for (const f of fields) {
            const values = rows.map(r => r[f.Name]);
            const nonNull = values.filter(v => this.isPresent(v));
            const nullRatio = 1 - (nonNull.length / rows.length);
            if (nullRatio > 0) continue; // PK fields are non-null
            const distinct = new Set(nonNull.map(v => String(v)));
            const uniqueRatio = distinct.size / nonNull.length;
            if (uniqueRatio === 1.0) {
                candidates.push({ fieldName: f.Name, uniqueRatio, nullRatio });
            }
        }
        if (candidates.length === 0) return undefined;
        // Single uniquely-identifying column → strong signal
        if (candidates.length === 1) {
            return {
                fieldName: candidates[0].fieldName,
                confidence: 0.85,
                reason: `Sole field unique + non-null across ${rows.length} sample rows.`,
            };
        }
        // Multiple unique columns → ambiguous; defer to a more specific signal
        return undefined;
    }

    /**
     * Composite-key uniqueness: when no single column uniquely identifies a row,
     * search for the SMALLEST set of columns (size 2..maxSetSize) whose
     * concatenated values are unique + non-null across the sample. Returns the
     * minimal such set; among sets of equal size, the one over the fewest-
     * distinct-but-still-unique columns wins (deterministic by field order).
     */
    private compositeUniqueness(
        fields: MJIntegrationObjectFieldEntity[],
        rows: Array<Record<string, unknown>>,
        maxSetSize: number
    ): { fieldNames: string[]; confidence: number; reason: string } | undefined {
        const stable = this.stableColumns(fields, rows);
        if (stable.length < 2) return undefined;
        const cap = Math.min(Math.max(maxSetSize, 2), stable.length);
        for (let size = 2; size <= cap; size++) {
            const winner = this.firstUniqueCombination(stable, rows, size);
            if (winner) {
                return {
                    fieldNames: winner,
                    confidence: 0.8,
                    reason: `Composite key of ${winner.length} columns [${winner.join(', ')}] is unique + non-null across ${rows.length} sample rows (no single column was unique).`,
                };
            }
        }
        return undefined;
    }

    /** Columns that are non-null across every sample row (PK members must be non-null). */
    private stableColumns(
        fields: MJIntegrationObjectFieldEntity[],
        rows: Array<Record<string, unknown>>
    ): string[] {
        return fields
            .filter(f => rows.every(r => this.isPresent(r[f.Name])))
            .map(f => f.Name);
    }

    /** First combination of `size` columns whose concatenated values are all distinct. */
    private firstUniqueCombination(
        columns: string[],
        rows: Array<Record<string, unknown>>,
        size: number
    ): string[] | undefined {
        for (const combo of this.combinations(columns, size)) {
            if (this.isCombinationUnique(combo, rows)) return combo;
        }
        return undefined;
    }

    /** Whether the concatenated values of `combo` are distinct across all rows. */
    private isCombinationUnique(combo: string[], rows: Array<Record<string, unknown>>): boolean {
        const seen = new Set<string>();
        for (const r of rows) {
            const key = combo.map(c => `${String(r[c])}`).join(' ');
            if (seen.has(key)) return false;
            seen.add(key);
        }
        return true;
    }

    /** Lazily yield all k-combinations of `items`, preserving input order. */
    private *combinations(items: string[], k: number): Generator<string[]> {
        const n = items.length;
        if (k > n || k <= 0) return;
        const idx = Array.from({ length: k }, (_, i) => i);
        while (true) {
            yield idx.map(i => items[i]);
            let p = k - 1;
            while (p >= 0 && idx[p] === n - k + p) p--;
            if (p < 0) return;
            idx[p]++;
            for (let j = p + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
        }
    }

    /** A value counts as present (non-null) for PK purposes. */
    private isPresent(v: unknown): boolean {
        return v !== null && v !== undefined && v !== '';
    }

    /** Very simple singularization — sufficient for common cases (Members→Member, Companies→Companie isn't perfect but covers most). */
    private singularize(name: string): string {
        if (/ies$/i.test(name)) return name.slice(0, -3) + 'y';
        if (/ses$/i.test(name)) return name.slice(0, -2);
        if (/s$/i.test(name) && name.length > 1) return name.slice(0, -1);
        return name;
    }

    private escapeRe(s: string): string {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
