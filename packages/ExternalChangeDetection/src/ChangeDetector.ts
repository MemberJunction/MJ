import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, CompositeKey, EntityField, EntityFieldTSType, EntityInfo, KeyValuePair, LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import { RecordChangeEntity, RecordChangeReplayRunEntity } from "@memberjunction/core-entities";
import { SQLServerDataProvider } from "@memberjunction/sqlserver-dataprovider";


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
 */
export class ExternalChangeDetectorEngine extends BaseEngine<ExternalChangeDetectorEngine> {
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
        const provider: SQLServerDataProvider = <SQLServerDataProvider>Metadata.Provider;

        const c: BaseEnginePropertyConfig[] = [
            {
                EntityName: "Entities",
                PropertyName: "_EligibleEntities",
                Filter: `ID IN (SELECT ID FROM ${provider.MJCoreSchemaName}.vwEntitiesWithExternalChangeTracking)` // limit to entities that are in this view. This view has the logic which basically is TrackRecordChanges=1 and also has an UpdatedAt field
            }
        ];
        await this.Load(c, forceRefresh, contextUser);
    }

    public static get Instance(): ExternalChangeDetectorEngine {
        return super.getInstance<ExternalChangeDetectorEngine>();
    }

    private _EligibleEntities: EntityInfo[];
    /**
     * A list of the entities that are eligible for external change detection
     */
    public get EligibleEntities(): EntityInfo[] {
        return this._EligibleEntities;
    }

    /**
     * Detects external changes for a single entity
     * @param entity 
     */
    public async DetectChangesForEntity(entity: EntityInfo): Promise<ChangeDetectionResult> {
        try {
            const md = new Metadata();

            const sqlCreates = this.generateDetectCreationsQuery(entity);
            const sqlUpdates = this.generateDetectUpdatesQuery(entity);
            const sqlDeletes = this.generateDetectDeletionsQuery(entity);
            const provider = Metadata.Provider as SQLServerDataProvider;
            
            const createResult = await provider.ExecuteSQL(sqlCreates);
            const updateResult = await provider.ExecuteSQL(sqlUpdates);
            const deleteResult = await provider.ExecuteSQL(sqlDeletes);

            // we have the results for all of the queries, now we need to convert them into ChangeDetectionItems
            const changes: ChangeDetectionItem[] = [];
            if (createResult && createResult.length > 0) {
                for (const row of createResult) {
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

            if (updateResult && updateResult.length > 0) {
                for (const row of updateResult) {
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

            if (deleteResult && deleteResult.length > 0) {
                deleteResult.forEach(row => {
                    const item = new ChangeDetectionItem();
                    item.Entity = entity;
                    item.PrimaryKey = new CompositeKey(entity.PrimaryKeys.map(pk => { 
                        return {
                            FieldName: pk.Name, 
                            Value: row.RecordID
                        }
                    }));
                    item.Type = 'Delete';
                    item.ChangedAt = row.ChangeDate;
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
                if (result) {
                    // we have our row, so get the JSON, parse it and we'll have the differences
                    const json = JSON.parse(result.FullRecordJSON);
                    // now go through each field in the record object and compare it with the json
                    const changes: FieldChange[] = [];
                    for (const field of record.Fields) {
                        if (!field.IsPrimaryKey) {
                            const differResult = this.DoValuesDiffer(field, field.Value, json[field.Name])
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
                    LogStatus(`WARNING: No record found in vwRecordChanges for ${change.Entity.Name}: ${change.PrimaryKey}`);
                    return {changes: [], latestRecord: record};
                }
            }
            else
                throw new Error(`Failed to load record: ${change.Entity.Name}: ${change.PrimaryKey}`);        
        }
        catch (e) {
            LogError(e);
            return {changes: [], latestRecord: null};
        }
    }

    protected DoValuesDiffer(field: EntityField, value1: any, value2: any): {differ: boolean, castValue1: any, castValue2: any} {
        // type specific comparisons
        // for each scenario, make sure both value1 and value 2 are of the type we care about, if they're not, create new variables 
        // of those types and then do type specific comparisons for equality
        switch (field.EntityFieldInfo.TSType) {
            case EntityFieldTSType.Boolean:
                // check to see if value1 and value2 are both boolean, if not, convert them to boolean
                const v1 = typeof value1 === 'boolean' ? value1 : value1 === 'true' ? true : false;
                const v2 = typeof value2 === 'boolean' ? value2 : value2 === 'true' ? true : false;
                return {differ: v1 !== v2, castValue1: v1, castValue2: v2};
            case EntityFieldTSType.Date:
                // check to see if value1 and value2 are both dates, if not, convert them to dates
                const d1 = value1 instanceof Date ? value1 : new Date(value1);
                const d2 = value2 instanceof Date ? value2 : new Date(value2);
                return {differ: d1.getTime() !== d2.getTime(), castValue1: d1, castValue2: d2};
            case EntityFieldTSType.Number:
                // check to see if value1 and value2 are both numbers, if not, convert them to numbers
                const n1 = typeof value1 === 'number' ? value1 : parseFloat(value1);
                const n2 = typeof value2 === 'number' ? value2 : parseFloat(value2);
                return {differ: n1 !== n2, castValue1: n1, castValue2: n2};
            case EntityFieldTSType.String:
                // check to see if value1 and value2 are both strings, if not, convert them to strings
                const s1 = typeof value1 === 'string' || !value1 ? value1 : value1.toString();
                const s2 = typeof value2 === 'string' || !value2 ? value2 : value2.toString();
                return {differ: s1 !== s2, castValue1: s1, castValue2: s2};
            default:
                // don't know the type, shouldn't get here, just do a basic TypeScript equality check
                // with a single != instead of !== because we don't want to check type just value
                return {differ: value1 != value2, castValue1: value1, castValue2: value2};
        }
    }

    protected async GetLatestRecordChangesDataForEntityRecord(change: ChangeDetectionItem) {
        const Provider = <SQLServerDataProvider>Metadata.Provider;

        const sql = `SELECT 
                        TOP 1 FullRecordJSON 
                    FROM 
                        ${Provider.MJCoreSchemaName}.vwRecordChanges 
                    WHERE 
                        RecordID = '${change.PrimaryKey.ToConcatenatedString()}' 
                        AND EntityID = ${change.Entity.ID} 
                    ORDER BY 
                        ChangedAt DESC`;                
        const result = await Provider.ExecuteSQL(sql);
        if (result && result.length > 0)
            return result[0];
        else
            return null;
    } 

    protected async GetLatestDatabaseRecord(md: Metadata, change: ChangeDetectionItem): Promise<BaseEntity> {
        const record = await md.GetEntityObject(change.Entity.Name, this.ContextUser);
        if (await record.InnerLoad(change.PrimaryKey) ) {
            return record;
        }
        else
            throw new Error(`Failed to load record: ${change.Entity.Name}: ${change.PrimaryKey}`);
    }

    /**
     * Get all of the latest database records together in grouped queries for each entity that has records we need instead 
     * of one at a time like GetLatestDatabaseRecord does. This method will return true/false and will place the LatestRecord
     * into each item in the changes array for you.
     * @param md 
     * @param changes 
     * @returns 
     */
    protected async GetLatestDatabaseRecords(md: Metadata, changes: ChangeDetectionItem[]): Promise<boolean> {
        try {
            // Step 1 - group by entity and get a complete list of entities from the changes
            const entities: {entity: EntityInfo, keys: CompositeKey[]}[] = [];
            const provider = <SQLServerDataProvider>Metadata.Provider;
            for (const c of changes) {
                let e= entities.find(e => e.entity.ID === c.Entity.ID)
                if (!e) {
                    e = {
                        entity: c.Entity,
                        keys: [c.PrimaryKey]
                    };
                    entities.push(e);
                }            
                else {
                    e.keys.push(c.PrimaryKey);
                }
            }    
            
            // now we have a distinct list of entities and all of the pkeys for each one, so we can run a single
            // select statement for each entity
            for (const e of entities) {
                const sql = `SELECT * FROM [${e.entity.SchemaName}].[${e.entity.BaseView}]
                            WHERE ${e.keys.map(k => `(${k.KeyValuePairs.map(kvp => {
                                    const f = e.entity.Fields.find(f => kvp.FieldName.trim().toLowerCase() === f.Name);
                                    const quotes = f?.NeedsQuotes ? "'" : "";
                                    return `[${kvp.FieldName}]=${quotes}${kvp.Value}${quotes}`
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
                            record.LoadFromData(r);
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


    protected getPrimaryKeyString(entity: EntityInfo, tablePrefix: string): string {
        return entity.PrimaryKeys.map(pk => `'${pk.Name}${CompositeKey.DefaultValueDelimiter}' + CAST(${tablePrefix}.[${pk.Name}] AS NVARCHAR(MAX))`).join(` + '${CompositeKey.DefaultFieldDelimiter}' + `);
    }

    protected generateDetectUpdatesQuery(entity: EntityInfo): string {
        const primaryKeyString = this.getPrimaryKeyString(entity, 'ot')

        return `
            SELECT 
                ${entity.PrimaryKeys.map(pk => `ot.[${pk.Name}]` ).join(', ')}, ot.UpdatedAt
            FROM 
                [${entity.SchemaName}].[${entity.BaseView}] ot
            INNER JOIN (
                SELECT 
                    RecordID, MAX(ChangedAt) AS last_change_time
                FROM 
                    __mj.vwRecordChanges
                WHERE 
                    Type IN ('Update', 'Create') AND EntityID = ${entity.ID}
                GROUP BY 
                    RecordID
            ) rc ON ${primaryKeyString} = rc.RecordID
            WHERE 
                ot.UpdatedAt > COALESCE(rc.last_change_time, '1900-01-01');
        `;
    }
    
    protected generateDetectCreationsQuery(entity: EntityInfo): string {
        const primaryKeyString = this.getPrimaryKeyString(entity, 'ot');
    
        return `
            SELECT 
                ${entity.PrimaryKeys.map(pk => `ot.[${pk.Name}]`).join(', ')}, ot.CreatedAt, ot.UpdatedAt
            FROM 
                [${entity.SchemaName}].[${entity.BaseView}] ot
            LEFT JOIN 
                __mj.vwRecordChanges rc 
                ON 
                (${primaryKeyString} = rc.RecordID) AND 
                rc.Type = 'Create' AND 
                rc.EntityID = ${entity.ID} 
            WHERE 
                rc.RecordID IS NULL;
        `;
    }
    
    protected generateDetectDeletionsQuery(entity: EntityInfo): string {
        const primaryKeyString = this.getPrimaryKeyString(entity, 'ot');
    
        return `
            SELECT 
                rc.RecordID, rc.ChangedAt
            FROM 
                __mj.vwRecordChanges rc
            LEFT JOIN 
                [${entity.SchemaName}].[${entity.BaseView}] ot 
                ON 
                rc.RecordID = ${primaryKeyString}
            WHERE 
                ${entity.PrimaryKeys.map(pk => `ot.[${pk.Name}] IS NULL`).join(' AND ')}
            AND 
                rc.Type IN ('Create', 'Update') AND
                rc.EntityID = ${entity.ID} 
        `;
    }
    


    /**
     * Detects changes across all of the entities specified
     * @returns 
     */
    public async DetectChangesForEntities(entities: EntityInfo[]): Promise<ChangeDetectionResult>  {
        try {
            const result: ChangeDetectionResult = new ChangeDetectionResult();
            result.Success = true;
            result.Changes = [];

            for (const entity of entities) {
                const entityResult = await this.DetectChangesForEntity(entity);
                result.Changes = result.Changes.concat(entityResult.Changes);
                result.Success = result.Success && entityResult.Success;
            }

            return result;
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

    public async DetectChangesForAllEligibleEntities(): Promise<ChangeDetectionResult> {
        return await this.DetectChangesForEntities(this.EligibleEntities);
    }

    /**
     * This method will replay all of the items in the changes array
     * @param changes 
     * @returns 
     */
    public async ReplayChanges(changes: ChangeDetectionItem[]): Promise<boolean> {
        try {
            if (changes && changes.length > 0) {
                const md = new Metadata();
                const results = [];
                const run = await this.StartRun();
                for (const change of changes) {
                    const result = await this.ReplaySingleChange(md, run, change);
                    results.push({Success: result, change: change});
                }
                run.EndedAt = new Date();
                run.Status = results.every(r => r.Success) ? 'Complete' : 'Error';
                if (await run.Save()) {
                    return results.every(r => r.Success);
                }
                else
                    return false;    
            }
            else
                return true; // no changes to process
        }
        catch (e) {
            LogError(e);
            return false;
        }
    }

    protected async StartRun(): Promise<RecordChangeReplayRunEntity> {
        const md = new Metadata();
        const run = await md.GetEntityObject<RecordChangeReplayRunEntity>("Record Change Replay Runs", this.ContextUser)
        run.StartedAt = new Date();
        run.UserID = this.ContextUser.ID;
        run.Status = 'In Progress';
        if (await run.Save()) {
            return run;
        }
        else
            throw new Error("Failed to start run");
    }

    /**
     * Replays a single change item within a given run. This method will:
     *  1) Create a new Record Change record for the replay item
     *  2) Load a BaseEntity derived class for the entity in question and call either Save() or Delete() and pass in the Replay Only option
     *  3) Record the result in the Record Change record, updating status and if appropriate, the error message
     * @param change 
     */
    protected async ReplaySingleChange(md: Metadata, run: RecordChangeReplayRunEntity, change: ChangeDetectionItem): Promise<boolean> {
        try {
            const rc = await this.CreateRecordChangeRecord(md, run, change);
            if (rc) {
                // step 2 - get the base entity for the change
                let entityObject = change.LatestRecord; // for updates and creates we already have this
                if (!entityObject) {
                    // for deletes we don't have this yet - it is not the normal load from DB since it wont be in the database at all
                    entityObject = await md.GetEntityObject(change.Entity.Name, this.ContextUser);
                    const latestRCData = await this.GetLatestRecordChangesDataForEntityRecord(change);
                    if (latestRCData) {
                        const obj = JSON.parse(latestRCData.FullRecordJSON);
                        entityObject.LoadFromData(obj); // loaded up from the latest data in the Record Change table
                    }
                    else {
                        // we have an issue becuase we don't have data in the RecordChange table so we can't replay the DELETE, so mark that in the error for the RecordChange
                        return this.FinishRecordChangeRecord(rc, 'error', 'No prior record data is available in the Record Changes entity, so it is not possible to replay the Delete');
                    }
                }
                // if we get here, entityObject is now all set to go for replay!
                if (change.Type === 'Delete') {
                    const result = await entityObject.Delete({
                        ReplayOnly: true
                    });
                    return this.FinishRecordChangeRecord(rc, result ? 'success' : 'error', entityObject.LatestResult?.Error);
                }
                else {
                    // for updates and creates we just call Save() with the ReplayOnly option
                    const result = await entityObject.Save({
                        ReplayOnly: true,
                        IgnoreDirtyState: false //not relevant for replay
                    });
                    return this.FinishRecordChangeRecord(rc, result ? 'success' : 'error', entityObject.LatestResult?.Error);
                }
            }
            else {
                throw new Error("Failed to create Record Change record");
            }
        }
        catch (e) {
            LogError(e);
            return false;        
        }
    }

    /**
     * This method will attempt to update the RecordChange record and return true if succesful, false otherwise.
     */
    protected async FinishRecordChangeRecord(rc: RecordChangeEntity, code: 'error' | 'success', errorMessage: string): Promise<boolean> {
        try {
            rc.Status = code === 'error' ? 'Error' : 'Complete';
            rc.ErrorLog = errorMessage;
            if(await rc.Save())
                return true;
            else
                return false;   
        }
        catch (e) {
            LogError(e);
            return false;
        }
    }

    /**
     * Creates a new record change record for the start of the replay process.
     * @param change 
     */
    protected async CreateRecordChangeRecord(md: Metadata, run: RecordChangeReplayRunEntity, change: ChangeDetectionItem): Promise<RecordChangeEntity> {
        try {
            const rc = await md.GetEntityObject<RecordChangeEntity>("Record Changes", this.ContextUser);    
            rc.EntityID = change.Entity.ID;
            rc.RecordID = change.PrimaryKey.ToConcatenatedString();
            rc.Source = 'External';
            rc.Type = change.Type;
            rc.Status = 'Pending';
            rc.ChangedAt = change.ChangedAt;
            const changesObject = {};
            for (const field of change.Changes) {
                changesObject[field.FieldName] = {
                    field: field.FieldName,
                    oldValue: field.OldValue,
                    newValue: field.NewValue
                };
            }
            rc.ChangesJSON = JSON.stringify(changesObject);
            // get full json from the latest object
            const obj = change.LatestRecord?.GetAll();
            if (obj)
                rc.FullRecordJSON = JSON.stringify(obj);

            const provider = <SQLServerDataProvider>Metadata.Provider;
            rc.ChangesDescription = provider.CreateUserDescriptionOfChanges(changesObject);
            rc.ReplayRunID = run.ID;
            rc.UserID = this.ContextUser.ID;
            if (await rc.Save()) {
                return rc;
            }
            else {
                return null;
            }
        }
        catch (e) {
            LogError(e);
            return null;
        }
    }    
}
