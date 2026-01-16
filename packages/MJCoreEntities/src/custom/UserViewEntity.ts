import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { Metadata, BaseEntity, BaseInfo, EntityInfo, EntityFieldInfo,RunView, UserInfo, EntitySaveOptions, LogError, EntityFieldTSType, EntityPermissionType, BaseEntityResult } from "@memberjunction/core";
import { UserViewEntity } from "../generated/entity_subclasses";
import { ResourcePermissionEngine } from "./ResourcePermissions/ResourcePermissionEngine";


@RegisterClass(BaseEntity, 'User Views') 
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

    /**
     * Get the parsed DisplayState object from the DisplayState JSON column.
     * DisplayState contains view mode preferences and mode-specific configuration (e.g., timeline settings).
     * @returns The parsed ViewDisplayState object or null if not set/invalid
     */
    public get ParsedDisplayState(): ViewDisplayState | null {
        if (this.DisplayState) {
            try {
                return JSON.parse(this.DisplayState) as ViewDisplayState;
            } catch (e) {
                console.warn('Failed to parse DisplayState JSON:', e);
                return null;
            }
        }
        return null;
    }

    /**
     * Set the DisplayState from a ViewDisplayState object.
     * @param state The ViewDisplayState object to serialize and store
     */
    public setDisplayState(state: ViewDisplayState): void {
        this.DisplayState = JSON.stringify(state);
    }

    /**
     * Get the default view mode from DisplayState, or 'grid' if not set.
     */
    public get DefaultViewMode(): ViewDisplayMode {
        return this.ParsedDisplayState?.defaultMode || 'grid';
    }

    /**
     * Get the timeline configuration from DisplayState.
     * @returns TimelineState or null if not configured
     */
    public get TimelineConfig(): ViewTimelineState | null {
        return this.ParsedDisplayState?.timeline || null;
    }

    /**
     * Update timeline configuration in DisplayState.
     * Creates DisplayState if it doesn't exist.
     * @param config The timeline configuration to set
     */
    public setTimelineConfig(config: ViewTimelineState): void {
        const current = this.ParsedDisplayState || { defaultMode: 'grid' as ViewDisplayMode };
        current.timeline = config;
        this.setDisplayState(current);
    }

    /**
     * Check if a specific view mode is enabled.
     * By default, all modes are enabled unless explicitly disabled.
     * @param mode The view mode to check
     */
    public isViewModeEnabled(mode: ViewDisplayMode): boolean {
        const enabledModes = this.ParsedDisplayState?.enabledModes;
        if (!enabledModes) return true; // All modes enabled by default
        return enabledModes[mode] !== false;
    }

    /**
     * Get the best date field for timeline display based on entity metadata.
     * Priority: 1) DefaultInView=true date fields (lowest Sequence wins)
     *           2) Any date field (lowest Sequence wins)
     * @returns The field name or null if no date fields exist
     */
    public getDefaultTimelineDateField(): string | null {
        if (!this._ViewEntityInfo) return null;

        const dateFields = this._ViewEntityInfo.Fields.filter(f =>
            f.TSType === EntityFieldTSType.Date
        );

        if (dateFields.length === 0) return null;

        // Priority 1: DefaultInView date fields, sorted by Sequence
        const defaultInViewDateFields = dateFields
            .filter(f => f.DefaultInView)
            .sort((a, b) => a.Sequence - b.Sequence);

        if (defaultInViewDateFields.length > 0) {
            return defaultInViewDateFields[0].Name;
        }

        // Priority 2: Any date field, sorted by Sequence
        const sortedDateFields = dateFields.sort((a, b) => a.Sequence - b.Sequence);
        return sortedDateFields[0].Name;
    }

    /**
     * Get all date fields available for timeline configuration.
     * @returns Array of field info objects for date fields
     */
    public getAvailableDateFields(): EntityFieldInfo[] {
        if (!this._ViewEntityInfo) return [];
        return this._ViewEntityInfo.Fields.filter(f =>
            f.TSType === EntityFieldTSType.Date
        ).sort((a, b) => a.Sequence - b.Sequence);
    }

    override async LoadFromData(data: any): Promise<boolean> {
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
        return await super.LoadFromData(data)
    }

    /**
     * This property determines if the specified user can edit the view object. All of the below assumes the user has base Create/Update permissions on the "User Views" entity. 
     * The flow of the logic is:
     *  1) The view is a new record, by definition the user can edit this because it is new
     *  2) The user is the owner of the current view - e.g. UserID in the view record matches the ID of the user provided, allowed
     *  3) The user is a sysadmin (Type === 'Owner' in the User object), allowed
     *  4) If neither of the above conditions are met, the Resource Permissions are checked to see if the user, directly or via Roles, has either Edit or Owner permissions on the current view
     * @returns 
     */
    public get UserCanEdit(): boolean {
        if (this._cachedCanUserEdit === null) {
            this._cachedCanUserEdit = this.CalculateUserCanEdit()
        }
        return this._cachedCanUserEdit;
    }
    private _cachedCanUserEdit: boolean = null


    /**
     * This property determines if the specified user can view the view at all.
     */
    public get UserCanView(): boolean {
        if (this._cachedCanUserView === null) {
            this._cachedCanUserView = this.CalculateUserCanView()
        }
        return this._cachedCanUserView;
    }
    private CalculateUserCanView(): boolean {
        const md = new Metadata();
        const bOwner = this.UserID === md.CurrentUser.ID;
        if (bOwner) {
            return true
        }
        else {
            // not the owner, let's see if the user has permissions or not
            const rt = ResourcePermissionEngine.Instance.ResourceTypes.find((rt: any) => rt.Name === 'User Views');
            if (!rt)
                throw new Error('Resource Type User Views not found');

            const permLevel = ResourcePermissionEngine.Instance.GetUserResourcePermissionLevel(rt.ID, this.ID, md.CurrentUser);
            if (permLevel) // any permission level allows view access
                return true;
            else // perm level not found so return false
                return false;
        }
    }
    private _cachedCanUserView: boolean = null


    /**
     * This property determines if the specified user can delete the view object. All of the below assumes the user has base Delete permissions on the "User Views" entity.
     * The flow of the logic is:
     *  1) The view is a new record, by definition the user can't delete this because it is new
     *  2) The user is the owner of the current view - e.g. UserID in the view record matches the ID of the user provided, allowed
     *  3) The user is a sysadmin (Type === 'Owner' in the User object), allowed
     *  4) If neither of the above conditions are met, the Resource Permissions are checked to see if the user, directly or via Roles, has OWNER permissions on the current view
     */
    public get UserCanDelete(): boolean {
        if (this._cachedUserCanDelete === null) {
            this._cachedUserCanDelete = this.CalculateUserCanDelete()
        }
        return this._cachedUserCanDelete;
    }
    private _cachedUserCanDelete: boolean = null


    protected ResetCachedCanUserSettings() {
        this._cachedCanUserEdit = null;
        this._cachedUserCanDelete = null;
    }

    private CalculateUserCanDelete(): boolean {
        if (!this.IsSaved)
            return false; // new records can't be deleted
        else {
            // EXISTING record in the database
            // check to see if the current user is the OWNER of this view via the UserID property in the record, if there's a match, the user OWNS this views
            const md = new Metadata();
            const user: UserInfo = this.ContextCurrentUser || md.CurrentUser; // take the context current user if it is set, otherwise use the global current user
            if (this.UserID === user.ID || user.Type.trim().toLowerCase() === 'owner' ) {
                return this.CheckPermissions(EntityPermissionType.Delete, false); // exsiting records OWNED by current user, can be edited so long as we have Update permissions;
            }
            else {
                // if the user is not an admin, and they are NOT the owner of the view, we check the permissions on the resource
                const perms = ResourcePermissionEngine.Instance.GetUserResourcePermissionLevel(this.ViewResourceTypeID, this.ID, user);
                return perms === 'Owner'; // this is the only level that can delete a view
            }
        }
    }

    private CalculateUserCanEdit(): boolean {
        if (!this.IsSaved) {
            return this.CheckPermissions(EntityPermissionType.Create, false); // new records an be edited so long as we have Create permissions
        }
        else {
            // EXISTING record in the database
            // check to see if the current user is the OWNER of this view via the UserID property in the record, if there's a match, the user OWNS this views
            // so of course they can save it
            const md = new Metadata();
            const user: UserInfo = this.ContextCurrentUser || md.CurrentUser; // take the context current user if it is set, otherwise use the global current user
            if (this.UserID === user.ID || user.Type.trim().toLowerCase() === 'owner') {
                return this.CheckPermissions(EntityPermissionType.Update, false); // exsiting records OWNED by current user, can be edited so long as we have Update permissions;
            }
            else {
                // if the user is not an admin, and they are NOT the owner of the view, we check the permissions on the resource
                const perms = ResourcePermissionEngine.Instance.GetUserResourcePermissionLevel(this.ViewResourceTypeID, this.ID, user);
                return perms === 'Owner' || perms === 'Edit'; // these are the only two levels that can save a view
            }
        }
    }

    /**
     * Returns the ID of the Resource Type metadata record that corresponds to the User Views entity
     */
    public get ViewResourceTypeID(): string {
        if (!this._ViewResourceTypeID) {
            const rt = ResourcePermissionEngine.Instance.ResourceTypes;
            const rtUV = rt.find(r => r.Entity === 'User Views');
            if (!rtUV)
                throw new Error('Unable to find Resource Type for User Views entity');
            this._ViewResourceTypeID = rtUV.ID;
        }
        return this._ViewResourceTypeID;
    }
    private _ViewResourceTypeID: string = null

    override async Load(ID: string, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
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

        this.ResetCachedCanUserSettings();
        return result;
    }

    override async Delete(): Promise<boolean> {
        if (this.UserCanDelete) {
            // if we get here, the user can delete the view, so we delete it
            if (super.Delete()) {
                this.ResetCachedCanUserSettings();
                return true;
            }
            else
                return false;
        }
        else {
            // if we get here, the user can't delete the view, so we don't delete it, add a last error and return false
            const res: BaseEntityResult = new BaseEntityResult();
            res.Success = false;
            res.Message = 'User does not have permission to delete this view';
            res.StartedAt = new Date();
            res.EndedAt = new Date();
            this.ResultHistory.push(res);
            return false;
        }
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.UserCanEdit) {
            // we want to preprocess the Save() call because we need to regenerate the WhereClause in some situations
            const id = this.ID;
            const filterStateField = this.Fields.find(c => c.Name.toLowerCase() == 'filterstate');
            const smartFilterEnabledField = this.Fields.find(c => c.Name.toLowerCase() == 'smartfilterenabled');
            const smartFilterPromptField = this.Fields.find(c => c.Name.toLowerCase() == 'smartfilterprompt');
            if (!this.ID ||
                options?.IgnoreDirtyState || 
                filterStateField?.Dirty ||
                smartFilterEnabledField?.Dirty ||
                smartFilterPromptField?.Dirty) {
                // either we're ignoring dirty state or the filter state is dirty, so we need to update the where clause
                await this.UpdateWhereClause(options?.IgnoreDirtyState);
            }

            // now call our superclass to do the actual save()
            if (await super.Save(options)) {
                this.ResetCachedCanUserSettings();
                return true;
            }            
            else
                return false;
        }
        else {
            // if we get here, the user can't edit the view, so we don't save it, add a last error and return false
            const res: BaseEntityResult = new BaseEntityResult();
            res.Success = false;
            res.Message = this.ID ? 'User does not have permission to edit this view' : 'User does not have permission to create a new view';
            res.StartedAt = new Date();
            res.EndedAt = new Date();
            this.ResultHistory.push(res);
            return false;
        }
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
        const result = super.NewRecord();
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
            //this.SmartFilterEnabled = false;
        }
        this.ResetCachedCanUserSettings();

        return result;
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

        const f = entity.Fields.find((f) => f.Name.trim().toLowerCase() === field.trim().toLowerCase());
        if (!f)
            throw new Error('Unable to find field ' + field + ' in entity ' + entity.Name);

        let newValue = value;
        if (f.TSType === EntityFieldTSType.Boolean) {
            if (typeof value === 'boolean') {
                newValue = value ? '1' : '0';
            } else if (typeof value === 'string') {
                newValue = value.trim().toLowerCase() === 'true' ? '1' : '0';
            } else {
                // Handle numbers, null, undefined, etc.
                newValue = value ? '1' : '0';
            }
        }
        switch (operator) {
            case 'eq':
                op = '= ' + this.wrapQuotes(newValue, f.NeedsQuotes);
                break;
            case 'neq':
                op = '<> ' + this.wrapQuotes(newValue, f.NeedsQuotes);
                break;
            case 'gt':
                op = '> ' + this.wrapQuotes(newValue, f.NeedsQuotes);
                break;
            case 'gte':
                op = '>= ' + this.wrapQuotes(newValue, f.NeedsQuotes);
                break;
            case 'lt':
                op = '< ' + this.wrapQuotes(newValue, f.NeedsQuotes);
                break;
            case 'lte':
                op = '<= ' + this.wrapQuotes(newValue, f.NeedsQuotes);
                break;
            case 'startswith':
                op = `LIKE '${newValue}%'`;
                break;
            case 'endswith':
                op = `LIKE '%${newValue}'`;
                break;
            case 'contains':
                op = `LIKE '%${newValue}%'`;
                break;
            case 'doesnotcontain':
                op = `NOT LIKE '%${newValue}%'`;
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
    static async GetViewsForUser(entityId?: string, contextUser?: UserInfo): Promise<UserViewEntityExtended[]> {
        const rv = new RunView();
        const md = new Metadata();
        const result = await rv.RunView({
            EntityName: 'User Views',
            ExtraFilter: `UserID = '${contextUser ? contextUser.ID : md.CurrentUser.ID}'
                         ${entityId ? ` AND EntityID = '${entityId}'` : ''}`
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
    static async GetViewID(viewName: string): Promise<string> {
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
     * Gets a User View entity from the UserViewEngine cache.
     * @param viewId record ID for the view to load
     * @param contextUser optional, the user context for loading views
     * @returns UserViewEntityBase (or a subclass of it)
     * @throws Error if the view is not found in the engine cache
     * @memberof ViewInfo
     * @static
     * @async
     */
    static async GetViewEntity(viewId: string, contextUser?: UserInfo): Promise<UserViewEntityExtended> {
        const { UserViewEngine } = await import('../engines/UserViewEngine');
        // Ensure the engine is configured before use
        await UserViewEngine.Instance.Config(false, contextUser);
        const view = UserViewEngine.Instance.GetViewById(viewId);
        if (view) {
            return view;
        }
        throw new Error('Unable to find view with ID: ' + viewId);
    }

    /**
     * Gets a User View entity from the UserViewEngine cache by name.
     * @param viewName name for the view to load
     * @param contextUser optional, the user context for loading views
     * @returns UserViewEntityBase (or a subclass of it)
     * @throws Error if the view is not found in the engine cache
     * @memberof ViewInfo
     * @static
     * @async
     */
    static async GetViewEntityByName(viewName: string, contextUser?: UserInfo): Promise<UserViewEntityExtended> {
        const { UserViewEngine } = await import('../engines/UserViewEngine');
        // Ensure the engine is configured before use
        await UserViewEngine.Instance.Config(false, contextUser);
        const view = UserViewEngine.Instance.GetViewByName(viewName);
        if (view) {
            return view;
        }
        throw new Error('Unable to find view with name: ' + viewName);
    }
}

/**
 * Column pinning position for AG Grid
 */
export type ViewColumnPinned = 'left' | 'right' | null;

/**
 * Column information for a saved view, including AG Grid-specific properties
 */
export class ViewColumnInfo extends BaseInfo {
    /** Entity field ID */
    ID: string = null
    /** Field name */
    Name: string = null
    /** Display name for column header (from entity metadata) */
    DisplayName: string = null
    /** User-defined display name override for column header */
    userDisplayName?: string = null
    /** Whether column is hidden */
    hidden: boolean = null
    /** Column width in pixels */
    width?: number = null
    /** Column order index */
    orderIndex?: number = null

    // AG Grid-specific properties
    /** Column pinning position ('left', 'right', or null for not pinned) */
    pinned?: ViewColumnPinned = null
    /** Flex grow factor (for auto-sizing columns) */
    flex?: number = null
    /** Minimum column width */
    minWidth?: number = null
    /** Maximum column width */
    maxWidth?: number = null

    /** Column formatting configuration */
    format?: ColumnFormat = null

    /** Reference to the entity field metadata (not persisted) */
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


/**
 * Sort setting for a single column
 */
export interface ViewGridSortSetting {
    /** Field name to sort by */
    field: string;
    /** Sort direction */
    dir: 'asc' | 'desc';
}

/**
 * Column setting as persisted in GridState JSON
 * This is the serializable form of ViewColumnInfo (without EntityField reference)
 */
export interface ViewGridColumnSetting {
    /** Entity field ID */
    ID?: string;
    /** Field name */
    Name: string;
    /** Display name for column header (from entity metadata) */
    DisplayName?: string;
    /** User-defined display name override for column header */
    userDisplayName?: string;
    /** Whether column is hidden */
    hidden?: boolean;
    /** Column width in pixels */
    width?: number;
    /** Column order index */
    orderIndex?: number;
    /** Column pinning position */
    pinned?: ViewColumnPinned;
    /** Flex grow factor */
    flex?: number;
    /** Minimum column width */
    minWidth?: number;
    /** Maximum column width */
    maxWidth?: number;
    /** Column formatting configuration */
    format?: ColumnFormat;
}

/**
 * Text styling options for column headers and cells
 */
export interface ColumnTextStyle {
    /** Bold text */
    bold?: boolean;
    /** Italic text */
    italic?: boolean;
    /** Underlined text */
    underline?: boolean;
    /** Text color (CSS color value) */
    color?: string;
    /** Background color (CSS color value) */
    backgroundColor?: string;
}

/**
 * Conditional formatting rule for dynamic cell styling
 */
export interface ColumnConditionalRule {
    /** Condition type */
    condition: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'between' | 'contains' | 'startsWith' | 'endsWith' | 'isEmpty' | 'isNotEmpty';
    /** Value to compare against */
    value?: string | number | boolean;
    /** Second value for 'between' condition */
    value2?: number;
    /** Style to apply when condition is met */
    style: ColumnTextStyle;
}

/**
 * Column formatting configuration
 * Supports value formatting, alignment, header/cell styling, and conditional formatting
 */
export interface ColumnFormat {
    /**
     * Format type - determines which formatter to use
     * 'auto' uses smart defaults based on field metadata
     */
    type?: 'auto' | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'boolean' | 'text';

    /** Decimal places for number/currency/percent types */
    decimals?: number;

    /** Currency code (ISO 4217) for currency type, e.g., 'USD', 'EUR' */
    currencyCode?: string;

    /** Show thousands separator for number types */
    thousandsSeparator?: boolean;

    /**
     * Date format preset or custom pattern
     * Presets: 'short', 'medium', 'long'
     * Custom: Any valid date format string
     */
    dateFormat?: 'short' | 'medium' | 'long' | string;

    /** Label to display for true values (boolean type) */
    trueLabel?: string;

    /** Label to display for false values (boolean type) */
    falseLabel?: string;

    /** How to display boolean values */
    booleanDisplay?: 'text' | 'checkbox' | 'icon';

    /** Text alignment */
    align?: 'left' | 'center' | 'right';

    /** Header styling (bold, italic, color, etc.) */
    headerStyle?: ColumnTextStyle;

    /** Cell styling (applies to all cells in the column) */
    cellStyle?: ColumnTextStyle;

    /** Conditional formatting rules (applied in order, first match wins) */
    conditionalRules?: ColumnConditionalRule[];
}

/**
 * Grid state persisted in UserView.GridState column
 * Contains column configuration, sort settings, and optional filter state
 */
export class ViewGridState {
    /** Sort settings - array of field/direction pairs */
    sortSettings?: ViewGridSortSetting[];
    /** Column settings - visibility, width, order, pinning, etc. */
    columnSettings?: ViewGridColumnSetting[];
    /** Filter state (Kendo-compatible format) */
    filter?: ViewFilterInfo;
}

/**
 * View display modes supported by the entity viewer
 */
export type ViewDisplayMode = 'grid' | 'cards' | 'timeline';

/**
 * Timeline segment grouping options
 */
export type ViewTimelineSegmentGrouping = 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year';

/**
 * Timeline-specific configuration state
 */
export interface ViewTimelineState {
    /** The date field name to use for timeline ordering */
    dateFieldName: string;
    /** Time segment grouping */
    segmentGrouping?: ViewTimelineSegmentGrouping;
    /** Sort order for timeline events */
    sortOrder?: 'asc' | 'desc';
    /** Whether segments are collapsible */
    segmentsCollapsible?: boolean;
    /** Whether segments start expanded */
    segmentsDefaultExpanded?: boolean;
}

/**
 * Card-specific configuration state
 */
export interface ViewCardState {
    /** Custom card size */
    cardSize?: 'small' | 'medium' | 'large';
}

/**
 * Grid-specific display configuration
 */
export interface ViewGridDisplayState {
    /** Row height preference */
    rowHeight?: 'compact' | 'normal' | 'comfortable';
}

/**
 * View display state - persisted in UserView.DisplayState
 * Contains the default view mode and mode-specific configuration
 */
export interface ViewDisplayState {
    /** The default view mode to show when loading this view */
    defaultMode: ViewDisplayMode;
    /** Which view modes are enabled/visible for this view */
    enabledModes?: {
        grid?: boolean;
        cards?: boolean;
        timeline?: boolean;
    };
    /** Timeline-specific configuration */
    timeline?: ViewTimelineState;
    /** Card-specific configuration */
    cards?: ViewCardState;
    /** Grid-specific configuration */
    grid?: ViewGridDisplayState;
}
