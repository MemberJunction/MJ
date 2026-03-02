import { BaseInfo } from '../generic/baseInfo'
import { EntityFieldInfo, EntityInfo } from '../generic/entityInfo'
import { IMetadataProvider } from '../generic/interfaces';
import { LogError } from '../generic/logging';
import { UUIDsEqual } from '@memberjunction/global';

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

export class ViewGridState {
    sortSettings?: any;
    columnSettings?: any;
    filter?: any;
}

/**
 * This class represents a View in the system. A View is a saved set of filters, columns, and other settings that can be applied to a grid to show a specific set of data.
 */
export class ViewInfo extends BaseInfo {
    /**
     * Unique identifier for the view record
     */
    ID: string = null
    /**
     * Foreign key reference to the user who created this view
     */
    UserID: number = null
    /**
     * Foreign key reference to the entity this view is based on
     */
    EntityID: number = null
    /**
     * Name of the view for display and reference
     */
    Name: string = null
    /**
     * Detailed description of what this view displays and its purpose
     */
    Description: string = null
    /**
     * Foreign key reference to the View Categories entity for organizing views
     */
    CategoryID: number = null
    /**
     * When true, this view is available to other users besides the creator
     */
    IsShared: boolean = null
    /**
     * When true, this view is the default view for the entity
     */
    IsDefault: boolean = null
    /**
     * JSON string containing the complete grid state including columns, sorting, and filters
     */
    GridState: string = null
    /**
     * JSON string containing the filter configuration for this view
     */
    FilterState: string = null
    /**
     * JSON string containing custom filter configuration added by the user
     */
    CustomFilterState: string = null
    /**
     * SQL WHERE clause generated from the filter state for query execution
     */
    WhereClause: string = null
    /**
     * Custom SQL WHERE clause that can be added to supplement the generated WHERE clause
     */
    CustomWhereClause: string = null
    /**
     * Date and time when this view was created
     */
    __mj_CreatedAt: Date = null
    /**
     * Date and time when this view was last updated
     */
    __mj_UpdatedAt: Date = null
    /**
     * Name of the user who owns this view (from related User entity)
     */
    UserName: string = null
    /**
     * Type of user who owns this view (from related User entity)
     */
    UserType: string = null
    /**
     * Name of the entity this view is based on (from related Entity)
     */
    Entity: string = null
    /**
     * Base view name for the entity used in queries
     */
    EntityBaseView: string = null

    private _Filter: ViewFilterInfo[] = []
    public get Filter(): ViewFilterInfo[] {
        return this._Filter
    }

    private _Columns: ViewColumnInfo[] = []
    public get Columns(): ViewColumnInfo[] {
        return this._Columns
    }

    private _EntityInfo: EntityInfo = null
    public get EntityInfo(): EntityInfo {
        return this._EntityInfo
    }

    public InitFromData(md: IMetadataProvider, initData: any) {
        try {
            if (initData) {
                this.copyInitData(initData)
                if (initData.EntityID) {
                    const mdEntities = md.Entities;
                    const match = mdEntities.find(e => UUIDsEqual(e.ID, initData.EntityID))
                    if (match)
                        this._EntityInfo = match 
                }
                else if (initData._EntityInfo) 
                    this._EntityInfo = initData._EntityInfo
        
                // set up the filters and the columns
                if (initData.GridState) {
                    const gridState = JSON.parse(initData.GridState)
                    if (gridState && gridState.columnSettings) {
                        this._Columns = gridState.columnSettings.map(c => {
                            // find the entity field and put it in place inside the View Metadata for easy access
                            if (c) {
                                // check to make sure the current item is non-null to ensure metadata isn't messed up 
                                const field = this._EntityInfo.Fields.find(f => f.Name.trim().toLowerCase() == c.Name.trim().toLowerCase())
                                return new ViewColumnInfo({...c, EntityField: field})
                            }
                            else {
                                LogError('null column setting found in view grid state for columns - ViewID: ' + initData.ID)
                            }
                        })
                    }
                }
                if (initData.FilterState) {
                    this._Filter = [new ViewFilterInfo(JSON.parse(initData.FilterState))]
                }
            }
        }
        catch(e) {
            LogError(e)
            throw e
        }
    }

    constructor (md: IMetadataProvider, initData: any = null) {
        super();
        this.InitFromData(md, initData);
    }
}