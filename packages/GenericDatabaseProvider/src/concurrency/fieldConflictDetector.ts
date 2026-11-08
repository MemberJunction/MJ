import { EntityFieldInfo, EntityFieldTSType, EntityInfo } from '@memberjunction/core';
import { Canonicalize, ENCRYPTED_SENTINEL, IsOnlyTimezoneShift } from '@memberjunction/global';

/**
 * One field's values in a concurrency-conflict diagnostic.
 */
export interface ConflictDiagnosticEntry<TValue = unknown> {
    FieldName: string;
    ClientOldValue?: TValue;
    ClientNewValue?: TValue;
    DBValue?: TValue;
}

/**
 * Result of comparing a caller's baseline (`OldValue` or `ConcurrencyBaseline`) and intended new values
 * against the authoritative row currently stored in the database.
 */
export interface FieldConcurrencyCheckResult<TValue = unknown> {
    /** Fields where the stored database value differs from both the baseline and the caller's intended new value. */
    ConflictingFields: string[];
    /** Fields modified by the caller relative to the baseline. */
    ClientDifferences: ConflictDiagnosticEntry<TValue>[];
    /** Fields where the stored database value differs from the baseline. */
    DBDifferences: ConflictDiagnosticEntry<TValue>[];
    /** Subset of `ClientDifferences` that conflict with concurrent database edits. */
    Overlap: ConflictDiagnosticEntry<TValue>[];
    /** Fields that changed in the database but were NOT modified by the caller (safe to preserve from DB). */
    FieldsToPreserveFromDB: Set<string>;
}

/**
 * Resolves a field on `entityInfo` by `CodeName` or `Name` in O(1) via `FieldByCodeName` /
 * `FieldByName` when available on `EntityInfo`, falling back to `.Fields.find()` for test stubs.
 */
export function FindEntityFieldByCodeNameOrName(entityInfo: EntityInfo, key: string): EntityFieldInfo | undefined {
    if (typeof entityInfo.FieldByCodeName === 'function') {
        return entityInfo.FieldByCodeName(key) ?? entityInfo.FieldByName(key);
    }
    return entityInfo.Fields.find((f) => f.CodeName === key || f.Name === key);
}

/**
 * Whether the API never gives a client this field's stored value: an encrypted field that is not
 * decrypted for the API reaches the client only as the sentinel or as fresh ciphertext, so the
 * client's old value for it can never be compared with the database value.
 */
export function IsFieldOpaqueToClient(field: EntityFieldInfo | undefined): boolean {
    return Boolean(field?.Encrypt && !field.AllowDecryptInAPI);
}

/**
 * Converts one client-sent old value (typically a string on the wire; dates as epoch milliseconds,
 * the GraphQL Timestamp form) to the field's TypeScript type, so it compares equal to the stored
 * value.
 */
export function ClientOldValueToFieldValue(
    field: EntityFieldInfo | undefined,
    raw: unknown,
): string | number | boolean | Date | null {
    let val: unknown = raw;
    if (
        (val === null || val === undefined) &&
        field &&
        field.DefaultValue !== null &&
        field.DefaultValue !== undefined &&
        !field.AllowsNull
    ) {
        val = field.DefaultValue;
    }
    if (val === undefined) val = null;
    if (field?.TSType === EntityFieldTSType.Boolean && val === null) return false;
    if (val === null) return null;
    if (!field) {
        return typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' || val instanceof Date
            ? val
            : String(val);
    }

    if (val instanceof Date && field.TSType === EntityFieldTSType.Date) {
        return val;
    }

    const text = String(val);
    switch (field.TSType) {
        case EntityFieldTSType.Number: {
            const integer = ['int', 'smallint', 'bigint', 'tinyint'].includes((field.Type as string).toLowerCase());
            return integer ? parseInt(text) : parseFloat(text);
        }
        case EntityFieldTSType.Boolean:
            return !(text === 'false' || text === '0' || parseInt(text) === 0);
        case EntityFieldTSType.Date:
            return new Date(text.trim() !== '' && !isNaN(Number(text)) ? parseInt(text) : text);
        default:
            return text;
    }
}

function dateColumnResolutionMs(field: EntityFieldInfo | undefined): number {
    switch ((field?.Type ?? '').trim().toLowerCase()) {
        case 'datetime':
            return 1000 / 300;
        case 'smalldatetime':
            return 60_000;
        default:
            return 1;
    }
}

/**
 * True when two instants would be stored as the same value in the field's column: SQL Server
 * `datetime` resolves to 1/300 s and `smalldatetime` to one minute; every other type keeps milliseconds.
 */
export function DatesEqualAtColumnResolution(field: EntityFieldInfo | undefined, left: Date, right: Date): boolean {
    return Math.abs(left.getTime() - right.getTime()) < dateColumnResolutionMs(field);
}

function canonicalJSONDocument(text: string): string | null {
    const first = text.trimStart().charAt(0);
    if (first !== '{' && first !== '[') {
        return null;
    }
    try {
        return Canonicalize(JSON.parse(text));
    } catch {
        return null;
    }
}

/**
 * True when both strings are JSON documents with the same content, ignoring whitespace and key order.
 */
export function JsonStringsEquivalent(left: string, right: string): boolean {
    const canonicalLeft = canonicalJSONDocument(left);
    return canonicalLeft !== null && canonicalLeft === canonicalJSONDocument(right);
}

/**
 * Compares two typed entity field values for semantic inequality, handling `Date` epoch equality
 * (plus optional non-`datetimeoffset` timezone-hour-shift tolerance), JSON key-order equivalence,
 * and `null`/`undefined` normalization.
 */
export function AreEntityFieldValuesDifferent<TLeft, TRight>(
    field: EntityFieldInfo | undefined,
    left: TLeft,
    right: TRight,
    allowTimezoneShiftWarning: boolean = false,
    fieldKeyForLog?: string,
): boolean {
    const normalizedLeft = left === undefined ? null : left;
    const normalizedRight = right === undefined ? null : right;

    if (normalizedLeft instanceof Date) {
        const rightDate =
            normalizedRight instanceof Date
                ? normalizedRight
                : field?.TSType === EntityFieldTSType.Date && normalizedRight !== null
                  ? ClientOldValueToFieldValue(field, normalizedRight)
                  : null;
        if (!(rightDate instanceof Date) || isNaN(rightDate.getTime())) {
            return true;
        }
        if (DatesEqualAtColumnResolution(field, normalizedLeft, rightDate)) {
            return false;
        }
        const sqlType = field?.SQLFullType?.trim().toLowerCase() || '';
        if (sqlType !== 'datetimeoffset' && IsOnlyTimezoneShift(normalizedLeft, rightDate)) {
            if (allowTimezoneShiftWarning && fieldKeyForLog) {
                console.warn(
                    `Timezone hour shift detected on field "${fieldKeyForLog}" (${sqlType || 'datetime'}). ` +
                        `Client: ${normalizedLeft.toISOString()}, DB: ${rightDate.toISOString()}. ` +
                        `Consider using datetimeoffset to avoid timezone ambiguity.`,
                );
            }
            return false;
        }
        return true;
    }

    if (normalizedRight instanceof Date && field?.TSType === EntityFieldTSType.Date && normalizedLeft !== null) {
        const leftDate = ClientOldValueToFieldValue(field, normalizedLeft);
        if (leftDate instanceof Date && !isNaN(leftDate.getTime())) {
            return !DatesEqualAtColumnResolution(field, leftDate, normalizedRight);
        }
    }

    if (
        typeof normalizedLeft === 'string' &&
        typeof normalizedRight === 'string' &&
        JsonStringsEquivalent(normalizedLeft, normalizedRight)
    ) {
        return false;
    }

    return Object.is(normalizedLeft, normalizedRight) ? false : normalizedLeft !== (normalizedRight as never);
}

/**
 * The caller's new values without the opaque fields it only echoed back: the sentinel, or the same
 * value it received as the old value. Writing either would replace the stored secret.
 */
export function WithoutEchoedOpaqueValues<TOldVal, TNewVal>(
    entityInfo: EntityInfo,
    clientNewValues: Record<string, TNewVal>,
    clientOldValues: Record<string, TOldVal>,
): Record<string, TNewVal> {
    const kept: Record<string, TNewVal> = {};
    for (const key of Object.keys(clientNewValues)) {
        const f = FindEntityFieldByCodeNameOrName(entityInfo, key);
        const newValue = clientNewValues[key];
        const unchanged =
            key in clientOldValues && !AreEntityFieldValuesDifferent(f, clientOldValues[key], newValue, false);
        const echoed = IsFieldOpaqueToClient(f) && (newValue === ENCRYPTED_SENTINEL || unchanged);
        if (!echoed) {
            kept[key] = newValue;
        }
    }
    return kept;
}

/**
 * Copies concurrency-conflict diagnostic entries with every encrypted field's values replaced by
 * the sentinel, so the console, the error log and `MJ: Error Logs` never hold a secret.
 */
export function RedactEncryptedConflictValues<TValue>(
    entityInfo: EntityInfo,
    entries: ReadonlyArray<ConflictDiagnosticEntry<TValue>>,
): ConflictDiagnosticEntry<TValue | string>[] {
    return entries.map((entry) => {
        if (!FindEntityFieldByCodeNameOrName(entityInfo, entry.FieldName)?.Encrypt) {
            return entry;
        }
        const redacted: ConflictDiagnosticEntry<TValue | string> = { FieldName: entry.FieldName };
        if ('ClientOldValue' in entry) redacted.ClientOldValue = ENCRYPTED_SENTINEL;
        if ('ClientNewValue' in entry) redacted.ClientNewValue = ENCRYPTED_SENTINEL;
        if ('DBValue' in entry) redacted.DBValue = ENCRYPTED_SENTINEL;
        return redacted;
    });
}

/**
 * Detects field-level concurrency conflicts between a caller's baseline (`baselineValues`),
 * intended new values (`newValues`), and the authoritative database row (`storedValues`).
 *
 * A conflict occurs when:
 * 1. The caller modified a writable, non-PK field (`baselineValues[k] !== newValues[k]`), AND
 * 2. The stored database value differs from the baseline (`baselineValues[k] !== storedValues[k]`), AND
 * 3. The stored database value ALSO differs from the caller's intended new value (`newValues[k] !== storedValues[k]`).
 *
 * All returned diagnostic arrays (`ClientDifferences`, `DBDifferences`, `Overlap`) have encrypted
 * field values redacted to `ENCRYPTED_SENTINEL`.
 */
export function DetectFieldConcurrencyConflicts<TBaseline, TNew, TStored>(
    entityInfo: EntityInfo,
    baselineValues: Record<string, TBaseline>,
    newValues: Record<string, TNew>,
    storedValues: Record<string, TStored>,
): FieldConcurrencyCheckResult<TBaseline | TNew | TStored | string> {
    type AnyVal = TBaseline | TNew | TStored;
    const rawDBDifferences: ConflictDiagnosticEntry<AnyVal>[] = [];
    const dbDiffByField = new Map<string, ConflictDiagnosticEntry<AnyVal>>();

    for (const key of Object.keys(baselineValues)) {
        const f = FindEntityFieldByCodeNameOrName(entityInfo, key);
        if (IsFieldOpaqueToClient(f)) {
            continue;
        }
        const dbVal: AnyVal =
            f && f.Name in storedValues
                ? storedValues[f.Name]
                : f && f.CodeName in storedValues
                  ? storedValues[f.CodeName]
                  : storedValues[key];
        const different = AreEntityFieldValuesDifferent(f, baselineValues[key], dbVal, true, key);
        if (different && f && !f.ReadOnly) {
            const entry: ConflictDiagnosticEntry<AnyVal> = {
                FieldName: key,
                ClientOldValue: baselineValues[key],
                DBValue: dbVal,
            };
            rawDBDifferences.push(entry);
            dbDiffByField.set(key, entry);
        }
    }

    const rawClientDifferences: ConflictDiagnosticEntry<AnyVal>[] = [];
    const clientDiffFieldNames = new Set<string>();
    const fieldsToPreserveFromDB = new Set<string>();

    if (rawDBDifferences.length > 0) {
        for (const key of Object.keys(baselineValues)) {
            const f = FindEntityFieldByCodeNameOrName(entityInfo, key);
            const newVal: AnyVal | undefined =
                key in newValues
                    ? newValues[key]
                    : f && f.Name in newValues
                      ? newValues[f.Name]
                      : f && f.CodeName in newValues
                        ? newValues[f.CodeName]
                        : undefined;
            const hasNewKey =
                key in newValues ||
                Boolean(f && (f.Name in newValues || f.CodeName in newValues));
            if (
                hasNewKey &&
                f &&
                f.AllowUpdateAPI &&
                !f.IsPrimaryKey &&
                AreEntityFieldValuesDifferent(f, baselineValues[key], newVal, false)
            ) {
                rawClientDifferences.push({
                    FieldName: key,
                    ClientOldValue: baselineValues[key],
                    ClientNewValue: newVal,
                });
                clientDiffFieldNames.add(key);
            }
        }

        for (const dd of rawDBDifferences) {
            if (!clientDiffFieldNames.has(dd.FieldName)) {
                fieldsToPreserveFromDB.add(dd.FieldName);
                const f = FindEntityFieldByCodeNameOrName(entityInfo, dd.FieldName);
                if (f) {
                    fieldsToPreserveFromDB.add(f.Name);
                    fieldsToPreserveFromDB.add(f.CodeName);
                }
            }
        }
    }

    const rawOverlap: ConflictDiagnosticEntry<AnyVal>[] = [];
    for (const cd of rawClientDifferences) {
        const dd = dbDiffByField.get(cd.FieldName);
        if (!dd) {
            continue;
        }
        const f = FindEntityFieldByCodeNameOrName(entityInfo, cd.FieldName);
        if (AreEntityFieldValuesDifferent(f, cd.ClientNewValue, dd.DBValue, true)) {
            rawOverlap.push({
                FieldName: cd.FieldName,
                ClientOldValue: cd.ClientOldValue,
                ClientNewValue: cd.ClientNewValue,
                DBValue: dd.DBValue,
            });
        }
    }

    return {
        ConflictingFields: rawOverlap.map((o) => o.FieldName),
        ClientDifferences: RedactEncryptedConflictValues(entityInfo, rawClientDifferences),
        DBDifferences: RedactEncryptedConflictValues(entityInfo, rawDBDifferences),
        Overlap: RedactEncryptedConflictValues(entityInfo, rawOverlap),
        FieldsToPreserveFromDB: fieldsToPreserveFromDB,
    };
}
