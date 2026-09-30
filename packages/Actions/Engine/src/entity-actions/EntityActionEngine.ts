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
    private get base(): EntityActionEngineBase {
        return EntityActionEngineBase.Instance;
    }

    /**
     * Server-side context user, captured on Config() and settable directly — mirrors AIEngine, which holds
     * its own _contextUser distinct from the shared base cache. Falls back to the base's when not set.
     */
    private _contextUser?: UserInfo;

    /**
     * Cache of invocation-type instances, keyed by `InvocationType.Name`. Mirrors
     * `CommunicationEngine._providerInstanceCache`: an `EntityActionInvocationBase` subclass can own
     * its own internal bounded cache (e.g. the Script invocation type's `_scriptCache` in
     * `EntityActionInvocationTypes.ts`), but that cache only pays off if the instance itself survives
     * across calls. Without this cache, `RunEntityAction()` asked `ClassFactory.CreateInstance` for a
     * brand-new instance on every single invocation — so `_scriptCache` was rebuilt from empty and
     * discarded before a second lookup could ever hit it, recompiling every Script-type action's
     * `new Function(...)` from source on every call. Bounded by the number of distinct registered
     * invocation type names (a handful, admin-managed via `MJ: Entity Action Invocation Types`), so no
     * eviction is needed.
     */
    private _invocationInstanceCache: Map<string, EntityActionInvocationBase> = new Map();

    /** Ensures the single EntityActionEngineBase cache is loaded. Delegates entirely to the base. */
    public async Config(forceRefresh: boolean = false, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (contextUser) {
            this._contextUser = contextUser;
        }
        await this.base.Config(forceRefresh, contextUser, provider);
    }

    /** True once the underlying EntityActionEngineBase cache has loaded. */
    public get Loaded(): boolean { return this.base.Loaded; }

    public get ContextUser(): UserInfo { return this._contextUser ?? this.base.ContextUser; }
    public set ContextUser(value: UserInfo) { this._contextUser = value; }

    // ── Proxied cached collections (single source of truth: EntityActionEngineBase.Instance) ──
    public get InvocationTypes(): MJEntityActionInvocationTypeEntity[] { return this.base.InvocationTypes; }
    public get Filters(): MJEntityActionFilterEntity[] { return this.base.Filters; }
    public get Invocations(): MJEntityActionInvocationEntity[] { return this.base.Invocations; }
    public get EntityActions(): MJEntityActionEntityExtended[] { return this.base.EntityActions; }
    public get Params(): MJEntityActionParamEntity[] { return this.base.Params; }

    // ── Proxied lookups ──
    public GetActionsByEntityName(entityName: string, status?: 'Active' | 'Pending' | 'Disabled'): MJEntityActionEntityExtended[] {
        return this.base.GetActionsByEntityName(entityName, status);
    }
    public GetActionsByEntityID(entityID: string): MJEntityActionEntityExtended[] {
        return this.base.GetActionsByEntityID(entityID);
    }
    public GetActionsByEntityNameAndInvocationType(entityName: string, invocationType: string, status?: 'Active' | 'Pending' | 'Disabled'): MJEntityActionEntityExtended[] {
        return this.base.GetActionsByEntityNameAndInvocationType(entityName, invocationType, status);
    }


    /**
     * Method will invoke an action given the provided parameters.
     * @param params Parameters for the action invocation
     * @returns the action's result, or **null when the action did not run** because the binding is
     *          scoped away from this record. Callers must distinguish "did not run" from "ran and
     *          failed" — they are not the same answer.
     * @returns 
     */
    public async RunEntityAction(params: EntityActionInvocationParams): Promise<EntityActionResult | null> {
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
        const invocationTypeName = params.InvocationType.Name;
        let invocationInstance = this._invocationInstanceCache.get(invocationTypeName);
        if (!invocationInstance) {
            invocationInstance = MJGlobal.Instance.ClassFactory.CreateInstance<EntityActionInvocationBase>(EntityActionInvocationBase, invocationTypeName);
            if (!invocationInstance)
                throw new Error('Error creating instance of invocation type');
            this._invocationInstanceCache.set(invocationTypeName, invocationInstance);
        }

        // now we have the instance, invoke the action
        return invocationInstance.InvokeAction(params);
    }
}