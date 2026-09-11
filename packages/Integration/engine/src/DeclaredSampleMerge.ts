/**
 * Merging what a connector DECLARED about an object with what STREAMING THE SOURCE observed.
 *
 * ## Why sampling has to be unconditional
 *
 * Discovery used to stream records only when an object arrived with no fields — later widened to
 * "no fields, or no key". Both are gates on the wrong question, because sampling answers three
 * questions and a declaration can only pre-answer one of them:
 *
 * | question | can a declaration answer it? |
 * |---|---|
 * | what is the primary key? | **yes** — a declared key is authoritative |
 * | which fields does the source actually send? | no — a catalog lists what the vendor documents |
 * | how wide are the values? | no — only the data knows |
 *
 * So an object declared with fields AND a key was never sampled, and its undeclared columns arrived
 * later through the overflow path one sync at a time, while its widths were whatever the catalog
 * guessed. A column declared 100 wide against data that is 900 wide is not a slow discovery — it is
 * a truncation or a migration written by hand afterwards.
 *
 * ## The merge is per-attribute, and it is one-directional
 *
 * Sampling never overrides a deliberate declaration; it only fills gaps and widens:
 *
 * - **Primary key** — declared wins outright. An observed key is adopted only when none was declared.
 * - **New fields** — an observed field absent from the declaration is ADDED, so the column exists at
 *   RSU time instead of appearing in overflow after a sync.
 * - **Widths** — effective length is `max(declared, observed)`, and an unbounded declaration always
 *   wins over any measured number. Never shrink: shrinking is the one outcome that loses data.
 * - **Everything else** — labels, descriptions, types, nullability, FK targets — the declaration
 *   stands. A sampled type is inferred from a handful of values; a declared one was written down.
 *
 * The asymmetry is deliberate. A declaration that is WRONG about a width is corrected by the data;
 * a declaration that is RIGHT about a description is not second-guessed by a sample.
 */

/**
 * The only three attributes the merge reasons about. Declared fields and sampled fields are
 * different shapes elsewhere in the pipeline (`SourceType` vs `DataType`), and neither shape is
 * this module's business — the caller normalizes to one and gets the same one back.
 */
export interface MergeableField {
    Name: string;
    MaxLength?: number | null;
    IsPrimaryKey?: boolean;
}

/** A field's length where `null` means unbounded — the widest thing there is, never narrowed. */
export type FieldLength = number | null | undefined;

/**
 * Effective length for a field the source both declared and was observed producing.
 *
 * `null` (unbounded) beats every number, on either side: a declaration of "unbounded" is a
 * deliberate statement that no width is safe, and an observation that exceeded the bounded ceiling
 * is the data saying the same thing. Otherwise the larger wins, and a missing side yields to the
 * present one.
 */
export function MergeLength(declared: FieldLength, observed: FieldLength): FieldLength {
    if (declared === null || observed === null) return null;
    if (declared === undefined) return observed;
    if (observed === undefined) return declared;
    return Math.max(declared, observed);
}

/** The outcome of merging one object's declared fields with a sample, for logging and tests. */
export interface MergeOutcome<TField extends MergeableField> {
    Fields: TField[];
    /** Fields the sample found that the declaration never mentioned. */
    AddedFieldNames: string[];
    /** Fields whose declared length was too narrow for the observed data. */
    WidenedFieldNames: string[];
    /** Key columns adopted from the sample because none was declared. */
    AdoptedKeyNames: string[];
}

/**
 * Merges an observed field set into a declared one under the rules above.
 *
 * `declared` is returned unchanged in shape and order, with new fields appended — order carries
 * meaning to a reader comparing a catalog against a table, so observed fields do not interleave.
 */
export function MergeDeclaredWithSample<TField extends MergeableField>(
    declared: ReadonlyArray<TField>,
    observed: ReadonlyArray<TField>,
): MergeOutcome<TField> {
    const observedByLower = new Map(observed.map(f => [f.Name.toLowerCase(), f]));
    const declaredNames = new Set(declared.map(f => f.Name.toLowerCase()));
    const declaredHasKey = declared.some(f => f.IsPrimaryKey === true);

    const widened: string[] = [];
    const adoptedKeys: string[] = [];

    const merged: TField[] = declared.map(field => {
        const seen = observedByLower.get(field.Name.toLowerCase());
        if (!seen) return field;

        const length = MergeLength(field.MaxLength, seen.MaxLength);
        const widenedHere = length !== field.MaxLength;
        if (widenedHere) widened.push(field.Name);

        // The key is adopted only into a declaration that named none. A declared key is
        // authoritative even when the sample would have nominated a different column.
        const adoptKey = !declaredHasKey && seen.IsPrimaryKey === true;
        if (adoptKey) adoptedKeys.push(field.Name);

        if (!widenedHere && !adoptKey) return field;
        return {
            ...field,
            MaxLength: length ?? null,
            IsPrimaryKey: adoptKey ? true : field.IsPrimaryKey,
        };
    });

    // Fields the vendor sends but never documented. Appended as-is: the sample is the only thing
    // that knows anything about them, so there is nothing to defer to.
    const added: string[] = [];
    for (const seen of observed) {
        if (declaredNames.has(seen.Name.toLowerCase())) continue;
        added.push(seen.Name);
        merged.push({
            ...seen,
            // A key nominated on a field the declaration never mentioned is still only adopted
            // when nothing was declared — same rule, applied to the appended half.
            IsPrimaryKey: declaredHasKey ? false : seen.IsPrimaryKey,
        });
        if (!declaredHasKey && seen.IsPrimaryKey === true) adoptedKeys.push(seen.Name);
    }

    return { Fields: merged, AddedFieldNames: added, WidenedFieldNames: widened, AdoptedKeyNames: adoptedKeys };
}
