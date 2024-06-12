import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, CompositeKey, EntityInfo, LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
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
                    item.ChangedAt = row.CreatedAt;
                    item.Changes = []; // not relevant because the row is now 
                    item.LatestRecord = await this.GetLatestDatabaseRecord(md, item);
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

                    // need to compare what is in the database with the last version we had in RecordChanges to populate this
                    const changesResult = await this.DetermineRecordChanges(md, item);
                    item.Changes = changesResult.changes;
                    item.LatestRecord = changesResult.latestRecord;

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
            // Step 1 - load the current record
            const record = await this.GetLatestDatabaseRecord(md, change);
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
                            if (field.Value !== json[field.Name]) {
                                changes.push({
                                    FieldName: field.Name,
                                    OldValue: json[field.Name],
                                    NewValue: field.Value
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

    protected async GetLatestRecordChangesDataForEntityRecord(change: ChangeDetectionItem) {
        const Provider = <SQLServerDataProvider>Metadata.Provider;

        const sql = `SELECT 
                        TOP 1 FullRecordJSON 
                    FROM 
                        ${Provider.MJCoreSchemaName}.vwRecordChanges 
                    WHERE 
                        RecordID = '${change.PrimaryKey.KeyValuePairs.length > 1 ? 
                                    change.PrimaryKey.ToURLSegment() : 
                                    change.PrimaryKey.ToString()}' 
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

    protected getPrimaryKeyString(entity: EntityInfo, tablePrefix: string): string {
        return entity.PrimaryKeys.length === 1 ? 
        `${tablePrefix}.${entity.PrimaryKeys[0].Name}` : 
        entity.PrimaryKeys.map(pk => `'${pk.Name}|' + CAST(${tablePrefix}.[${pk.Name}] AS NVARCHAR(MAX))`).join(` + '||' + `);

    }
    protected generateDetectUpdatesQuery(entity: EntityInfo): string {
        const primaryKeyString = this.getPrimaryKeyString(entity, 'ot')

        return `
            SELECT 
                ${entity.PrimaryKeys.map(pk => `ot.[${pk.Name}]` ).join(', ')}, ot.UpdatedAt
            FROM 
                [${entity.SchemaName}].[${entity.BaseView}] ot
            LEFT JOIN (
                SELECT 
                    RecordID, MAX(ChangedAt) AS last_change_time
                FROM 
                    __mj.vwRecordChanges
                WHERE 
                    Type IN ('Update', 'Create')
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
                ${entity.PrimaryKeys.map(pk => `ot.[${pk.Name}]`).join(', ')}, ot.CreatedAt
            FROM 
                [${entity.SchemaName}].[${entity.BaseView}] ot
            LEFT JOIN 
                __mj.vwRecordChanges rc ON ${primaryKeyString} = rc.RecordID AND rc.Type = 'Create'
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
                [${entity.SchemaName}].[${entity.BaseView}] ot ON ${primaryKeyString} = rc.RecordID
            WHERE 
                ${entity.PrimaryKeys.map(pk => `ot.[${pk.Name}] IS NULL`).join(' AND ')}
            AND 
                rc.Type IN ('Create', 'Update');
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
            const md = new Metadata();
            const results = [];
            const run = await this.StartRun();
            for (const change of changes) {
                const result = await this.ReplaySingleChange(md, run, change);
                results.push({Success: result, change: change});
            }

            return results.every(r => r.Success);
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
            return await rc.Save();
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
            rc.RecordID = change.PrimaryKey.KeyValuePairs.length === 1 ? change.PrimaryKey.ToString() : change.PrimaryKey.ToURLSegment();
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
