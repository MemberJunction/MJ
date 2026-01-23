import { EntityField } from "./baseEntity";
import { EntityInfo } from "./entityInfo";


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
                    if (quoteStyle === 'single') {
                        value = `'${value}'`;
                    }
                    else {
                        value = `"${value}"`;
                    }
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
              const kv = p.split(valueDelimiter);
              pkVals.push({ FieldName: kv[0], Value: kv[1] });
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
          this.KeyValuePairs = [{ FieldName: entity.FirstPrimaryKey.Name, Value: urlSegment }];
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
              const kv = p.split('|');
              pkVals.push({ FieldName: kv[0], Value: kv[1] });
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
        compositeKey.LoadFromSingleKeyValuePair('ID', id);
        return compositeKey;
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
                        const field = entity.Fields.find(f => f.Name.trim().toLowerCase() === pk.FieldName.trim().toLowerCase());
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
            if(kvPair.FieldName !== sourcekvPair.FieldName || kvPair.Value !== sourcekvPair.Value){
                return false;
            }
        }

        return true;
    }
}

