/**
 * Externalizing a property *inside* a JSON field.
 *
 * `pull.externalizeFields` names entity fields, so it can move a whole column into
 * a side file (`TemplateText` → `templates/x.md`) but cannot reach a single property
 * inside a JSON column. That is the wrong granularity whenever a column mixes
 * hand-authored config with a machine-generated artifact: MJ Tests keep step budgets,
 * oracles and the recorded `ReplayScript` in one `Configuration` blob, and
 * externalizing the whole thing would bury the readable half.
 *
 * A dotted config field (`Configuration.ReplayScript`) externalizes just the leaf and
 * leaves an `@file:` reference in its place. Push already resolves nested references
 * when it walks a metadata object, so the value round-trips with no push-side change.
 *
 * The file IO stays in `FieldExternalizer` — it is injected here as `externalize`, so
 * this module is only the JSON walk: find the leaf, hand it over, splice the reference
 * back. Pattern placeholders, path preservation and the unchanged-content skip all come
 * from that existing code.
 */

/** A sub-property externalization resolved against one field. */
export interface SubPropertyExternalization {
    /** Property path within the field's JSON, e.g. `['ReplayScript']`. */
    path: string[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** The `@file:` pattern to externalize to. */
    pattern: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

/** Writes a value to a file and returns the `@file:` reference naming it. */
export type ExternalizeLeaf = (
    value: unknown,
    pattern: string,
    existingRef?: string,
    leafName?: string
) => Promise<string>;

/**
 * The one `FieldExternalizer` method this module needs. `recordData` is declared as a
 * property bag rather than `BaseEntity` because that is all it is ever used for —
 * `RecordProcessor` hands the pulled properties straight through, and the externalizer
 * only reads `Name` / `ID` / field placeholders off it to build the filename.
 */
export interface FieldExternalizerLike {
    ExternalizeField(
        fieldName: string,
        fieldValue: unknown,
        pattern: string,
        recordData: Record<string, unknown>,
        targetDir: string,
        existingFileReference?: string,
        mergeStrategy?: string,
        verbose?: boolean
    ): Promise<string>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Split an `externalizeFields` entry into the entity field it targets and the property
 * path within that field. A name with no dot yields an empty path, which is how callers
 * tell a whole-field config (the existing behavior) from a sub-property one.
 */
export function ParseExternalizePath(configField: string): { field: string; path: string[] } {
    const [field, ...path] = configField.split('.');
    return { field, path };
}

/** @deprecated Use {@link ParseExternalizePath}. */
export function parseExternalizePath(configField: string): { field: string; path: string[] } {
    return ParseExternalizePath(configField);
}

/**
 * The sub-property externalizations rooted at `fieldName`. Whole-field entries are
 * excluded so they continue down the original code path untouched, and the legacy
 * string-array config form yields nothing because it can only name whole fields.
 */
export function FindSubPropertyExternalizations(
    fieldName: string,
    externalizeConfig: unknown
): SubPropertyExternalization[] {
    if (!Array.isArray(externalizeConfig)) {
        return [];
    }
    const found: SubPropertyExternalization[] = [];
    for (const entry of externalizeConfig) {
        if (!isPlainObject(entry) || typeof entry.field !== 'string' || typeof entry.pattern !== 'string') {
            continue;
        }
        const { field, path } = ParseExternalizePath(entry.field);
        if (path.length > 0 && field === fieldName) {
            found.push({ path, pattern: entry.pattern });
        }
    }
    return found;
}

/** @deprecated Use {@link FindSubPropertyExternalizations}. */
export function findSubPropertyExternalizations(
    fieldName: string,
    externalizeConfig: unknown
): SubPropertyExternalization[] {
    return FindSubPropertyExternalizations(fieldName, externalizeConfig);
}

/** Read the value at `path`, or `undefined` if any step is missing or not an object. */
export function GetAtPath(value: unknown, path: string[]): unknown {
    let cursor: unknown = value;
    for (const key of path) {
        if (!isPlainObject(cursor)) {
            return undefined;
        }
        cursor = cursor[key];
    }
    return cursor;
}

/** @deprecated Use {@link GetAtPath}. */
export function getAtPath(value: unknown, path: string[]): unknown {
    return GetAtPath(value, path);
}

/**
 * Bind a `FieldExternalizer` into the `ExternalizeLeaf` shape this module walks with.
 *
 * The serialization here is load-bearing. `FieldExternalizer` writes `String(value)` and
 * only pretty-prints when the field name hints at JSON, so handing it a parsed object
 * would write the literal text `[object Object]`. Serializing first gives a diffable file
 * and a stable string for the unchanged-content comparison that skips redundant writes.
 */
export function FieldExternalizerAdapter(
    externalizer: FieldExternalizerLike,
    recordProperties: Record<string, unknown>,
    targetDir: string,
    mergeStrategy: string = 'merge',
    verbose?: boolean
): ExternalizeLeaf {
    return async (value, pattern, existingRef, leafName) => {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        return externalizer.ExternalizeField(
            leafName ?? '',
            serialized,
            pattern,
            recordProperties,
            targetDir,
            existingRef,
            mergeStrategy,
            verbose
        );
    };
}

/** @deprecated Use {@link FieldExternalizerAdapter}. */
export function fieldExternalizerAdapter(
    externalizer: FieldExternalizerLike,
    recordProperties: Record<string, unknown>,
    targetDir: string,
    mergeStrategy: string = 'merge',
    verbose?: boolean
): ExternalizeLeaf {
    return FieldExternalizerAdapter(externalizer, recordProperties, targetDir, mergeStrategy, verbose);
}

/** A copy of `root` with `path` set to `leaf`. Untouched branches are shared, not cloned. */
function withLeaf(root: Record<string, unknown>, path: string[], leaf: unknown): Record<string, unknown> {
    const [head, ...rest] = path;
    if (rest.length === 0) {
        return { ...root, [head]: leaf };
    }
    const child = root[head];
    if (!isPlainObject(child)) {
        return root;
    }
    return { ...root, [head]: withLeaf(child, rest, leaf) };
}

/** JSON columns arrive as a string from the database and as an object from a metadata file. */
function coerceToObject(value: unknown): Record<string, unknown> | null {
    if (isPlainObject(value)) {
        return value;
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return isPlainObject(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Externalize each configured sub-property of `fieldValue`, returning the field value
 * with `@file:` references in their place.
 *
 * A path the value does not carry is skipped entirely — no file, no key — so a record
 * that never produced the artifact stays byte-identical. `existingFieldValue` is the
 * same field as it currently stands in the metadata file; the reference found at each
 * path is forwarded so `FieldExternalizer` can keep writing to the path already chosen
 * there instead of relocating the file to the pattern's default.
 *
 * Returns the input unchanged when nothing is configured or the value is not JSON.
 */
export async function ExternalizeSubProperties(
    fieldValue: unknown,
    configs: SubPropertyExternalization[],
    externalize: ExternalizeLeaf,
    existingFieldValue?: unknown
): Promise<unknown> {
    if (!configs || configs.length === 0) {
        return fieldValue;
    }
    const parsed = coerceToObject(fieldValue);
    if (!parsed) {
        return fieldValue;
    }

    const existing = coerceToObject(existingFieldValue);
    let result = parsed;

    for (const { path, pattern } of configs) {
        const leaf = GetAtPath(result, path);
        if (leaf === undefined || leaf === null) {
            continue;
        }
        const existingRef = existing ? GetAtPath(existing, path) : undefined;
        const reference = await externalize(
            leaf,
            pattern,
            typeof existingRef === 'string' ? existingRef : undefined,
            path[path.length - 1]
        );
        result = withLeaf(result, path, reference);
    }

    return result;
}

/** @deprecated Use {@link ExternalizeSubProperties}. */
export async function externalizeSubProperties(
    fieldValue: unknown,
    configs: SubPropertyExternalization[],
    externalize: ExternalizeLeaf,
    existingFieldValue?: unknown
): Promise<unknown> {
    return ExternalizeSubProperties(fieldValue, configs, externalize, existingFieldValue);
}
