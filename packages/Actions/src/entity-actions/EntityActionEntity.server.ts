import { BaseEntity, UserInfo } from "@memberjunction/core";
import { EntityActionEntity, EntityActionFilterEntity, EntityActionInvocationEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { EntityActionEngine } from "./EntityActionEngine";

@RegisterClass(BaseEntity, 'Entity Actions')
export class EntityActionEntityServer extends EntityActionEntity {
    private _filters: EntityActionFilterEntity[] = null;
    private _invocations: EntityActionInvocationEntity[] = null;

    /**
     * Get the filters for this entity action
     */
    public get Filters(): EntityActionFilterEntity[] {
        if (!this._filters) {
            // don't have the data loaded yet so get it from the EntityActionEngine
            this._filters = EntityActionEngine.Instance.Filters?.filter(f => f.EntityActionID === this.ID) ?? [];
        }
        return this._filters;
    }

    /**
     * Get the invocations for this entity action
     */
    public get Invocations(): EntityActionInvocationEntity[] {
        if (!this._invocations) {
            // load the data from the EntityActionEngine
            this._invocations = EntityActionEngine.Instance.Invocations?.filter(i => i.EntityActionID === this.ID) ?? [];
        }
        return this._invocations
    }

    
    /**
     * Override the base class Config in order to ensure that EntityActionEngine is configured
     * @param contextUser 
     */
    public override async Config(contextUser: UserInfo): Promise<void> {
        super.Config(contextUser);
        await EntityActionEngine.Instance.Config(false, contextUser);
    }
}       