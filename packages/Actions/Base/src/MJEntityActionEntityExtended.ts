import { BaseEntity, UserInfo } from "@memberjunction/core";
import { MJEntityActionEntity, MJEntityActionFilterEntity, MJEntityActionInvocationEntity, MJEntityActionParamEntity } from "@memberjunction/core-entities";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { EntityActionEngineBase } from "./EntityActionEngine-Base";

@RegisterClass(BaseEntity, 'MJ: Entity Actions')
export class MJEntityActionEntityExtended extends MJEntityActionEntity {
    private _filters: MJEntityActionFilterEntity[] = null;
    private _invocations: MJEntityActionInvocationEntity[] = null;
    private _params: MJEntityActionParamEntity[] = null;

    /**
     * Get the filters for this entity action
     */
    public get Filters(): MJEntityActionFilterEntity[] {
        if (!this._filters) {
            // don't have the data loaded yet so get it from the EntityActionEngine
            this._filters = EntityActionEngineBase.Instance.Filters?.filter(f => UUIDsEqual(f.EntityActionID, this.ID)) ?? [];
        }
        return this._filters;
    }

    /**
     * Get the invocations for this entity action
     */
    public get Invocations(): MJEntityActionInvocationEntity[] {
        if (!this._invocations) {
            // load the data from the EntityActionEngine
            this._invocations = EntityActionEngineBase.Instance.Invocations?.filter(i => UUIDsEqual(i.EntityActionID, this.ID)) ?? [];
        }
        return this._invocations
    }

    public get Params(): MJEntityActionParamEntity[] {
        if (!this._params) {
            // load the data from the EntityActionEngine
            this._params = EntityActionEngineBase.Instance.Params?.filter(p => UUIDsEqual(p.EntityActionID, this.ID)) ?? [];
        }
        return this._params;
    }

    
    /**
     * Override the base class Config in order to ensure that EntityActionEngine is configured
     * @param contextUser 
     */
    public override async Config(contextUser: UserInfo): Promise<void> {
        super.Config(contextUser);
        EntityActionEngineBase.Instance.Config(false, contextUser); // do this withOUT an await because that will cause an deadlock due to circular situation, sometimes the EntityActinEngine.Config() is called by someone else first
                                                                // harmless to call it again here because it will not do anything extra if already in progress or done.
    }
}       