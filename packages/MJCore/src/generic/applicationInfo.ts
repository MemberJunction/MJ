import { BaseInfo } from './baseInfo'
import { EntityInfo } from './entityInfo'
import { IMetadataProvider } from './interfaces';

/**
 * Stores configuration settings and preferences for applications, including key-value pairs for runtime parameters and user-specific customizations.
 */
export class ApplicationSettingInfo extends BaseInfo {
    /**
     * Unique identifier for the application setting
     */
    ID: string = null
    
    /**
     * Name of the application this setting belongs to
     */
    ApplicationName: string = null
    
    /**
     * Name of the setting
     */
    Name: string = null
    
    /**
     * The setting value, can be simple text, numbers, booleans, or JSON for complex configuration objects
     */
    Value: string = null
    
    /**
     * Additional comments about the setting
     */
    Comments: string = null
    
    /**
     * Timestamp when the record was created
     */
    __mj_CreatedAt: Date = null
    
    /**
     * Timestamp when the record was last updated
     */
    __mj_UpdatedAt: Date = null

    constructor (initData: any = null) {
        super()
        this.copyInitData(initData)
    }
}

/**
 * List of entities within each application. An application can have any number of entities and an entity can be part of any number of applications.
 */
export class ApplicationEntityInfo extends BaseInfo {
    /**
     * Unique identifier for the application entity relationship
     */
    ID: string = null
    
    /**
     * Name of the application
     */
    ApplicationName: string = null
    
    /**
     * ID of the entity linked to this application
     */
    EntityID: string = null
    
    /**
     * Display order of this entity within the application, lower numbers appear first in navigation and menus
     */
    Sequence: number = null
    
    /**
     * When set to true, the entity will be included by default for a new user when they first access the application in question
     */
    DefaultForNewUser: boolean = null
    
    /**
     * Application name (denormalized field)
     */
    Application: string = null
    
    /**
     * Entity name (denormalized field)
     */
    Entity: string = null
    
    /**
     * Base table name of the entity
     */
    EntityBaseTable: string = null
    
    /**
     * Code-friendly name of the entity
     */
    EntityCodeName: string = null
    
    /**
     * Class name of the entity
     */
    EntityClassName: string = null
    
    /**
     * Code-friendly name of the entity's base table
     */
    EntityBaseTableCodeName: string = null

    private _EntityInfo: EntityInfo = null
    /**
     * Gets the full entity metadata for the entity linked to this application.
     * @returns {EntityInfo} The entity information object
     */
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
 * Applications are used to group entities in the user interface for ease of user access.
 * Provides organizational structure for presenting entities to users.
 */
export class ApplicationInfo extends BaseInfo {
    /**
     * Unique identifier for the application
     */
    ID: string = null
    
    /**
     * Name of the application
     */
    Name: string = null
    
    /**
     * Description of the application
     */
    Description: string = null
    
    /**
     * CSS class information for the display icon for each application
     */
    Icon: string = null
    
    /**
     * If turned on, when a new user first uses the MJ Explorer app, the application records with this turned on will have this application included in their selected application list
     */
    DefaultForNewUser: boolean = null
    
    /**
     * Comma-delimited list of schema names where entities will be automatically added to the application when created in those schemas
     */
    SchemaAutoAddNewEntities: string = null

    /**
     * Timestamp when the record was created
     */
    __mj_CreatedAt: Date = null; 

    /**
     * Timestamp when the record was last updated
     */
    __mj_UpdatedAt: Date = null; 
    
    /**
    * Hex color code for visual theming (e.g., #4caf50)
    */
    Color: string = null;

    /**
    * JSON array of default navigation items for this application. Parsed by BaseApplication.GetNavItems()
    */
    DefaultNavItems: string = null;

    /**
    * TypeScript class name for ClassFactory registration (e.g., CRMApplication)
    */
    ClassName: string = null;

        
    private _ApplicationEntities: ApplicationEntityInfo[] = []
    /**
     * Gets the list of entities that belong to this application with their display sequence.
     * @returns {ApplicationEntityInfo[]} Array of application entity mappings
     */
    public get ApplicationEntities(): ApplicationEntityInfo[] {
        return this._ApplicationEntities;
    } 

    private _ApplicationSettings: ApplicationSettingInfo[] = []
    /**
     * Gets the configuration settings for this application.
     * @returns {ApplicationSettingInfo[]} Array of key-value settings
     */
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
 