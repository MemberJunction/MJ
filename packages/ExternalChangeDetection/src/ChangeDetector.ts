import { BaseEngine, BaseEnginePropertyConfig, CompositeKey, EntityInfo, LogError, Metadata, UserInfo } from "@memberjunction/core";
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
                createResult.forEach(row => {
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
                    item.Changes = [];
                    changes.push(item);
                });
            }

            if (updateResult && updateResult.length > 0) {
                updateResult.forEach(row => {
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
                    item.Changes = [];

                    // push the item but first make sure it is NOT already in the changes from the
                    // create detection, if it is, we do not push it into changes
                    if (!changes.find(c => c.PrimaryKey.Equals(item.PrimaryKey))) {
                        changes.push(item);
                    }
                });
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
                    item.Changes = [];
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
}