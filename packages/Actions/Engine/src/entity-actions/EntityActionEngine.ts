import { BaseSingleton, MJGlobal } from "@memberjunction/global";
import { UserInfo, IMetadataProvider } from "@memberjunction/core";
import { MJEntityActionFilterEntity, MJEntityActionInvocationEntity, MJEntityActionInvocationTypeEntity, MJEntityActionParamEntity } from "@memberjunction/core-entities";
import { EntityActionInvocationBase } from "./EntityActionInvocationTypes";
import { EntityActionEngineBase, EntityActionInvocationParams, EntityActionResult, MJEntityActionEntityExtended } from "@memberjunction/actions-base";
 
/**
 * The purpose of this class is to handle the invocation of actions for entities in all of the supported invocation contexts.
 */
export class EntityActionEngineServer extends BaseSingleton<EntityActionEngineServer> {
    public static get Instance(): EntityActionEngineServer {
        return super.getInstance<EntityActionEngineServer>();
    }

    /**
     * Composition over inheritance (mirrors AIEngine/AIEngineBase and ActionEngineServer/ActionEngineBase):
     * EntityActionEngineServer is the server-side invocation layer and caches NO metadata of its own — the
     * single cache lives on EntityActionEngineBase, which this proxies. The prior `<EntityActionEngineServer>
     * super.Instance` subclass pattern actually shared the base's singleton slot (so it didn't double-cache),
     * but it was order-dependent and fragile — the shared instance's concrete type depended on which accessor
     * was touched first. Explicit composition removes that footgun.
     */
    private get Base(): EntityActionEngineBase {
        return EntityActionEngineBase.Instance;
    }

    /**
     * Server-side context user, captured on Config() and settable directly — mirrors AIEngine, which holds
     * its own _contextUser distinct from the shared base cache. Falls back to the base's when not set.
     */
    private _contextUser?: UserInfo;

    /** Ensures the single EntityActionEngineBase cache is loaded. Delegates entirely to the base. */
    public async Config(forceRefresh: boolean = false, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (contextUser) {
            this._contextUser = contextUser;
        }
        await this.Base.Config(forceRefresh, contextUser, provider);
    }

    /** True once the underlying EntityActionEngineBase cache has loaded. */
    public get Loaded(): boolean { return this.Base.Loaded; }

    public get ContextUser(): UserInfo { return this._contextUser ?? this.Base.ContextUser; }
    public set ContextUser(value: UserInfo) { this._contextUser = value; }

    // ── Proxied cached collections (single source of truth: EntityActionEngineBase.Instance) ──
    public get InvocationTypes(): MJEntityActionInvocationTypeEntity[] { return this.Base.InvocationTypes; }
    public get Filters(): MJEntityActionFilterEntity[] { return this.Base.Filters; }
    public get Invocations(): MJEntityActionInvocationEntity[] { return this.Base.Invocations; }
    public get EntityActions(): MJEntityActionEntityExtended[] { return this.Base.EntityActions; }
    public get Params(): MJEntityActionParamEntity[] { return this.Base.Params; }

    // ── Proxied lookups ──
    public GetActionsByEntityName(entityName: string, status?: 'Active' | 'Pending' | 'Disabled'): MJEntityActionEntityExtended[] {
        return this.Base.GetActionsByEntityName(entityName, status);
    }
    public GetActionsByEntityID(entityID: string): MJEntityActionEntityExtended[] {
        return this.Base.GetActionsByEntityID(entityID);
    }
    public GetActionsByEntityNameAndInvocationType(entityName: string, invocationType: string, status?: 'Active' | 'Pending' | 'Disabled'): MJEntityActionEntityExtended[] {
        return this.Base.GetActionsByEntityNameAndInvocationType(entityName, invocationType, status);
    }


    /**
     * Method will invoke an action given the provided parameters. The method will return true if the action was successfully invoked, false otherwise.
     * @param params Parameters for the action invocation
     * @returns 
     */
    public async RunEntityAction(params: EntityActionInvocationParams): Promise<EntityActionResult> {
        /*
            Logic for invoking an Entity Action:
            1) Validate the params, making sure that we have the right stuff
            2) Switch based on the invocation type to execute the right logic
         */
        if (!params.EntityAction) 
            throw new Error('EntityAction is required for invocation');

        // now get the right object based on the invocation type
        if (!params.InvocationType)
            throw new Error('Invalid invocation type provided');

        // now we have the invocation type, use the name as the key for ClassFactory create instance to get what we need
        const invocationInstance = MJGlobal.Instance.ClassFactory.CreateInstance<EntityActionInvocationBase>(EntityActionInvocationBase, params.InvocationType.Name);
        if (!invocationInstance)
            throw new Error('Error creating instance of invocation type');

        // now we have the instance, invoke the action
        return invocationInstance.InvokeAction(params);
    }
}