import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { Metadata, BaseEntity, BaseInfo, EntityInfo, EntityFieldInfo,RunView, UserInfo, EntitySaveOptions, LogError } from "@memberjunction/core";
import { UserViewEntity } from "../generated/entity_subclasses";


@RegisterClass(BaseEntity, 'User Views', 2) // 2 priority so this gets used ahead of the generated sub-class
export class UserViewEntityExtended extends UserViewEntity  {
    private _ViewEntityInfo: EntityInfo = null

    /**
     * This is a read-only property that returns the filters for this view. This information
     * is persisted in a JSON format in the FilterState column of the UserViewEntity table. To access
     * the filters easily, use this property.
     * @readonly
     * @type {ViewFilterInfo[]}
     * @memberof UserViewEntitySubclass
     */
    public get Filter(): ViewFilterInfo[] {
        if (this.FilterState) {
            return [new ViewFilterInfo(JSON.parse(this.FilterState))]
        }
        else 
            return []
    }

    /**
     * This is a read-only property that returns the columns for this view. This information
     * is persisted in a JSON format in the GridState column of the UserViewEntity table. To access
     * the columns easily, use this property. 
     */
    public get Columns(): ViewColumnInfo[] {
        // now, we need to do some post-processing once we've loaded the raw data so that our 
        // columns and filters are set up correctly
        if (this.GridState) {
            const gridState = JSON.parse(this.GridState)
            if (gridState && gridState.columnSettings) {
                const columns = gridState.columnSettings.map(c => {
                    // find the entity field and put it in place inside the View Metadata for easy access
                    if (c) {
                        // check to make sure the current item is non-null to ensure metadata isn't messed up 
                        const field = this.ViewEntityInfo.Fields.find(f => f.Name.trim().toLowerCase() === c.Name.trim().toLowerCase())
                        return new ViewColumnInfo({...c, EntityField: field})
                    }
                    else {
                        console.log('null column setting found in view grid state for columns - ViewID: ' + this.ID)
                    }
                })

                return columns;
            }
        }

        // if we get here, we don't have column info, return an empty array
        return [];
    }

    /**
     * The entity info for the entity that this view is based on
     * @readonly
     * @type {EntityInfo}
     * @memberof UserViewEntitySubclass
     */
    public get ViewEntityInfo(): EntityInfo {
        return this._ViewEntityInfo
    }

    public get ViewSortInfo(): ViewSortInfo[] {
        if (this.SortState) {
            const sortTemp = JSON.parse(this.SortState)
            if (sortTemp && sortTemp.length > 0) 
                return sortTemp.map(s => new ViewSortInfo(s))
        }
        // if we get here return a blank array
        return []
    } 

    public get OrderByClause(): string {
        if (this.ViewSortInfo && this.ViewSortInfo.length > 0) {
            return this.ViewSortInfo.map(s => {
                let dir: string;
                if (typeof s.direction === 'string')
                    dir = s.direction.trim().toLowerCase()
                else if (s.direction === 1 ) // some legacy view metadata has 1/2 for asc/desc
                    dir = 'asc' 
                else if (s.direction === 2 )
                    dir = 'desc'
                else 
                    dir = '';

                const desc = dir === ViewSortDirectionInfo.Desc.trim().toLowerCase()
                return s.field + (desc ? ' DESC' : '');
            }).join(', ')
        }
        else 
            return ''
    }

    override LoadFromData(data: any): boolean {
        // in this case we need to make sure we ge the _ViewEntityInfo property set up correctly
        if (data && data.EntityID) {
            const md = new Metadata();
            const match = md.Entities.find(e => e.ID === data.EntityID)
            if (match) {
                this._ViewEntityInfo = match
            }
            else {
                throw new Error('Unable to find entity info for entity ID: ' + data.EntityID)
            }
        }
        return super.LoadFromData(data)
    }

    override async Load(ID: number, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        // first load up the view info, use the superclass to do this
        const result = await super.Load(ID, EntityRelationshipsToLoad)
        if (result) {
            const md = new Metadata();
            // first, cache a copy of the entity info for the entity that is used in this view
            const match = md.Entities.find(e => e.ID === this.EntityID) 
            if (match)
                this._ViewEntityInfo = match 
            else
                throw new Error('Unable to find entity info for entity ID: ' + this.EntityID)
        }

        return result;
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // we want to preprocess the Save() call because we need to regenerate the WhereClause in some situations
        if (!this.ID ||
            options?.IgnoreDirtyState || 
            this.Fields.find(c => c.Name.toLowerCase() == 'filterstate')?.Dirty ||
            this.Fields.find(c => c.Name.toLowerCase() == 'smartfilterenabled')?.Dirty ||
            this.Fields.find(c => c.Name.toLowerCase() == 'smartfilterprompt')?.Dirty) {
            // either we're ignoring dirty state or the filter state is dirty, so we need to update the where clause
            await this.UpdateWhereClause(options?.IgnoreDirtyState);
        }

        // now just call our superclass to do the actual save()
        return super.Save(options);
    }

    public async SetDefaultsFromEntity(e: EntityInfo) {
        this.EntityID = e.ID;
        const newGridState = new ViewGridState();
        newGridState.columnSettings = [];
        e.Fields.filter(f => f.DefaultInView).forEach(f => {
            newGridState.columnSettings.push({
                ID: f.ID,
                DisplayName: f.DisplayName,
                Name: f.Name,
                hidden: false,
                width: f.DefaultColumnWidth,
                orderIndex: newGridState.columnSettings.length
            });
        });
        this.GridState = JSON.stringify(newGridState); // default columns for a view are the ones with DefaultInView turned on
    }

    override NewRecord(): boolean {
        const result = super.NewRecord()
        if (result) {
            if (this.ContextCurrentUser) {
                this.UserID = this.ContextCurrentUser.ID;
            }
            else {
                const md = new Metadata();
                if (md.CurrentUser)
                    this.UserID = md.CurrentUser.ID;   
                else
                    throw new Error('Unable to determine current user for new view record');
            }
            this.Name = '';
            this.IsShared = false;
            this.IsDefault = false;
            this.WhereClause = '';
            this.Description = '';
            this.FilterState = JSON.stringify({"logic" : "and", "filters" : [] }); // blank default for filter
            this.GridState = JSON.stringify({}); // blank object initially
            this.CustomFilterState = false;
            this.CustomWhereClause = false;
        }
        return result
    }

    /**
     * This method is used to update the view's where clause based on the following logic.
     * 1) If the view has a regular Filter State (which is typically set by an end-user in a UI), the FilterState will be processed and a WHERE clause will be generated
     * 2) If SmartFilterEnabled === 1 and the view has a SmartFilterPrompt, the SmartFilterPrompt will be processed by AI and the SmartFilterWhereClause will be generated. SmartFilterWhereClause will only be generated whenever the SmartFilterPrompt changes.
     * 3) If CustomWhereClause === 1, this function will NOT modify the WhereClause because the sysadmin has set CustomWhereClause === 1 which means we don't want any changes to this particular view's WhereClause
     * IMPORTANT NOTE: This method does not save the record. You still call .Save() to save the record as desired. If you want to get the new WhereClause based on the FilterState but not 
     * update the FilterState column, call the GenerateWhereClause() method.
     * KEY ASSUMPTION: The server code must set a property in the MJGlobal.Properties array with a key of OPENAI_API_KEY to use the AI functionality. If this property is not set, the AI functionality will not work.
     */
    public async UpdateWhereClause(ignoreDirtyState?: boolean) {
        if (this.CustomWhereClause && (this.CustomWhereClause === true || this.CustomWhereClause === 1))
            // if the CustomWhereClause is set to true or 1, we don't want to update the WhereClause
            return;

        // if we get here, we need to update the WhereClause, first check to see if we have a Smart Filter or not
        if (this.SmartFilterEnabled && (this.SmartFilterEnabled === true || this.SmartFilterEnabled === 1) &&
            this.SmartFilterPrompt && this.SmartFilterPrompt.length > 0) {
            if (this.SmartFilterImplemented) {
                // The following block of code is only intended to execute when we're in an execution context where the 
                // lowest level sub-class supports SmartFilter WHere Clause generation, which is determined by the class
                // implementation by overriding the SmartFilterImplemented property and returning true

                // So, if we're here we handle the Smart Filter                
                // we have a smart filter prompt (e.g. a prompt for the AI to create the where clause)
                // if the SmartFilterPrompt has changed, then we need to update the SmartFilterWhereClause using AI
                // otherwise, we don't need to do anything other than just use the SmartFilterWhereClause as it is
                if (!this.ID || ignoreDirtyState || this.Fields.find(c => c.Name.toLowerCase() == 'smartfilterprompt')?.Dirty) {
                    // the prompt has changed (or is newly populated, either way it is dirty) so use the AI to figure this out
                    const result = await this.GenerateSmartFilterWhereClause(this.SmartFilterPrompt, this.ViewEntityInfo);
                    this.SmartFilterWhereClause = result.whereClause;
                    this.SmartFilterExplanation = result.userExplanation;
                }
                // now that we have the SmartFilterWhereClause, we need to update the WhereClause property
                this.WhereClause = this.SmartFilterWhereClause;
            }
            else {
                // while we do have smart filter in this view and the prompt is populated and might be dirty/etc, we don't have a sub-class that supports smart filter
                // so we do NOTHING here. The idea is that this code will execute again on the SERVER side where the sub-class will be able to handle the smart filter
                // and properly generate the SmartFilterWhereClause.
            }
        }
        else {
            this.WhereClause = this.GenerateWhereClause(this.FilterState, this.ViewEntityInfo);
        }
    }

    /**
     * This is a stub method - the intent is for the server-only sub-class to override this method and implement the AI functionality to generate a where clause based on the prompt provided
     * @param prompt - string from the end user describing the filter they want to apply
     * @param entityInfo - entity info for the entity that the view is based on
     */
    public async GenerateSmartFilterWhereClause(prompt: string, entityInfo: EntityInfo): Promise<{whereClause: string, userExplanation: string}> {
        return { whereClause: '', userExplanation: ''}; // stub function returns blank where clause. Sub-Class will do this.
    }

    /**
     * This is a stub method that always returns false - the intent is for the server-only sub-class to override this and return true if it supprots smart filters and then the rest of the smart filter
     * infrastructure will be enabled from the UpdateWhereClause() method.
     */
    protected get SmartFilterImplemented(): boolean {
        return false; // stub function returns false. Sub-Class will do this.
    }

    public override Set(FieldName: string, Value: any): void {
        // call the superclass first and set the value internally there
        super.Set(FieldName, Value);

        if (FieldName.toLowerCase() == 'entityid') {
            // we're updating the entityID, need to upate the _ViewEntityInfo property so it is always in sync
            const md = new Metadata();
            const match = md.Entities.find(e => e.ID === Value)
            if (match)
                this._ViewEntityInfo = match 
            else
                throw new Error('Unable to find entity info for entity ID: ' + Value)    
        }
    }

    /**
     * Create a where clause for SQL from the structured filter state JSON information
     * @param FilterState A string containing a valid Filter State JSON string - this uses the format that the Kendo Filter component uses which is generic and can be used anywhere
     * with/without kendo
     * @param EntityInfo The entity info for the entity that the UserView is based on
     * @returns a string that represents a valid SQL WHERE clause
     * @memberof UserViewEntitySubclass
     * @example Example Filter State JSON below
        FilterState = `{
          "logic": "or",
          "filters": [{
            "field": "Name",
            "operator": "startswith",
            "value": "A"
          }, {
            "logic": "or",
            "filters": [{
              "field": "TotalRevenue",
              "operator": "gt",
              "value": 10000000
            }, {
              "field": "NumberEmployees",
              "operator": "gte",
              "value": 25
            }, {
              "field": "InformationTechnologyExpense",
              "operator": "gte",
              "value": 500000
            }, {
              "logic": "and",
              "filters": [{
                "field": "City",
                "operator": "eq",
                "value": "Chicago"
              }, {
                "field": "ActivityCount",
                "operator": "gte",
                "value": 5
              }]
            }]
          }, {
            "field": "LatestActivityDate",
            "operator": "gte",
            "value": "2023-01-01T06:00:00.000Z"
          }]
        }`;
     */
    protected GenerateWhereClause(FilterState: string, entityInfo: EntityInfo): string {
        return this.processFilterGroup(JSON.parse(FilterState), entityInfo);
    }

    private wrapQuotes(value: string, needQuotes: boolean): string {
        return needQuotes ? `'${value}'` : value;
    }

    private convertFilterToSQL(
        field: string,
        operator: string,
        value: string,
        entity: EntityInfo
    ): string {
        let op: string = '';
        let bNeedsQuotes: boolean = false;
        const f = entity.Fields.find((f) => f.Name.trim().toLowerCase() === field.trim().toLowerCase());
        if (!f)
            throw new Error('Unable to find field ' + field + ' in entity ' + entity.Name);

        switch (f.Type.toLowerCase().trim()) {
            case 'nvarchar':
            case 'char':
            case 'varchar':
            case 'text':
            case 'ntext':
            case 'date':
            case 'datetime':
            case 'datetimeoffset':
            case 'time':
            case 'guid':
            case 'uniqueidentifier':
                bNeedsQuotes = true;
                break;
            // all other cases do not need quotes
        }
        switch (operator) {
            case 'eq':
                op = '= ' + this.wrapQuotes(value, bNeedsQuotes);
                break;
            case 'neq':
                op = '<> ' + this.wrapQuotes(value, bNeedsQuotes);
                break;
            case 'gt':
                op = '> ' + this.wrapQuotes(value, bNeedsQuotes);
                break;
            case 'gte':
                op = '>= ' + this.wrapQuotes(value, bNeedsQuotes);
                break;
            case 'lt':
                op = '< ' + this.wrapQuotes(value, bNeedsQuotes);
                break;
            case 'lte':
                op = '<= ' + this.wrapQuotes(value, bNeedsQuotes);
                break;
            case 'startswith':
                op = `LIKE '${value}%'`;
                break;
            case 'endswith':
                op = `LIKE '%${value}'`;
                break;
            case 'contains':
                op = `LIKE '%${value}%'`;
                break;
            case 'doesnotcontain':
                op = `NOT LIKE '%${value}%'`;
                break;
            case 'isnull':
            case 'isempty':
                op = 'IS NULL';
                break;
            case 'isnotnull':
            case 'isnotempty':
                op = 'IS NOT NULL';
                break;
        }
        return `[${field}] ${op}`;
    }

    private processFilterGroup(filterGroup: any, entity: EntityInfo): string {
        // each filter has two properties, logic and filters
        // logic is either 'and' or 'or' and is what we use to determine the SQL logic operator
        // filters is an array of filters, each filter has a field, operator, and value,
        let whereClause = '';
        let bFirst: boolean = true;
        const logic: string = filterGroup.logic.toUpperCase();

        for (const filter of filterGroup.filters) {
            if (!bFirst) 
                whereClause += ` ${logic} `;
            else 
                bFirst = false;

            // if an individual filter has a "logic" property, it's a group and we need to process it with parenthesis and recurisely
            if (filter.logic && filter.logic.length > 0) {
                // this is a group, we process it with parenthesis
                whereClause += `(${this.processFilterGroup(filter, entity)})`;
            } else {
                // this is an individual filter, easy to process
                whereClause += `(${this.convertFilterToSQL(
                    filter.field,
                    filter.operator,
                    filter.value,
                    entity
                )})`;
            }
        }
        return whereClause;
    }    
}

export class ViewInfo {
    /**
     * Returns a list of views for the specified user. If no user is specified, the current user is used.
     * @param contextUser optional, the user to use for context when loading the view
     * @param entityId optional, the entity ID to filter the views by, if not provided, there is no filter on EntityID and all views for the user are returned
     * @returns an array of UserViewEntityBase objects
     * @memberof ViewInfo
     * @static
     * @async
     */
    static async GetViewsForUser(entityId?: number, contextUser?: UserInfo): Promise<UserViewEntityExtended[]> {
        const rv = new RunView();
        const md = new Metadata();
        const result = await rv.RunView({
            EntityName: 'User Views',
            ExtraFilter: `UserID = ${contextUser ? contextUser.ID : md.CurrentUser.ID}
                         ${entityId ? ` AND EntityID = ${entityId}` : ''}`
        });
        const rd = result?.Results as Array<any>;
        if (result && result.Success && rd) 
            return rd;
    }

    /**
     * Returns a view ID for a given viewName
     * @param viewName Name of the view to lookup the ID for 
     * @returns the ID of the User View record that matches the provided name, if found
     */
    static async GetViewID(viewName: string): Promise<number> {
        const rv = new RunView();
        const result = await rv.RunView({EntityName: 'User Views', ExtraFilter: `Name = '${viewName}'`})
        const rd = result?.Results as Array<any>;
        if (result && result.Success && rd && rd.length > 0) {
            return rd[0].ID
        }
        else {
            throw new Error('Unable to find view with name: ' + viewName)
        }
    }

    /**
     * Loads a new entity object for User Views for the specified viewId and returns it if successful.
     * @param viewId record ID for the view to load
     * @param contextUser optional, the user to use for context when loading the view
     * @returns UserViewEntityBase (or a subclass of it)
     * @throws Error if the view cannot be loaded
     * @memberof ViewInfo
     * @static
     * @async
     */
    static async GetViewEntity(viewId: number, contextUser?: UserInfo): Promise<UserViewEntityExtended> {
        const md = new Metadata();
        const view = <UserViewEntityExtended>await md.GetEntityObject('User Views', contextUser);
        if (await view.Load(viewId))
            return view
        else
            throw new Error('Unable to load view with ID: ' + viewId)
    }

    /**
     * Loads a new entity object for User Views for the specified viewName and returns it if successful.
     * @param viewName name for the view to load
     * @param contextUser optional, the user to use for context when loading the view
     * @returns UserViewEntityBase (or a subclass of it)
     * @throws Error if the view cannot be loaded
     * @memberof ViewInfo
     * @static
     * @async
     */
    static async GetViewEntityByName(viewName: string, contextUser?: UserInfo): Promise<UserViewEntityExtended> {
        const viewId = await ViewInfo.GetViewID(viewName);
        if (viewId) 
            return await ViewInfo.GetViewEntity(viewId, contextUser)
        else 
            throw new Error('Unable to find view with name: ' + viewName)
    }
}

export class ViewColumnInfo extends BaseInfo {
    ID: number = null
    Name: string = null
    DisplayName: string = null
    hidden: boolean = null
    width?: number = null
    orderIndex?: number = null

    EntityField: EntityFieldInfo = null

    constructor (initData: any = null) {
        super()
        this.copyInitData(initData)
    }
}

export const ViewFilterLogicInfo = {
    And: 'And',
    Or: 'Or',
} as const;

export type ViewFilterLogicInfo = typeof ViewFilterLogicInfo[keyof typeof ViewFilterLogicInfo];


export class ViewFilterInfo extends BaseInfo {
    logicOperator: ViewFilterLogicInfo = null

    field: string = null
    operator: string = null
    value: string = null

    filters: ViewFilterInfo[] = []

    constructor (initData: any = null) {
        super()
        this.copyInitData(initData)
        if (initData && initData.logic) {
            this.logicOperator = initData.logic.trim().toLowerCase() == 'and' ? ViewFilterLogicInfo.And : ViewFilterLogicInfo.Or
        }
        if (initData && initData.filters) {
            this.filters = initData.filters.map(f => new ViewFilterInfo(f))
        }
    }
}

export const ViewSortDirectionInfo = {
    Asc: 'Asc',
    Desc: 'Desc',
} as const;

export type ViewSortDirectionInfo = typeof ViewSortDirectionInfo[keyof typeof ViewSortDirectionInfo];

export class ViewSortInfo extends BaseInfo {
    field: string = null
    direction: ViewSortDirectionInfo = null

    constructor (initData: any = null) {
        super()
        this.copyInitData(initData)
        if (initData && initData.dir && typeof initData.dir == 'string') {
            this.direction = initData.dir.trim().toLowerCase() == 'asc' ? ViewSortDirectionInfo.Asc : ViewSortDirectionInfo.Desc
        }
    }
}


export class ViewGridState {
    sortSettings?: any;
    columnSettings?: any;
    filter?: any;
}
