import { BaseEntity, BaseEntityResult, CompositeKey, EntityInfo, Metadata } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { MJListDetailEntity } from "../generated/entity_subclasses";

@RegisterClass(BaseEntity, 'MJ: List Details')
export class MJListDetailEntityExtended extends MJListDetailEntity  {
    private _recordCompositeKey: CompositeKey | null = null;
    private _sourceEntityInfo: EntityInfo | null = null;

    /**
     * Sets the RecordID from a source entity record.
     * For single PK entities, stores just the raw PK value.
     * For composite PK entities, stores the concatenated key format (Field1|Value1||Field2|Value2).
     * @param entityInfo The EntityInfo for the source entity
     * @param record The source record (can be a BaseEntity or plain object with PK values)
     */
    public SetRecordIDFromEntity(entityInfo: EntityInfo, record: BaseEntity | Record<string, unknown>): void {
        this._sourceEntityInfo = entityInfo;
        const primaryKeys = entityInfo.PrimaryKeys;

        if (primaryKeys.length === 1) {
            // Single PK: store just the raw value
            const pkField = primaryKeys[0].Name;
            const value = record instanceof BaseEntity ? record.Get(pkField) : record[pkField];
            this.RecordID = String(value);
        } else {
            // Composite PK: store concatenated format
            const compositeKey = new CompositeKey();
            compositeKey.LoadFromEntityInfoAndRecord(entityInfo, record);
            this.RecordID = compositeKey.ToConcatenatedString();
        }

        // Clear cached composite key since RecordID changed
        this._recordCompositeKey = null;
    }

    /**
     * Gets a CompositeKey from the stored RecordID.
     * Lazily builds and caches the CompositeKey.
     * @param entityInfo Optional EntityInfo - required if not previously set via SetRecordIDFromEntity
     * @returns CompositeKey representing the stored RecordID
     */
    public GetCompositeKey(entityInfo?: EntityInfo): CompositeKey {
        if (this._recordCompositeKey) {
            return this._recordCompositeKey;
        }

        const effectiveEntityInfo = entityInfo || this._sourceEntityInfo;
        if (!effectiveEntityInfo) {
            // Try to get entity info from the List's EntityID
            const md = new Metadata();
            const list = md.Entities.find(e => e.Name === 'MJ: Lists');
            if (!list) {
                throw new Error('Cannot determine entity info. Provide entityInfo parameter or call SetRecordIDFromEntity first.');
            }
        }

        this._recordCompositeKey = new CompositeKey();

        if (effectiveEntityInfo && effectiveEntityInfo.PrimaryKeys.length === 1) {
            // Single PK: RecordID is just the raw value
            const pkField = effectiveEntityInfo.PrimaryKeys[0].Name;
            this._recordCompositeKey.KeyValuePairs = [{ FieldName: pkField, Value: this.RecordID }];
        } else {
            // Composite PK or unknown: try to parse as concatenated string
            this._recordCompositeKey.LoadFromConcatenatedString(this.RecordID);

            // If parsing failed (no delimiters found), treat as single value
            if (this._recordCompositeKey.KeyValuePairs.length === 0) {
                const pkField = effectiveEntityInfo?.PrimaryKeys[0]?.Name || 'ID';
                this._recordCompositeKey.KeyValuePairs = [{ FieldName: pkField, Value: this.RecordID }];
            }
        }

        return this._recordCompositeKey;
    }

    /**
     * Extracts the raw primary key value(s) from the RecordID.
     * For single PK, returns the raw value directly.
     * For composite PK, returns an object with field names and values.
     * @param entityInfo The EntityInfo for the source entity
     * @returns The raw PK value (string) for single PK, or Record<string, unknown> for composite
     */
    public GetRawPrimaryKeyValue(entityInfo: EntityInfo): string | Record<string, unknown> {
        const primaryKeys = entityInfo.PrimaryKeys;

        if (primaryKeys.length === 1) {
            // Single PK: RecordID is the raw value
            return this.RecordID;
        } else {
            // Composite PK: parse and return as object
            const compositeKey = this.GetCompositeKey(entityInfo);
            const result: Record<string, unknown> = {};
            for (const kvp of compositeKey.KeyValuePairs) {
                result[kvp.FieldName] = kvp.Value;
            }
            return result;
        }
    }

    /**
     * Static utility to build the appropriate RecordID value from a source record.
     * Use this when you need to build a RecordID without creating a MJListDetailEntity.
     * @param entityInfo The EntityInfo for the source entity
     * @param record The source record
     * @returns The properly formatted RecordID string
     */
    public static BuildRecordID(entityInfo: EntityInfo, record: BaseEntity | Record<string, unknown>): string {
        const primaryKeys = entityInfo.PrimaryKeys;

        if (primaryKeys.length === 1) {
            // Single PK: return just the raw value
            const pkField = primaryKeys[0].Name;
            const value = record instanceof BaseEntity ? record.Get(pkField) : record[pkField];
            return String(value);
        } else {
            // Composite PK: return concatenated format
            const compositeKey = new CompositeKey();
            compositeKey.LoadFromEntityInfoAndRecord(entityInfo, record);
            return compositeKey.ToConcatenatedString();
        }
    }

    /**
     * Static utility to extract raw PK value from a RecordID string.
     * Handles both single PK (raw value) and composite PK (concatenated) formats.
     * @param recordId The RecordID value from a ListDetail record
     * @param entityInfo The EntityInfo for the source entity
     * @returns For single PK: the raw value. For composite PK: the full concatenated string.
     */
    public static ExtractPrimaryKeyValue(recordId: string, entityInfo: EntityInfo): string {
        // For single PK entities, RecordID is stored as raw value, so return as-is
        // For composite PK entities, RecordID is stored as concatenated string, return as-is
        // The caller should use this value appropriately based on their context
        return recordId;
    }

    public async Save(): Promise<boolean> {
        const currentResultCount = this.ResultHistory.length;
        const newResult = new BaseEntityResult();
        newResult.StartedAt = new Date();

        try{
            const rv = this.RunViewProviderToUse;

            if(!this.ListID){
                throw new Error('ListID cannot be null');
            }

            if(!this.RecordID){
                throw new Error('RecordID cannot be null');
            }

            if(!this.ContextCurrentUser){
                throw new Error('ContextCurrentUser cannot be null');
            }

            const rvResult = await rv.RunView({
                EntityName: 'MJ: List Details',
                ExtraFilter: `ListID = '${this.ListID}' AND RecordID = '${this.RecordID}'`
            }, this.ContextCurrentUser);

            if(!rvResult.Success){
                throw new Error(rvResult.ErrorMessage);
            }

            if(rvResult.Results.length > 0){
                throw new Error(`Record ${this.RecordID} already exists in List ${this.ListID}`);
            }

            const saveResult = await super.Save();
            return saveResult;
        }
        catch (e) {
            if (currentResultCount === this.ResultHistory.length) {0
                // this means that NO new results were added to the history anywhere 
                // so we need to add a new result to the history here
                newResult.Success = false;
                newResult.Type = this.IsSaved ? 'update' : 'create';
                newResult.Message = e.message;
                newResult.OriginalValues = this.Fields.map(f => { return {FieldName: f.CodeName, Value: f.OldValue} });
                newResult.EndedAt = new Date();               
                this.ResultHistory.push(newResult);
            }
            return false;
        }
    }
}