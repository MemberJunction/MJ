import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, CompositeKey, ConsoleColor, EntityFieldTSType, EntityInfo, IMetadataProvider, KeyValuePair, LogError, LogStatus, Metadata, RunQuery, RunView, UpdateCurrentConsoleLine, UpdateCurrentConsoleProgress, UserInfo } from "@memberjunction/core";
import { MJRecordChangeEntity, MJRecordChangeReplayRunEntity } from "@memberjunction/core-entities";
import { UUIDsEqual } from "@memberjunction/global";
import { SQLServerDataProvider } from "@memberjunction/sqlserver-dataprovider";
import { PostgreSQLDialect, SQLDialect, SQLServerDialect } from "@memberjunction/sql-dialect";


/**
 * Represents a change to a single field in a record
 */
export class FieldChange {
    public FieldName: string;
    public OldValue: any;
    public NewValue: any;
}

/**
 * Represents a change to a single record in an entity
 */
export class ChangeDetectionItem {
    public Entity: EntityInfo;
    public PrimaryKey: CompositeKey;
    public Type: 'Create' | 'Update' | 'Delete';
    public ChangedAt: Date;
    public Changes: FieldChange[];
    /**
     * Populated for Create and Update types only. This is the latest version of the record from the organic database table
     */
    public LatestRecord?: BaseEntity;

    public LegacyKey?: boolean = false; // if true, this means that the key was a single value and not a concatenated key
    public LegacyKeyValue?: string; // if LegacyKey is true, this will be the single value of the key
}

/**
 * Result type for a change detection operation
 */
export class ChangeDetectionResult {
    public Success: boolean;
    public ErrorMessage?: string;
    public Changes: ChangeDetectionItem[];
}

/**
 * Engine to handle detection of external changes and "replay" them in MemberJunction to invoke all standard functionality
 * such as BaseEntity sub-classes as well as any custom logic that are tied to the system via Actions/AI Actions/etc...
 * 
 * This is a server only package
 */
export class ExternalChangeDetectorEngine extends BaseEngine<ExternalChangeDetectorEngine> {
    private _dialect: SQLDialect;

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const p = <SQLServerDataProvider> ( provider || Metadata.Provider );
        
        // Initialize dialect
        const platform = (p as any).DatabasePlatform || 'sqlserver';
        this._dialect = platform === 'postgresql' ? new PostgreSQLDialect() : new SQLServerDialect();

        const c: Array<Partial<BaseEnginePropertyConfig>> = [
            {
                EntityName: "MJ: Entities",
                PropertyName: "_EligibleEntities",
                Filter: `ID IN (SELECT ID FROM ${p.MJCoreSchemaName}.vwEntitiesWithExternalChangeTracking)`, // limit to entities that are in this view. This view has the logic which basically is TrackRecordChanges=1 and also has an UpdatedAt field
                CacheLocal: true
            }
        ];
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    public static get Instance(): ExternalChangeDetectorEngine {
        return super.getInstance<ExternalChangeDetectorEngine>();
    }


    private _IneligibleEntities: string[] = [];// ['Entities', 'MJ: Entity Fields', 'MJ: Entity Field Values', 'MJ: Entity Relationships', 'MJ: Record Changes']; // default ineligible entities --- turned off for now
    /**
     * A list of entities that will automatically be excluded from all calls to this class. This array is used as a "safety"
     * mechanism to prevent the system from trying to replay changes to these entities which wouldn't negatively affect system integrity
     * but could cause performance issues. If you want to add/remove entities to this list, you can do so by manipulating this array.
     * 
     * If you want to run Change Detection and/or replay changes for entities in this array, you will need to remove them
     * in your code before calling the methods in this class. While executing methods on this class with these default 
     * ineligible entities will not cause any issues, they may take a long time to run and utilize a significant amount
     * of resources. 
     */
    public get IneligibleEntities(): string[] {
        return this._IneligibleEntities;
    }


    private _EligibleEntities: EntityInfo[];
    /**
     * A list of the entities that are eligible for external change detection. This is determined by using the underlying 
     * database view vwEntitiesWithExternalChangeTracking which is a view that is maintained by the MJ system and is used to
     * find a list of entities that have the required characteristics that support external change detection. These characteristics
     * include:
     *  * The entity has the TrackRecordChanges property set to 1
     *  * The entity has the special UpdatedAt/CreatedAt fields (which are called __mj_UpdatedAt and __mj_CreatedAt in the database). These fields are AUTOMATICALLY added to an entity that has TrackRecordChanges set to 1 by the MJ CodeGen tool.
     *  * The entity is not in the IneligibleEntities list. See info on the IneligibleEntities property for more information on excluded entities.
     */
    public get EligibleEntities(): EntityInfo[] {
        const netEligible = this._EligibleEntities.filter(e => !this.IneligibleEntities.map(i => i.toLowerCase().trim()).includes(e.Name.toLowerCase().trim()));
        return netEligible;
    }

    /**
     * Detects external changes for a single entity
     * @param entity 
     */
    public async DetectChangesForEntity(entity: EntityInfo): Promise<ChangeDetectionResult> {
        try {
            // check to make sure that the entity is in the eligible list
            if (!entity) {
                throw new Error("entity parameter is required");
            }
            else if (!this.EligibleEntities.find(e => UUIDsEqual(e.ID, entity.ID))) {
                throw new Error(`Entity ${entity.Name} is not eligible for external change detection. Refer to the documentation on the EligibleEntities and IneligibleEntities properties for more information.`);
            }

            const md = new Metadata();
            const rq = new RunQuery();
            const commonParams = {
                EntityID: entity.ID,
                SchemaName: entity.SchemaName,
                BaseView: entity.BaseView,
                ColumnList: entity.PrimaryKeys.map(pk => `ot.${this._dialect.QuoteIdentifier(pk.Name)}`).join(', '),
                PrimaryKeyJoin: this.getPrimaryKeyString(entity, 'ot'),
                CreatedAtField: EntityInfo.CreatedAtFieldName,
                UpdatedAtField: EntityInfo.UpdatedAtFieldName
            };

            const [createResult, updateResult, deleteResult] = await rq.RunQueries([
                { QueryName: 'ExternalChangeDetection_DetectCreations', Parameters: commonParams },
                { QueryName: 'ExternalChangeDetection_DetectUpdates', Parameters: commonParams },
                { QueryName: 'ExternalChangeDetection_DetectDeletions', Parameters: {
                    ...commonParams,
                    PrimaryKeyIsNull: entity.PrimaryKeys.map(pk => `ot.${this._dialect.QuoteIdentifier(pk.Name)} IS NULL`).join(' AND ')
                } }
            ], this.ContextUser);

            // we have the results for all of the queries, now we need to convert them into ChangeDetectionItems
            const changes: ChangeDetectionItem[] = [];
            if (createResult && createResult.Success && createResult.Results.length > 0) {
                for (const row of createResult.Results) {
                    const item = new ChangeDetectionItem();
                    item.Entity = entity;
                    item.PrimaryKey = new CompositeKey(entity.PrimaryKeys.map(pk => { 
                        return {
                            FieldName: pk.Name, 
                            Value: row[pk.Name]
                        }
                    }));
                    item.Type = 'Create';
                    item.ChangedAt = row.CreatedAt >= row.UpdatedAt ? row.CreatedAt : row.UpdatedAt;
                    item.Changes = []; // not relevant because the row is new 

                    changes.push(item);
                }
            }

            if (updateResult && updateResult.Success && updateResult.Results.length > 0) {
                for (const row of updateResult.Results) {
                    const item = new ChangeDetectionItem();
                    item.Entity = entity;
                    item.PrimaryKey = new CompositeKey(entity.PrimaryKeys.map(pk => { 
                        return {
                            FieldName: pk.Name, 
                            Value: row[pk.Name]
                        }
                    }));
                    item.Type = 'Update';
                    item.ChangedAt = row.UpdatedAt;

                    // push the item but first make sure it is NOT already in the changes from the
                    // create detection, if it is, we do not push it into changes
                    if (!changes.find(c => c.PrimaryKey.Equals(item.PrimaryKey))) {
                        changes.push(item);
                    }
                }
            }

            if (deleteResult && deleteResult.Success && deleteResult.Results.length > 0) {
                deleteResult.Results.forEach(row => {
                    const item = new ChangeDetectionItem();
                    item.Entity = entity;
                    const ck = new CompositeKey();
                    // row.RecordID should have a format of Field1|Value1||Field2|Value2, however in some cases there is legacy
                    // data in the RecordChange table that just has a single value in it and in that case assuming that the entity
                    // in question has a single-valued primary key, we can just use that value as the key, so we need to test for that
                    // first and if we find that the RecordID is just a single value, we can use that as the key
                    if (row.RecordID.indexOf(CompositeKey.DefaultValueDelimiter) === -1) {
                        // there is no field delimiter, so we can assume this is a single value
                        ck.LoadFromSingleKeyValuePair(entity.PrimaryKeys[0].Name, row.RecordID); // this is a string like 'Field1Value' (no quotes
                        item.LegacyKey = true;
                        item.LegacyKeyValue = row.RecordID;
                    }
                    else
                        ck.LoadFromConcatenatedString(row.RecordID); // this is a string like 'Field1Value|Field2Value' (no quotes)

                    item.PrimaryKey = ck;
                    item.Type = 'Delete';
                    item.ChangedAt = row.ChangedAt;
                    item.Changes = []; // not relevant because the row is now deleted
                    changes.push(item);
                });
            }

            await this.GetLatestDatabaseRecords(md, changes); // load everything from the database in one step

            // now we have latest records, go back through and update the Changes field for the UPDATE types
            for (const c of changes) {
                if (c.Type === 'Update') {
                    const changesResult = await this.DetermineRecordChanges(md, c);
                    c.Changes = changesResult.changes;
                }
            }

            return { 
                Success: true, 
                Changes: changes 
            };
        }
        catch (e) {
            LogError(e);
            return { 
                Success: false, 
                ErrorMessage: e.message,
                Changes: [] 
            };
        }
    } 

    /**
     * This method compares a version of the record in question from the database with the last version we had in RecordChange table
     * @param change 
     */
    public async DetermineRecordChanges(md: Metadata, change: ChangeDetectionItem): Promise<{changes: FieldChange[], latestRecord: BaseEntity}> {
        try {
            // Step 1 - load the current record if needed, sometimes already loaded by here
            const record = change.LatestRecord ? change.LatestRecord : await this.GetLatestDatabaseRecord(md, change);
            if (record) {
                // now we have the version from the database that has been updated from an external source
                // then we need to get the latest version from the vwRecordChanges table that matches this entity and RecordID
                const result = await this.GetLatestRecordChangesDataForEntityRecord(change);
                if (result && result.FullRecordJSON && result.FullRecordJSON.length > 0) {
                    // we have our row, so get the JSON, parse it and we'll have the differences
                    const json = JSON.parse(result.FullRecordJSON);
                    // now go through each field in the record object and compare it with the json
                    const changes: FieldChange[] = [];
                    for (const field of record.Fields) {
                        if (!field.IsPrimaryKey) {
                            const differResult = this.DoValuesDiffer(field.FieldType, field.Value, json[field.Name])
                            if (differResult.differ) {
                                changes.push({
                                    FieldName: field.Name,
                                    NewValue: differResult.castValue1, // use the typecast values so they're the right types
                                    OldValue: differResult.castValue2  // use the typecast values so they're the right types
                                });
                            }
                        }
                    }
                    return {changes, latestRecord: record};
                }
                else {
                    LogStatus(`      WARNING: No record found, or no FullRecordJSON found, in vwRecordChanges for ${change.Entity.Name}: ${change.PrimaryKey.ToConcatenatedString()}`);
                    return {changes: [], latestRecord: record};
                }
            }
            else {
                // record not found in database, this could happen if it was deleted between detection and replay
                return {changes: [], latestRecord: null};
            }
        }
        catch (e) {
            LogError(e);
            return {changes: [], latestRecord: null};
        }
    }

    protected DoValuesDiffer(tsType: EntityFieldTSType, value1: any, value2: any): {differ: boolean, castValue1: any, castValue2: any} {
        let castValue1: any = value1;
        let castValue2: any = value2;

        switch (tsType) {
            case EntityFieldTSType.Date:
                castValue1 = value1 ? new Date(value1) : null;
                castValue2 = value2 ? new Date(value2) : null;
                if (castValue1 && castValue2) {
                    // check both to see if they're the same - up to 3 digits of precision
                    // because when we get the values back into JavaScript objects, Date objects only have 3 digits of precision
                    const d1 = castValue1.getTime();
                    const d2 = castValue2.getTime();
                    return {differ: d1 !== d2, castValue1, castValue2};
                }
                else
                    return {differ: castValue1 !== castValue2, castValue1, castValue2};
            case EntityFieldTSType.Number:
                castValue1 = value1 ? parseFloat(value1) : 0;
                castValue2 = value2 ? parseFloat(value2) : 0;
                return {differ: castValue1 !== castValue2, castValue1, castValue2};
            case EntityFieldTSType.Boolean:
                castValue1 = this.CastToBoolean(value1);
                castValue2 = this.CastToBoolean(value2);
                return {differ: castValue1 !== castValue2, castValue1, castValue2};
            default:
                castValue1 = value1 ? value1.toString().trim() : '';
                castValue2 = value2 ? value2.toString().trim() : '';
                return {differ: castValue1 !== castValue2, castValue1, castValue2};
        }
    }

    /**
     * Casts a value to a boolean, properly handling string representations like 'false' and '0'
     * which are truthy in JavaScript but should be treated as false.
     */
    protected CastToBoolean(value: unknown): boolean {
        if (typeof value === 'string') {
            const lower = value.toLowerCase().trim();
            return lower === 'true' || lower === '1';
        }
        return !!value;
    }

    protected async GetLatestRecordChangesDataForEntityRecord(change: ChangeDetectionItem): Promise<any> {
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: "MJ: Record Changes",
                ExtraFilter: `EntityID = '${change.Entity.ID}' AND RecordID = '${change.PrimaryKey.ToConcatenatedString()}' AND Type IN ('Update', 'Create')`,
                OrderBy: "ChangedAt DESC"
            }, this.ContextUser);

            if (result && result.Success && result.Results.length > 0) {
                return result.Results[0];
            }
            else
                return null;
        }
        catch (e) {
            LogError(e);
            return null;
        }
    }

    protected async GetLatestDatabaseRecords(md: Metadata, changes: ChangeDetectionItem[]): Promise<boolean> {
        try {
            const provider = Metadata.Provider as SQLServerDataProvider;
            // distinct list of entities
            const entities: {entity: EntityInfo, keys: CompositeKey[]}[] = [];
            for (const c of changes) {
                if (c.Type === 'Update' || c.Type === 'Create') {
                    let entry = entities.find(e => UUIDsEqual(e.entity.ID, c.Entity.ID))
                    if (!entry) {
                        entry = {entity: c.Entity, keys: []};
                        entities.push(entry);
                    }
                    entry.keys.push(c.PrimaryKey);
                }
            }

            // now we have a distinct list of entities and all of the pkeys for each one, so we can run a single
            // select statement for each entity
            for (const e of entities) {
                const quotedTable = this._dialect.QuoteSchema(e.entity.SchemaName, e.entity.BaseView);
                const sql = `SELECT * FROM ${quotedTable}
                            WHERE ${e.keys.map(k => `(${k.KeyValuePairs.map(kvp => {
                                    const f = e.entity.Fields.find(f => kvp.FieldName.trim().toLowerCase() === f.Name);
                                    const quotes = f?.NeedsQuotes ? "'" : "";
                                    const quotedField = this._dialect.QuoteIdentifier(kvp.FieldName);
                                    const escapedValue = typeof kvp.Value === 'string' ? kvp.Value.replace(/'/g, "''") : kvp.Value;
                                    return `${quotedField}=${quotes}${escapedValue}${quotes}`
                                }).join(' AND ')})`).join(' OR ')} `
                const result = await provider.ExecuteSQL(sql);
                if (result) {
                    // we have the rows from the result, now go back through each of the changes we have in the changes array
                    // and associate the data with each one 
                    for (const r of result) {
                        const kvp: KeyValuePair[] = e.entity.PrimaryKeys.map(pk => {
                            return {
                                FieldName: pk.Name,
                                Value: r[pk.Name]
                            }
                        })
                        const changeItem = changes.find(ci => ci.Entity === e.entity && ci.PrimaryKey.EqualsKey(kvp))
                        if (changeItem) {
                            // found the match, update latest Record
                            const record = await md.GetEntityObject(changeItem.Entity.Name, this.ContextUser);
                            await record.LoadFromData(r);
                            changeItem.LatestRecord = record;
                        }
                    }
                }
            }

            return true;
        }
        catch (e) {
            LogError(e);
            return false;
        }
    }

    protected async GetLatestDatabaseRecord(md: Metadata, change: ChangeDetectionItem): Promise<BaseEntity> {
        try {
            const record = await md.GetEntityObject(change.Entity.Name, this.ContextUser);
            if (await record.InnerLoad(change.PrimaryKey)) {
                return record;
            }
            else
                return null;
        }
        catch (e) {
            LogError(e);
            return null;
        }
    }

    protected getPrimaryKeyString(entity: EntityInfo, tablePrefix: string): string {
        const concatOp = this._dialect.ConcatOperator();
        const castToText = (expr: string) => this._dialect.CastToText(expr);
        const quote = (id: string) => this._dialect.QuoteIdentifier(id);
        const table = quote(tablePrefix);

        return entity.PrimaryKeys.map(pk => 
            `'${pk.Name}${CompositeKey.DefaultValueDelimiter}' ${concatOp} ${castToText(`${table}.${quote(pk.Name)}`)}`
        ).join(` ${concatOp} '${CompositeKey.DefaultFieldDelimiter}' ${concatOp} `);
    }

    /**
     * Detects changes across all of the entities specified
     * @param entities Array of entities to process
     * @param entityBatchSize Optional, defines how many entities to process in parallel. Defaults to 10.
     * @returns 
     */
    public async DetectChangesForEntities(entities: EntityInfo[], entityBatchSize: number = 10): Promise<ChangeDetectionResult>  {
        try {
            if (!entities)
                throw new Error("entities parameter is required");
            else if (entities.length === 0)
                throw new Error("entities parameter must have at least one entity in it");

            const result: ChangeDetectionResult = new ChangeDetectionResult();
            result.Success = true;
            result.Changes = [];

            LogStatus(`Detecting changes for ${entities.length} entities in batches of ${entityBatchSize}`)
            
            // process entities in batches
            for (let i = 0; i < entities.length; i += entityBatchSize) {
                const batch = entities.slice(i, i + entityBatchSize);
                const batchPromises = batch.map(e => {
                    UpdateCurrentConsoleLine(`   Starting change detection changes for ${e.Name}`, ConsoleColor.gray);
                    return this.DetectChangesForEntity(e);
                });
                
                const batchResults = await Promise.all(batchPromises);
                
                for (let j = 0; j < batch.length; j++) {
                    const r = batchResults[j];
                    const e = batch[j];
                    if (r.Success) {
                        result.Changes.push(...r.Changes);
                    }
                    else {
                        result.Success = false;
                        result.ErrorMessage = (result.ErrorMessage ? result.ErrorMessage + "\n" : "") + `Error detecting changes for ${e.Name}: ` + r.ErrorMessage;
                    }
                    UpdateCurrentConsoleProgress(`   Finished change detection changes for ${e.Name}`, i + j + 1, entities.length, r.Success ? ConsoleColor.cyan : ConsoleColor.crimson);
                }
            }

            return result;
        }
        catch (e) {
            LogError(e);
            return {
                Success: false,
                ErrorMessage: e.message,
                Changes: []
            }
        }
    }

    public async DetectChangesForAllEligibleEntities(entityBatchSize: number = 10): Promise<ChangeDetectionResult> {
        return await this.DetectChangesForEntities(this.EligibleEntities, entityBatchSize);
    }

    /**
     * This method will replay all of the items in the changes array
     * @param changes Array of changes to replay.
     * @param batchSize Optional, defines the # of concurrent changes to replay at once. If you want to replay changes serially, set this to 1
     * @param staleTimeoutHours Optional, defines how many hours a run can be in progress before it is considered stale. Defaults to 24.
     * @returns {Promise<boolean>} - Returns true if all changes are successfully replayed, otherwise false.
     */
    public async ReplayChanges(changes: ChangeDetectionItem[], batchSize: number = 20, staleTimeoutHours: number = 24): Promise<boolean> {
        let run; // delcare outside of try block so we have access to it in the catch block
        try {
            if (changes && changes.length > 0) {
                const md = new Metadata();
                const results = [];
                run = await this.StartRun(staleTimeoutHours);
                LogStatus(`Replaying ${changes.length} changes`);

                let numProcessed = 0;
                for (let i = 0; i < changes.length; i += batchSize) {
                    const batch = changes.slice(i, i + batchSize);
                    
                    const batchPromises = batch.map(async (c) => {
                        const result = await this.ReplayChange(md, c);
                        numProcessed++;
                        UpdateCurrentConsoleProgress(`   Replayed ${numProcessed} of ${changes.length} changes`, numProcessed, changes.length);
                        return result;
                    });

                    const batchResults = await Promise.all(batchPromises);
                    results.push(...batchResults);
                }

                // finalize the run record
                run.Status = 'Complete';
                run.EndedAt = new Date();
                await run.Save();

                return results.every(r => r === true);
            }
            else {
                return true; // no changes to replay
            }
        }
        catch (e) {
            LogError(e);
            if (run) {
                run.Status = 'Error';
                run.EndedAt = new Date();
                await run.Save();
            }
            return false;
        }
    }

    protected async ReplayChange(md: Metadata, change: ChangeDetectionItem): Promise<boolean> {
        try {
            switch (change.Type) {
                case 'Create':
                case 'Update':
                    // for creates and updates we have the latest record already loaded 
                    // and we have the list of changes, so we just need to save the record
                    if (change.LatestRecord) {
                        return await change.LatestRecord.Save();
                    }
                    else
                        return false;
                case 'Delete':
                    // for deletes we need to load the record and then delete it
                    const record = await md.GetEntityObject(change.Entity.Name, this.ContextUser);
                    if (await record.InnerLoad(change.PrimaryKey)) {
                        return await record.Delete();
                    }
                    else {
                        // if we can't load it, it's already gone, so we're good
                        return true;
                    }
            }
        }
        catch (e) {
            LogError(e);
            return false;
        }
    }

    protected async StartRun(staleTimeoutHours: number = 24): Promise<MJRecordChangeReplayRunEntity> {
        // first make sure an existing run isn't in progress
        const rv = new RunView();
        const existingRun = await rv.RunView({
            EntityName: "MJ: Record Change Replay Runs",
            ExtraFilter: "Status NOT IN('Complete', 'Error')"
        }, this.ContextUser);
        if (existingRun && existingRun.Success) {
            if (existingRun.Results.length > 0) {
                // we have an existing run, check to see if it is "stale"
                const runData = existingRun.Results[0];
                const startedAt = new Date(runData.StartedAt);
                const now = new Date();
                const diff = now.getTime() - startedAt.getTime();
                const hours = diff / (1000 * 60 * 60);
                if (hours > staleTimeoutHours) {
                    // this is a stale run, so mark it as error and allow a new run to proceed
                    const md = new Metadata();
                    const staleRun = await md.GetEntityObject<MJRecordChangeReplayRunEntity>("MJ: Record Change Replay Runs", this.ContextUser);
                    await staleRun.InnerLoad(runData.ID);
                    staleRun.Status = 'Error';
                    staleRun.EndedAt = new Date();
                    await staleRun.Save();
                    LogStatus(`Marked stale Record Change Replay Run ${runData.ID} as Error (Started: ${startedAt.toISOString()})`);
                }
                else {
                    throw new Error(`Existing Record Change Replay Run ${runData.ID} is not complete or marked as error, cannot start a new run. It started at ${startedAt.toISOString()}.`);
                }
            }

            // if we get here, either there was no existing run, or we just marked a stale run as error
            const md = new Metadata();
            const run = await md.GetEntityObject<MJRecordChangeReplayRunEntity>("MJ: Record Change Replay Runs", this.ContextUser)
            run.StartedAt = new Date();
            run.UserID = this.ContextUser.ID;
            run.Status = 'In Progress';
            if (await run.Save()) {
                // Mitigate race conditions: double-check that no other process started a run at the exact same time
                const doubleCheck = await rv.RunView({
                    EntityName: "MJ: Record Change Replay Runs",
                    ExtraFilter: `Status = 'In Progress' AND ID <> '${run.ID}'`
                }, this.ContextUser);
                
                if (doubleCheck && doubleCheck.Success && doubleCheck.Results.length > 0) {
                    // Another run snuck in! Back out to prevent duplicate processing.
                    run.Status = 'Error';
                    run.EndedAt = new Date();
                    await run.Save(); // Mark it as an error rather than deleting it to keep an audit trail
                    throw new Error("Another process started a run concurrently. Aborting this run to prevent duplicate work.");
                }

                return run;
            }
            else
                throw new Error("Failed to start run");
        }
        else {
            // failed to run the view
            throw new Error("Failed to check for existing run: " + existingRun.ErrorMessage);
        }
    }    
}
