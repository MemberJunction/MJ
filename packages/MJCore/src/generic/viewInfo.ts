import { BaseInfo } from './baseInfo'
import { EntityFieldInfo, EntityInfo } from './entityInfo'
import { IMetadataProvider } from './interfaces';
import { LogError } from './logging';

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

export class ViewInfo extends BaseInfo {
    UserID: number = null
    EntityID: number = null
    Name: string = null
    Description: string = null
    CategoryID: number = null
    IsShared: boolean = null
    IsDefault: boolean = null
    GridState: string = null
    FilterState: string = null
    CustomFilterState: string = null
    WhereClause: string = null
    CustomWhereClause: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null
    UserName: string = null
    UserType: string = null
    Entity: string = null
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
                    const match = mdEntities.find(e => e.ID == initData.EntityID) 
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