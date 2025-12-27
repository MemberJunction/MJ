import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { DashboardEntityExtended } from "../custom/DashboardEntityExtended";
import { DashboardCategoryEntity, DashboardUserPreferenceEntity, DashboardUserStateEntity } from "../generated/entity_subclasses";


/**
 * Caching of metadata for dashboards and related data
 */
export class DashboardEngine extends BaseEngine<DashboardEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): DashboardEngine {
       return super.getInstance<DashboardEngine>();
    }

    private _dashboards: DashboardEntityExtended[];
    private _dashboardUserPreferences: DashboardUserPreferenceEntity[];
    private _dashboardCategories: DashboardCategoryEntity[];
    private _dashboardUserStates: DashboardUserStateEntity[];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'Dashboards',
                PropertyName: "_dashboards"
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Dashboard User Preferences',
                PropertyName: "_dashboardUserPreferences"
            },
            {
                Type: 'entity',
                EntityName: 'Dashboard Categories',
                PropertyName: "_dashboardCategories"
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Dashboard User States',
                PropertyName: "_dashboardUserStates"
            } 
        ]
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    public get Dashboards(): DashboardEntityExtended[] {
        return this._dashboards;
    }

    public get DashboardUserPreferences(): DashboardUserPreferenceEntity[] {
        return this._dashboardUserPreferences;
    }

    public get DashboardCategories(): DashboardCategoryEntity[] {
        return this._dashboardCategories;
    }

    public get DashboardUserStates(): DashboardUserStateEntity[] {
        return this._dashboardUserStates;
    }
}
