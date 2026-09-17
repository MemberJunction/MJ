import { EntityField } from "./baseEntity";
import { EntityInfo } from "./entityInfo";
import { UUIDsEqual } from "@memberjunction/global";


/**
 * Used to a store a combination of a key and value pair for a variety of purposes including primary/foreign keys. 
 */
export class KeyValuePair {
    /**
     * Field name of the key value pair
     */
    FieldName: string
    /**
     * Value of the key value pair
     */
    Value: any

    /**
     * Construct a new instance by optionally providing a field name and value.
     * This is useful for creating a key value pair on the fly without needing to set the properties manually.
     * @param fieldName 
     * @param value 
     */
    constructor(fieldName?: string, value?: any) {
        this.FieldName = fieldName || '';
        this.Value = value;
    }
}

/**
 * Base class for tracking a collection of field name(key)/value pair combinations with utility methods for working with them.
 */
export class FieldValueCollection {
    KeyValuePairs: KeyValuePair[];

    constructor(keyValuePairs?: KeyValuePair[]) {
        if(keyValuePairs && Array.isArray(keyValuePairs)){
            if(keyValuePairs.length > 0){
                let kvp = keyValuePairs[0];
                if(kvp.FieldName && kvp.Value){
                    this.KeyValuePairs = keyValuePairs;
                    return;
                }
            }
        }
        
        this.KeyValuePairs = [];
    }

    /**
     * returns the value of the key value pair for the specified field name
     * @param fieldName the field name to get the value for
     * @returns the value of the key value pair for the specified field name
     */
    GetValueByFieldName(fieldName: string): any {
        let key = this.KeyValuePairs.find((keyValue) => {
            return keyValue.FieldName === fieldName;
        });

        return key ? key.Value : null;
    }

    /**
     * returns the value of the key value pair at the specified index
     * @param index the index of the key value pair to get the value for
     * @returns the value of the key value pair at the specified index
     */
    GetValueByIndex(index: number): any {
        if (index >= 0 && index < this.KeyValuePairs.length) {
            return this.KeyValuePairs[index].Value;
        }

        return null;
    }

    /** 
    * @returns a string representation of the primary key values in the format "FieldName=Value"
    * @example "ID=1 AND Name=John"
    * @param useIsNull if true, will return "FieldName IS NULL" for any key value pair that has a null or undefined value
    */
    ToString(useIsNull?: boolean): string {
        return this.KeyValuePairs.map((keyValue: KeyValuePair) => {
            if(useIsNull && (keyValue.Value === null || keyValue.Value === undefined)){
                return `${keyValue.FieldName} IS NULL`;
            }

            return `${keyValue.FieldName}=${keyValue.Value}`;
        }).join(" AND ");
    }

    /**
    * @returns a copy of the KeyValuePairs array but with the Value properties as type string
    */
    ValuesAsString(): KeyValuePair[] {
        return this.KeyValuePairs.map((keyValue: KeyValuePair) => {
            return {
                FieldName: keyValue.FieldName,
                Value: keyValue.Value? keyValue.Value.toString() : ""
            }
        });
    }

    /**
     * Utility function to return a copy of the CompositeKey with the Value properties as string
     * @returns a copy of the KeyValuePairs array but with the Value properties as string
     */
    Copy(): CompositeKey {
        let copy = new CompositeKey();
        copy.KeyValuePairs = this.ValuesAsString();
        return copy;
    }

    /**
    * @returns the KeyValuePairs as a list of strings in the format "FieldName=Value"
    * @param delimiter the delimiter to use between the field name and value. Defaults to '='
    * @example ["ID=1", "Name=John"]
    */
    ToList(delimiter?: string): string[] {
        return this.KeyValuePairs.map((pk) => {
            return delimiter ? `${pk.FieldName}${delimiter}${pk.Value}` : `${pk.FieldName}=${pk.Value}`;
        });
    }

    /**
     * Utility function to return a string representation of the composite key in the format "FieldName=Value AND FieldName=Value"
     * @param useIsNull if true, will return "FieldName IS NULL" for any key value pair that has a null or undefined value, if false, will return "FieldName=Value"
     * @param quoteString is either 'single' or 'double' and will determine if the string values are quoted with single or double quotes. Quotes are only applied to values that are of type string or Date.
     * @returns a string representation of the composite key in the format "FieldName=Value AND FieldName=Value"
     * @example "ID=1 AND Name='John'"
     */
    ToWhereClause(useIsNull: boolean = true, quoteStyle: 'single' | 'double' = 'single'): string {
        return this.KeyValuePairs.map((keyValue: KeyValuePair) => {
            let value = keyValue.Value;
            if (useIsNull && (value === null || value === undefined)) {
                return `${keyValue.FieldName} IS NULL`;
            }
            else {
                if (typeof value === 'string' || value instanceof Date) {
                    // Double any embedded quote of the chosen style so a value like O'Brien — or a
                    // record id lifted from an external index — cannot break out of the literal.
                    const quote = quoteStyle === 'single' ? "'" : '"';
                    const text = typeof value === 'string' ? value.split(quote).join(quote + quote) : `${value}`;
                    value = `${quote}${text}${quote}`;
                }
                return `${keyValue.FieldName}=${value}`;
            }
        }).join(" AND ");
    }

    /**
     * @returns the value of each key value pair in the format "Value1, Value2, Value3"
     * @param delimiter - the delimiter to use between the values. Defaults to ', '
     * @example "1, John"
     */
    Values(delimiter?: string): string {
        return this.KeyValuePairs.map((keyValue: KeyValuePair) => {
            return keyValue.Value;
        }).join(delimiter || ", ");
    }

    /**
     * Utility function to check if the composite key has any values set
     */
    get HasValue(): boolean {
        return this.KeyValuePairs.some((keyValue: KeyValuePair) => {
            return keyValue.Value !== null && keyValue.Value !== undefined && keyValue.Value !== "";
        });
    }

    LoadFromEntityFields(fields: EntityField[]): void {
        this.KeyValuePairs = fields.map((field) => {
            return {
                FieldName: field.Name,
                Value: field.Value
            }
        });
    }

    LoadFromEntityInfoAndRecord(entity: EntityInfo, entityRecord: any): void {
        this.KeyValuePairs = entity.PrimaryKeys.map((pk) => {
            return {
                FieldName: pk.Name,
                Value: entityRecord[pk.Name]
            }
        });
    }

    /**
     * Loads the KeyValuePairs from a list of strings in the format "FieldName=Value"
     * @param list - the list of strings to load from
     * @param delimiter - the delimiter to use between the field name and value. Defaults to '='
     * @example ["ID=1", "Name=John"]
     */
    LoadFromList(list: string[], delimiter?: string): void {
        this.KeyValuePairs = list.map((pk: string) => {
            let keyValue = delimiter ? pk.split(delimiter) : pk.split("=");
            if(keyValue.length === 2){
                let keyValuePair: KeyValuePair = new KeyValuePair();
                keyValuePair.FieldName = keyValue[0];
                keyValuePair.Value = keyValue[1];
                return keyValuePair;
            }
            return;
        });
    }

    /**
     * Utility to generate a string representation of the key value pairs in the format "Field1|Value1||Field2|Value2" etc.
     * The field delimiter defaults to '||' and the value delimiter defaults to '|'
     * @param fieldDelimiter 
     * @param valueDelimiter 
     * @returns 
     */
    ToConcatenatedString(fieldDelimiter: string = '||', valueDelimiter: string = '|'): string {
        return this.KeyValuePairs.map((pk) => {
            return `${pk.FieldName}${valueDelimiter}${pk.Value}`;
        }).join(fieldDelimiter);
    }

    /**
     * Utility to load the object from a string representation of the key value pairs in the format "Field1|Value1||Field2|Value2" etc.
     * The delimiters between the fields default to '||' and the values default to '|', but can be anything desired.
     * @param concatenatedString 
     * @param fieldDelimiter 
     * @param valueDelimiter 
     */
    LoadFromConcatenatedString(concatenatedString: string, fieldDelimiter: string = '||', valueDelimiter: string = '|'): void {
        if (concatenatedString.includes(valueDelimiter)) {
            const parts = concatenatedString.split(fieldDelimiter);
            const pkVals: KeyValuePair[] = [];
            for (let p of parts) {
              // Everything after the first delimiter is the value, so a value that itself contains the
              // delimiter ("Code|a|b") round-trips instead of being silently truncated to "a".
              const kv = p.split(valueDelimiter);
              pkVals.push({ FieldName: kv[0], Value: kv.slice(1).join(valueDelimiter) });
            }
  
            this.KeyValuePairs = pkVals;  
        }
        else {
            // do nothing
        }        
    }

    /**
     * For URL segments, we use | and || as the standard delimiters for field and value respectively in order to avoid
     * conflicts with the standard URL delimiters like = and &. This method converts the key value pairs to a URL segment
     * @param segment 
     * @returns 
     */
    ToURLSegment(segment?: string): string {
        return this.ToConcatenatedString(segment || CompositeKey.DefaultFieldDelimiter, CompositeKey.DefaultValueDelimiter);
    }

    /**
     * The exact inverse of {@link CompositeKey.LoadFromURLSegment}. A single-field key serializes to
     * just its value — the shorthand `LoadFromURLSegment` maps back onto the entity's first primary
     * key — while a multi-field key serializes to the full `Field1|Value1||Field2|Value2` segment.
     * A single value that itself contains the value delimiter also gets the full segment; the parsers
     * (`SimpleLoadFromURLSegment`, `LoadFromConcatenatedString`) treat everything after the first
     * delimiter as the value, so it round-trips rather than being truncated. A value containing the
     * field delimiter (`||`) remains unrepresentable — a pre-existing limit of the format.
     *
     * This is the "compact" record-id form carried by search results, `MJ: List Details`,
     * `MJ: User Record Logs` and Explorer record URLs: for the overwhelmingly common single-column
     * primary key it is indistinguishable from the raw value, so `IN (...)` filters, dedup keys and
     * persisted data all keep working, while composite keys still round-trip losslessly.
     * @example "11055"                       // single-column key, any column name
     * @example "OrderID|11055||LineNo|3"     // composite key
     */
    ToCompactURLSegment(): string {
        if (this.KeyValuePairs.length === 1) {
            const value = this.KeyValuePairs[0].Value;
            const text = value === null || value === undefined ? '' : String(value);
            if (!text.includes(CompositeKey.DefaultValueDelimiter)) {
                return text;
            }
        }
        return this.ToURLSegment();
    }

    private static readonly _field_delimiter = '||'
    private static readonly _value_delimiter = '|';
    /**
     * Default delimiter for separating fields in a string that represents a key value pair within the composite key
     */
    public static get DefaultFieldDelimiter(): string {
        return this._field_delimiter;
    }
    /**
     * Default delimiter for separating values from field names in a string that represents a key value pair within the composite key
     */
    public static get DefaultValueDelimiter(): string {
        return this._value_delimiter;
    }

    /**
     * Parses a provided url segment using the provided delimiter and loads the key value pairs from it. If the segment just contains a single
     * value and no delimiter, it will assume the field name is the primary key field name of the entity and load that way.
     */
    LoadFromURLSegment(entity: EntityInfo, urlSegment: string): void {
        if (!urlSegment.includes('|')) {
          // If not, return a single element array with a default field name
          this.KeyValuePairs = [{ FieldName: entity.FirstPrimaryKey.Name, Value: urlSegment }]; // first-pk-ok: the bare-value URL shorthand means "the single key column, whatever its name"
        }
        else {
            this.SimpleLoadFromURLSegment(urlSegment);
        }
    }

    /**
     * Parses the provided routeSegment and assumes the field names are included in the segment
     * @param urlSegment 
     * @param delimiter 
     */
    SimpleLoadFromURLSegment(urlSegment: string): void {
        if (urlSegment.includes(CompositeKey.DefaultValueDelimiter)) {
            const parts = urlSegment.split(CompositeKey.DefaultFieldDelimiter);
            const pkVals: KeyValuePair[] = [];
            for (let p of parts) {
              // Everything after the first '|' is the value, so a value that itself contains '|'
              // ("Code|a|b") round-trips instead of being silently truncated to "a".
              const kv = p.split('|');
              pkVals.push({ FieldName: kv[0], Value: kv.slice(1).join('|') });
            }
  
            this.KeyValuePairs = pkVals;  
        }
        else {
            // do nothing
        }            
    }
    /**
     * Loads the key from a single key value pair
     * @param fieldName 
     * @param value 
     */
    LoadFromSingleKeyValuePair(fieldName: string, value: any): void {
        this.KeyValuePairs = [{ FieldName: fieldName, Value: value }];
    }

    /**
     * Loads from a simple object by extracting the key value pairs from the object
     * @param obj 
     */
    LoadFromSimpleObject(obj: any): void {
        this.KeyValuePairs = Object.keys(obj).map((key) => {
            return { FieldName: key, Value: obj[key] };
        });
    }

    /**
     * Static helper method to instantiate a FieldValueCollection from a simple object
     * @param obj 
     * @returns 
     */
    public static FromObject(obj: any): FieldValueCollection {
        let fvc = new FieldValueCollection();
        fvc.LoadFromSimpleObject(obj);
        return fvc;
    }
}

/**
 * Path segment used for an unsaved entity record so the URL can be deeplinked
 * (`/app/:app/record/:entity/new?NewRecordValues=...`).
 */
export const NEW_ENTITY_RECORD_URL_ID = 'new';

/** Query-string key that carries FieldValueCollection.ToURLSegment() defaults. */
export const NEW_RECORD_VALUES_QUERY_PARAM = 'NewRecordValues';

/** True when the record-id path segment means "create", not a stored key. */
export function IsNewEntityRecordUrlId(recordId: string | null | undefined): boolean {
    if (recordId == null) return true;
    const trimmed = recordId.trim();
    return trimmed.length === 0 || trimmed.toLowerCase() === NEW_ENTITY_RECORD_URL_ID;
}

/**
 * True when a workspace tab is the record named by a `/record/:entity/:id` URL.
 *
 * New-record tabs store `recordId: ''` while the URL uses the `new` sentinel.
 * Those must match. Comparing the raw strings (`'' === 'new'`) is false, so
 * URL sync thinks the tab is missing and opens another one — an infinite
 * tab storm that kills the browser tab.
 */
export function RecordUrlMatchesTab(
    urlEntityName: string,
    urlRecordId: string,
    tabEntityName: string | null | undefined,
    tabRecordId: string | null | undefined,
): boolean {
    if ((tabEntityName ?? '').trim().toLowerCase() !== urlEntityName.trim().toLowerCase()) {
        return false;
    }
    if (IsNewEntityRecordUrlId(urlRecordId) && IsNewEntityRecordUrlId(tabRecordId)) {
        return true;
    }
    return (tabRecordId ?? '') === urlRecordId;
}

/**
 * Encode new-record defaults for a deeplink. Objects become
 * `Field|value||Field2|value2`. Empty / null returns undefined.
 */
export function EncodeNewRecordValuesForURL(values: unknown): string | undefined {
    if (values == null) return undefined;
    if (typeof values === 'string') {
        const trimmed = values.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof values !== 'object' || Array.isArray(values)) return undefined;
    const record = values as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] != null);
    if (keys.length === 0) return undefined;
    const obj: Record<string, unknown> = {};
    for (const key of keys) {
        obj[key] = record[key];
    }
    return FieldValueCollection.FromObject(obj).ToURLSegment();
}

/**
 * Compare two Explorer resource URLs after decoding. Angular's serializer
 * leaves `:` in `MJ_BizApps_Orders: Order Headers` while `encodeURIComponent`
 * writes `%3A`. A raw `!==` on those strings is permanently true and, with
 * `onSameUrlNavigation: 'reload'`, navigates until Chrome dies.
 */
export function ResourceUrlsEquivalent(left: string, right: string): boolean {
    const a = splitResourceUrl(left);
    const b = splitResourceUrl(right);
    if (safeDecodePath(a.path) !== safeDecodePath(b.path)) {
        return false;
    }
    return resourceQueryEqual(a.query, b.query);
}

function splitResourceUrl(raw: string): { path: string; query: Record<string, string> } {
    const trimmed = (raw ?? '').trim();
    const q = trimmed.indexOf('?');
    const path = q === -1 ? trimmed : trimmed.slice(0, q);
    const search = q === -1 ? '' : trimmed.slice(q + 1);
    const query: Record<string, string> = {};
    if (search.length > 0) {
        new URLSearchParams(search).forEach((value, key) => {
            query[key] = value;
        });
    }
    return { path, query };
}

function safeDecodePath(path: string): string {
    try {
        return decodeURIComponent(path);
    } catch {
        return path;
    }
}

function resourceQueryEqual(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
        decodeURIComponent((a[key] ?? '').replace(/\+/g, ' ')) ===
        decodeURIComponent((b[key] ?? '').replace(/\+/g, ' ')),
    );
}


/**
 * Composite keys are used to represent database keys and can include one or more key value pairs.
 */
export class CompositeKey extends FieldValueCollection {
    constructor(keyValuePairs?: KeyValuePair[]) {
        super(keyValuePairs);
    }

    /**
     * Static factory method to create a CompositeKey from a single key value pair.
     * @param key 
     * @param value 
     * @returns 
     */
    public static FromKeyValuePair(key: string, value: any): CompositeKey {
        let compositeKey = new CompositeKey();
        compositeKey.LoadFromSingleKeyValuePair(key, value);
        return compositeKey;
    }

    /**
     * Static factory method to create a CompositeKey from an array of key value pairs. Mirrors the 
     * constructor but allows for a more explicit creation of a CompositeKey from an array of KeyValuePair objects.
     * @param keyValuePairs 
     * @returns 
     */
    public static FromKeyValuePairs(keyValuePairs: KeyValuePair[]): CompositeKey {
        return new CompositeKey(keyValuePairs);
    }

    /**
     * Many entities have a single primary key field called ID, this utility method allows you to create a CompositeKey from just that ID value.
     * @param id 
     * @returns 
     */
    public static FromID(id: any): CompositeKey {
        let compositeKey = new CompositeKey();
        compositeKey.LoadFromSingleKeyValuePair('ID', id); // pk-literal-ok: this IS the sanctioned "the key is ID" constructor
        return compositeKey;
    }

    /**
     * Static form of {@link LoadFromURLSegment}: builds a key from a record-id string that is either a
     * bare value (a single-column primary key, mapped onto `entity.FirstPrimaryKey` whatever that
     * column is called) or a full `Field1|Value1||Field2|Value2` segment (a composite primary key).
     * It reads both the compact form produced by {@link ToCompactURLSegment} and the always-prefixed
     * form produced by {@link ToURLSegment}.
     *
     * Use this — not {@link FromID} — whenever the entity is a *variable* rather than a literal MJ
     * core entity name. MJ supports primary keys with any column name(s) and type(s); hardcoding
     * `ID` fails `Load()` with "Primary key ID not found in entity ..." for every entity whose key
     * is called something else, and can never represent a multi-column key at all.
     *
     * When `entity` is null/undefined (metadata not resolvable) a delimited segment is parsed as-is
     * since it already carries its field names, and a bare value falls back to an `ID` key so callers
     * on an unknown entity keep the pre-existing behavior instead of throwing.
     */
    public static FromURLSegment(entity: EntityInfo | null | undefined, segment: string): CompositeKey {
        const compositeKey = new CompositeKey();
        if (entity?.FirstPrimaryKey) { // first-pk-ok: presence check only; LoadFromURLSegment reads bare and delimited segments
            compositeKey.LoadFromURLSegment(entity, segment);
        } else if (segment.includes(CompositeKey.DefaultValueDelimiter)) {
            compositeKey.SimpleLoadFromURLSegment(segment);
        } else {
            compositeKey.LoadFromSingleKeyValuePair('ID', segment); // pk-literal-ok: documented fallback when entity metadata is unresolvable
        }
        return compositeKey;
    }

    /**
     * Static form of {@link LoadFromEntityInfoAndRecord}: builds the key from a data row (a
     * `ResultType: 'simple'` RunView row, or any object keyed by field name) using the entity's
     * actual primary key column(s). Pair with {@link ToCompactURLSegment} to produce a record-id
     * string that {@link FromURLSegment} reads back for any entity, single- or multi-column key.
     */
    public static FromEntityRecord(entity: EntityInfo, record: Record<string, unknown>): CompositeKey {
        const compositeKey = new CompositeKey();
        compositeKey.LoadFromEntityInfoAndRecord(entity, record);
        return compositeKey;
    }

    /**
     * The canonical serialization of this key for storage in a polymorphic `RecordID` column — the
     * payload half of an `EntityID`/`RecordID` pair. Always the fully-prefixed
     * `Field1|Value1||Field2|Value2` form, so the string carries its own field names and round-trips
     * without the reader needing to know the entity.
     *
     * This is the one encoding MJ writes going forward. It matches what
     * `SQLServerDataProvider` already writes to `RecordChange.RecordID` and what
     * `Metadata.GetRecordChanges` reads back; the bare `RecordGeoCode` form is the outlier and is
     * read through {@link FromLegacyRecordID} until it migrates.
     *
     * Unlike {@link ToConcatenatedString}, this **throws** rather than emitting a string that cannot
     * be parsed back: a value containing the value delimiter (`|`) would re-split into the wrong
     * field/value boundary on the way in. Silently writing such a value is how a `RecordID` column
     * ends up holding a key nothing can resolve.
     *
     * @example "ID|38CB433E-F36B-1410-8DA0-00021F8B792E"   // single-column key
     * @example "OrderID|11055||LineNo|3"                    // composite key
     * @throws if the key holds no pairs, or any value contains the value delimiter
     */
    public ToRecordID(): string {
        if (this.KeyValuePairs.length === 0) {
            throw new Error('Cannot build a RecordID from an empty CompositeKey - no key value pairs are set.');
        }
        const valueDelimiter = CompositeKey.DefaultValueDelimiter;
        for (const kvPair of this.KeyValuePairs) {
            if (kvPair.Value === null || kvPair.Value === undefined) {
                // ToConcatenatedString would render this as the literal text "null"/"undefined",
                // producing a pointer that resolves to nothing. A key component of a real record is
                // never null, so this is a caller bug worth surfacing.
                throw new Error(
                    `Cannot build a RecordID: primary key field '${kvPair.FieldName}' has no value. ` +
                    `A polymorphic RecordID must identify an existing record.`,
                );
            }
            const text = String(kvPair.Value);
            if (text.includes(valueDelimiter)) {
                throw new Error(
                    `Cannot build a RecordID for ${kvPair.FieldName}: the value contains the '${valueDelimiter}' delimiter ` +
                    `and would not round-trip. Values stored in a polymorphic RecordID column cannot contain '${valueDelimiter}'.`,
                );
            }
        }
        return this.ToConcatenatedString();
    }

    /**
     * Reads a canonical `RecordID` string (see {@link ToRecordID}) back into a key, **validated
     * against the entity it is supposed to belong to**.
     *
     * This is deliberately not a rename of {@link LoadFromConcatenatedString}, which cannot signal
     * failure: given a string with no delimiter it leaves `KeyValuePairs` empty and returns
     * normally, so every caller has to sniff the string itself to find out whether the parse
     * happened. That is the defect behind the two hand-rolled sniffers in shared Angular code, and
     * it is why a legacy bare composite (`val1||val2`) silently parses into phantom pairs with
     * garbage field names instead of being rejected.
     *
     * The field-name check is what makes that safe: `val1||val2` parses cleanly as a shape, but
     * produces field names the entity does not have, so it is caught here rather than reaching the
     * database as a key that matches nothing. A string with no delimiter at all is accepted only for
     * a single-column primary key, where it is unambiguous, and takes its field name from
     * `FirstPrimaryKey` — the same fallback {@link LoadFromURLSegment} already uses.
     *
     * @param entity the entity the record id belongs to; its `PrimaryKeys` define the expected shape
     * @param recordID the stored `RecordID` value
     * @throws if `recordID` is empty, or its field names/arity do not match `entity.PrimaryKeys`
     */
    public static FromRecordID(entity: EntityInfo, recordID: string): CompositeKey {
        if (!entity) {
            throw new Error('FromRecordID requires an EntityInfo - the parsed field names are validated against its primary keys.');
        }
        if (recordID === null || recordID === undefined || recordID.length === 0) {
            throw new Error(`Cannot parse an empty RecordID for entity ${entity.Name}.`);
        }

        const fieldDelimiter = CompositeKey.DefaultFieldDelimiter;
        const valueDelimiter = CompositeKey.DefaultValueDelimiter;
        const primaryKeys = entity.PrimaryKeys;

        if (!recordID.includes(valueDelimiter)) {
            // No delimiter at all. Unambiguous only for a single-column key, where the field name is
            // implied by the entity rather than carried in the string.
            if (primaryKeys.length !== 1) {
                throw new Error(
                    `RecordID '${recordID}' for entity ${entity.Name} carries no field names, but that entity has a ` +
                    `${primaryKeys.length}-column primary key (${primaryKeys.map((pk) => pk.Name).join(', ')}). ` +
                    `A composite key must be stored in the '${fieldDelimiter}'-delimited form produced by ToRecordID().`,
                );
            }
            return CompositeKey.FromKeyValuePair(primaryKeys[0].Name, recordID);
        }

        const parsed = new CompositeKey();
        parsed.LoadFromConcatenatedString(recordID, fieldDelimiter, valueDelimiter);
        CompositeKey.ValidateAgainstPrimaryKeys(entity, parsed, recordID);
        return parsed;
    }

    /**
     * Reads the **transitional** bare-value `RecordID` form: a single primary key value with no field
     * name (`38CB433E-…`), or a composite written as values only (`val1||val2`).
     *
     * Only `RecordGeoCode` writes this, via `GeoCodeSyncService` and the matching T-SQL in the
     * base-view generator. It exists so the two hand-rolled sniffers (`recent-access.service.ts`,
     * `record-tags.component.ts`) can be replaced by one named function whose name says it is
     * temporary — and it is deliberately separate from {@link FromRecordID} so that "I am reading a
     * legacy encoding" is a decision at the call site rather than a guess inside the parser. Delete
     * it once `RecordGeoCode` is re-encoded.
     *
     * Field names come from `entity.PrimaryKeys` **positionally**, because the stored string does not
     * carry them. That is exactly why the format is being retired: position is not a contract, so a
     * primary key column reorder silently remaps the key.
     *
     * @throws if the number of values does not match `entity.PrimaryKeys`
     */
    public static FromLegacyRecordID(entity: EntityInfo, recordID: string): CompositeKey {
        if (!entity) {
            throw new Error('FromLegacyRecordID requires an EntityInfo - field names are taken positionally from its primary keys.');
        }
        if (recordID === null || recordID === undefined || recordID.length === 0) {
            throw new Error(`Cannot parse an empty legacy RecordID for entity ${entity.Name}.`);
        }

        const values = recordID.split(CompositeKey.DefaultFieldDelimiter);
        const primaryKeys = entity.PrimaryKeys;
        if (values.length !== primaryKeys.length) {
            throw new Error(
                `Legacy RecordID '${recordID}' for entity ${entity.Name} has ${values.length} value(s) but that entity has a ` +
                `${primaryKeys.length}-column primary key (${primaryKeys.map((pk) => pk.Name).join(', ')}).`,
            );
        }

        return CompositeKey.FromKeyValuePairs(values.map((value, i) => new KeyValuePair(primaryKeys[i].Name, value)));
    }

    /**
     * Shared check behind {@link FromRecordID}: the parsed pairs must name exactly the entity's
     * primary key columns, once each. Order is not required - a stored key written before a column
     * reorder is still valid, since the field names travel with the value.
     */
    private static ValidateAgainstPrimaryKeys(entity: EntityInfo, parsed: CompositeKey, recordID: string): void {
        const primaryKeys = entity.PrimaryKeys;
        const expected = primaryKeys.map((pk) => pk.Name);

        if (parsed.KeyValuePairs.length !== primaryKeys.length) {
            throw new Error(
                `RecordID '${recordID}' parsed to ${parsed.KeyValuePairs.length} field(s) but entity ${entity.Name} has a ` +
                `${primaryKeys.length}-column primary key (${expected.join(', ')}). ` +
                `A bare composite value list (the legacy RecordGeoCode encoding) must be read with FromLegacyRecordID().`,
            );
        }

        const seen = new Set<string>();
        for (const kvPair of parsed.KeyValuePairs) {
            const match = expected.find((name) => name.trim().toLowerCase() === (kvPair.FieldName ?? '').trim().toLowerCase());
            if (!match) {
                throw new Error(
                    `RecordID '${recordID}' names field '${kvPair.FieldName}', which is not a primary key of entity ` +
                    `${entity.Name} (expected one of: ${expected.join(', ')}). ` +
                    `A bare composite value list (the legacy RecordGeoCode encoding) must be read with FromLegacyRecordID().`,
                );
            }
            if (seen.has(match)) {
                throw new Error(`RecordID '${recordID}' names primary key field '${match}' more than once for entity ${entity.Name}.`);
            }
            seen.add(match);
        }
    }

    /**
     * Creates a CompositeKey from a simple object where the keys are the field names and the values are the values.
     * @param obj 
     * @returns 
     */
    public static FromObject(obj: any): CompositeKey {
        let compositeKey = new CompositeKey();
        compositeKey.LoadFromSimpleObject(obj);
        return compositeKey;
    }

    /**
    * Utility function to compare this composite key to another
    * @param compositeKey the composite key to compare against
    * @returns true if the primary key values are the same, false if they are different
    */
    public Equals(compositeKey: CompositeKey): boolean {
        if(!compositeKey){
            return false;
        }

        return this.EqualsKey(compositeKey.KeyValuePairs);
    }

    /**
     * Utility function to compare either single composite keys or arrays of composite keys.
     * When comparing arrays, both order and content must match.
     * @param key1 First key or array of keys to compare
     * @param key2 Second key or array of keys to compare
     * @returns true if the keys are equal, false otherwise. Returns false if types don't match (single vs array).
     */
    public static EqualsEx(key1: CompositeKey | Array<CompositeKey> | null | undefined, key2: CompositeKey | Array<CompositeKey> | null | undefined): boolean {
        // Handle null/undefined cases
        if (key1 == null && key2 == null) {
            return true;
        }
        if (key1 == null || key2 == null) {
            return false;
        }

        const isArray1 = Array.isArray(key1);
        const isArray2 = Array.isArray(key2);

        // Type mismatch - single vs array
        if (isArray1 !== isArray2) {
            return false;
        }

        // Both are single CompositeKeys
        if (!isArray1) {
            return (key1 as CompositeKey).Equals(key2 as CompositeKey);
        }

        // Both are arrays
        const arr1 = key1 as Array<CompositeKey>;
        const arr2 = key2 as Array<CompositeKey>;

        if (arr1.length !== arr2.length) {
            return false;
        }

        // Compare each element in order
        for (let i = 0; i < arr1.length; i++) {
            if (!arr1[i].Equals(arr2[i])) {
                return false;
            }
        }

        return true;
    }


    /**
     * Helper method to check if the underlying key value pairs are valid or not
     * i.e. if any of the key value pairs are null or undefined
     * @param entity If provided, this method will validate that the composite key is valid for the given entity as a primary key or alternate key. 
     * @param primaryKey If set to true, and entity is provided, this method will validate that the composite key is valid as the primary key for the given entity.
     * @returns true if all key value pairs are valid, false if any are null or undefined
     */
    public Validate(entity?: EntityInfo, primaryKey: boolean = true): {IsValid: boolean, ErrorMessage: string} {
        try {
            // make sure that KeyValuePairs is an array of 1+ objects, and that each object has a FieldName and Value property and that the FieldName is a valid field on the entity that has IsPrimaryKey set to true
            if (!this.KeyValuePairs || this.KeyValuePairs.length === 0)
                throw new Error('KeyValuePairs cannot be null or empty');
            else {
                // now loop through the array and make sure each object has a FieldName and Value property
                // and that the field name is a valid field on the entity that has IsPrimaryKey set to true
                for (let i = 0; i < this.KeyValuePairs.length; i++) {
                    const pk = this.KeyValuePairs[i];
                    if (!pk.FieldName || pk.FieldName.trim().length === 0)
                        throw new Error(`KeyValuePairs[${i}].FieldName cannot be null, empty, or whitespace`);
                    if (pk.Value === null || pk.Value === undefined)
                        throw new Error(`KeyValuePairs[${i}].Value cannot be null or undefined`);

                    if (entity) {
                        const field = entity.FieldByName(pk.FieldName);
                        if (!field)
                            throw new Error(`KeyValuePairs[${i}].FieldName of ${pk.FieldName} does not exist on ${entity.Name}`);
                        if (primaryKey && !field.IsPrimaryKey)
                            throw new Error(`KeyValuePairs[${i}].FieldName of ${pk.FieldName} is not a primary key field on ${entity.Name}`);    
                    }
                }
            }
            return {IsValid: true, ErrorMessage: null};
        }
        catch (e) {
            return {IsValid: false, ErrorMessage: e.message};
        }
    }


    /**
    * Utility function to compare the key primary key of this object to another sets to see if they are the same or not
    * @param kvPairs the primary key values to compare against
    * @returns true if the primary key values are the same, false if they are different
    */
    EqualsKey(kvPairs: KeyValuePair[]): boolean {
        if(!kvPairs || kvPairs.length === 0){
            return false;
        }

        if (kvPairs.length !== this.KeyValuePairs.length){
            return false;
        }

        for( const [index, kvPair] of kvPairs.entries()){
            const sourcekvPair = this.KeyValuePairs[index];
            if(kvPair.FieldName !== sourcekvPair.FieldName){
                return false;
            }
            // Use case-insensitive comparison for string values (handles UUID case differences
            // between SQL Server uppercase and PostgreSQL lowercase)
            if (typeof kvPair.Value === 'string' && typeof sourcekvPair.Value === 'string') {
                if (!UUIDsEqual(kvPair.Value, sourcekvPair.Value)) {
                    return false;
                }
            } else if (String(kvPair.Value ?? '') !== String(sourcekvPair.Value ?? '')) {
                // Scalar (e.g. integer) primary keys can arrive typed differently on each side: a
                // loaded entity holds the raw column value (number 5), while a URL/tab-derived key is
                // always a string ("5" from split()). A strict !== between a number and a string is
                // always true, so record-identity checks would never converge for integer PKs —
                // causing an infinite re-render/re-navigate loop (browser freeze) when navigating a
                // record view (e.g. the back button). Coerce both to string before comparing, matching
                // MjEntityFormHostComponent.compositeKeysEqual.
                return false;
            }
        }

        return true;
    }
}

