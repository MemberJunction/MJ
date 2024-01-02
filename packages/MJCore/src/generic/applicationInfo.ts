import { BaseInfo } from './baseInfo'
import { EntityInfo } from './entityInfo'
import { IMetadataProvider } from './interfaces';

export class ApplicationEntityInfo extends BaseInfo {
    ApplicationName: string = null
    EntityID: number = null
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

export class ApplicationInfo extends BaseInfo {
    Name: string = null
    Description: string = null

    private _ApplicationEntities: ApplicationEntityInfo[] = []
    public get ApplicationEntities(): ApplicationEntityInfo[] {
        return this._ApplicationEntities;
    } 

    constructor (md: IMetadataProvider, initData: any = null) {
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
        }
    }

}
 