import { BaseInfo } from './baseInfo'
import { EntityInfo } from './entityInfo'
import { IMetadataProvider } from './interfaces';

export class ApplicationSettingInfo extends BaseInfo {
    ID: string = null
    ApplicationName: string = null
    Name: string = null
    Value: string = null
    Comments: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    constructor (initData: any = null) {
        super()
        this.copyInitData(initData)
    }
}

export class ApplicationEntityInfo extends BaseInfo {
    ID: string = null
    ApplicationName: string = null
    EntityID: string = null
    Sequence: number = null
    DefaultForNewUser: boolean = null
    Application: string = null
    Entity: string = null
    EntityBaseTable: string = null
    EntityCodeName: string = null
    EntityClassName: string = null
    EntityBaseTableCodeName: string = null

    private _EntityInfo: EntityInfo = null
    public get EntityInfo(): EntityInfo {
        return this._EntityInfo
    }

    _setEntity(entity: EntityInfo) {
        this._EntityInfo = entity
    }

    constructor (initData: any = null) {
        super()
        this.copyInitData(initData)
    }
}

/**
 * Information about an application
 */
export class ApplicationInfo extends BaseInfo {
    Name: string = null
    Description: string = null
    Icon: string = null
    DefaultForNewUser: boolean = null

    private _ApplicationEntities: ApplicationEntityInfo[] = []
    public get ApplicationEntities(): ApplicationEntityInfo[] {
        return this._ApplicationEntities;
    } 

    private _ApplicationSettings: ApplicationSettingInfo[] = []
    public get ApplicationSettings(): ApplicationSettingInfo[] {
        return this._ApplicationSettings;
    }

    constructor (initData: any = null, md: IMetadataProvider) {
        super()
        this.copyInitData(initData)
        if (initData) {
            let ae = initData.ApplicationEntities || initData._ApplicationEntities;
            if (ae) {
                const mdEntities = md.Entities;
                this._ApplicationEntities=  [];
                for (let i = 0; i < ae.length; i++) {
                    // 
                    const aei = new ApplicationEntityInfo(ae[i])
                    this._ApplicationEntities.push(aei)
    
                    const match = mdEntities.find(e => e.ID == ae[i].EntityID) 
                    if (match)
                        aei._setEntity(match)
                }
            }

            let as = initData.ApplicationSettings || initData._ApplicationSettings;
            if (as) 
                this._ApplicationSettings = as.map(s => new ApplicationSettingInfo(s));
        }
    }

}
 