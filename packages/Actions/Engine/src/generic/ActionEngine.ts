import { BaseEntitySaveQueue, LogError, LogErrorEx, Metadata, UserInfo, IMetadataProvider } from "@memberjunction/core";
import { MJActionExecutionLogEntity, MJActionEntity_IRuntimeActionConfiguration, MJActionCategoryEntity, MJActionFilterEntity, MJActionLibraryEntity, MJActionParamEntity, MJActionResultCodeEntity } from "@memberjunction/core-entities";
import { BaseSingleton, MJGlobal, SafeJSONParse, UUIDsEqual } from "@memberjunction/global";
import { BaseAction } from "./BaseAction";
import {
    ActionEngineBase,
    MJActionEntityExtended,
    ActionParam,
    ActionResult,
    ActionResultSimple,
    RunActionParams,
    RuntimeActionConfigurationSchema,
    RuntimeActionBridgeBuilder
} from "@memberjunction/actions-base";
import { RuntimeActionExecutor } from "@memberjunction/action-runtime";
import type { BridgeHandlerMap } from "@memberjunction/code-execution";

 

/**
 * Base class for executing actions. This class can be sub-classed if desired if you would like to modify the logic across ALL actions. To do so, sub-class this class and use the 
 * @RegisterClass decorator from the @memberjunction/global package to register your sub-class with the ClassFactory. This will cause your sub-class to be used instead of this base class when the Metadata object insantiates the ActionEngine.
 */
export class ActionEngineServer extends BaseSingleton<ActionEngineServer> {


   public static get Instance(): ActionEngineServer {
      return super.getInstance<ActionEngineServer>();
   }

   /**
    * ActionEngineServer is the server-side CAPABILITY layer (action execution, filters, logging). It
    * does NOT extend ActionEngineBase and NEVER caches its own copy of the action metadata — it would
    * otherwise be a second BaseEngine singleton issuing a duplicate RunViews batch and holding a second
    * copy of all 6 cached arrays (the "Duplicate RunView Detected" telemetry warning). Instead it
    * COMPOSES the single ActionEngineBase cache and proxies every cached collection / lookup to it,
    * exactly like {@link AIEngine} wraps AIEngineBase. {@link Config} delegates to the base so there is
    * one cache, loaded once, shared by every consumer (and reused by AIEngine.RefreshActions via the
    * BaseEngineRegistry).
    */
   private get Base(): ActionEngineBase {
      return ActionEngineBase.Instance;
   }

   /**
    * Server-side context user for action execution and log stamping. Held HERE (not borrowed from the
    * base) and captured on Config(), mirroring AIEngine which keeps its own _contextUser distinct from
    * the shared base cache. Falls back to the base's context user when not explicitly set.
    */
   private _contextUser?: UserInfo;

   /**
    * Ensures the single ActionEngineBase metadata cache is loaded. Delegates entirely to the base —
    * ActionEngineServer holds no metadata of its own.
    */
   public async Config(forceRefresh: boolean = false, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
      if (contextUser) {
         this._contextUser = contextUser;
      }
      await this.Base.Config(forceRefresh, contextUser, provider);
   }

   /** True once the underlying ActionEngineBase cache has loaded. */
   public get Loaded(): boolean { return this.Base.Loaded; }

   public get ContextUser(): UserInfo { return (this._contextUser ?? this.Base.ContextUser) as UserInfo; }
   public set ContextUser(value: UserInfo) { this._contextUser = value; }

   // ── Proxied cached collections (single source of truth: ActionEngineBase.Instance) ──
   public get Actions(): MJActionEntityExtended[] { return this.Base.Actions; }
   public get ActionCategories(): MJActionCategoryEntity[] { return this.Base.ActionCategories; }
   public get ActionParams(): MJActionParamEntity[] { return this.Base.ActionParams; }
   public get ActionFilters(): MJActionFilterEntity[] { return this.Base.ActionFilters; }
   public get ActionResultCodes(): MJActionResultCodeEntity[] { return this.Base.ActionResultCodes; }
   public get ActionLibraries(): MJActionLibraryEntity[] { return this.Base.ActionLibraries; }
   public get CoreActions(): MJActionEntityExtended[] { return this.Base.CoreActions; }
   public get NonCoreActions(): MJActionEntityExtended[] { return this.Base.NonCoreActions; }
   public get CoreActionsRootCategoryID(): string { return this.Base.CoreActionsRootCategoryID; }

   // ── Proxied lookups ──
   public IsChildCategoryOf(categoryId: string, parentCategoryId: string): boolean { return this.Base.IsChildCategoryOf(categoryId, parentCategoryId); }
   public IsCoreAction(action: MJActionEntityExtended): boolean { return this.Base.IsCoreAction(action); }
   public IsCoreActionCategory(categoryId: string): boolean { return this.Base.IsCoreActionCategory(categoryId); }
   public GetActionByName(actionName: string): MJActionEntityExtended | undefined { return this.Base.GetActionByName(actionName); }

   /**
    * Fire-and-forget queue for action-execution-log writes. Action-execution logging is observability —
    * the action's result is returned regardless of whether the log row persists — so both the INSERT
    * ('started') and the UPDATE ('ended') run off the DB round-trip critical path. `result.LogEntry.ID`
    * is valid immediately because `NewRecord()` client-generates the uniqueidentifier PK.
    *
    * The queue keys by the log entity instance, so {@link EndActionLog}'s 'ended' UPDATE chains after that
    * row's 'started' INSERT and applies its mutation *inside* the post-INSERT task — the UPDATE can never
    * race the INSERT's reload (the "stuck at EndedAt=NULL / shows Running forever" bug is structurally
    * impossible). The queue is self-bounding (in-flight tasks only), so it needs no flush on this
    * long-lived singleton.
    */
   private readonly _logQueue = new BaseEntitySaveQueue();

   /**
    * Engine-default wall-clock timeout applied to any action whose
    * `MaxExecutionTimeMS` is NULL. Intentionally generous (2 hours) because
    * some integration actions do legitimately long sync work; per-action
    * overrides should be used to tighten this for anything agent-facing.
    * Sub-classes can override to globally change the default.
    */
   protected get DefaultActionTimeoutMS(): number {
      return 2 * 60 * 60 * 1000;
   }

   public async RunAction(params: RunActionParams): Promise<ActionResult> {
      const validInputs: boolean = await this.ValidateInputs(params);
      if(!validInputs){
         const result: ActionResult = {
            Success: false,
            Message: "Input validation failed. This is a failure condition.",
            LogEntry: null,
            Params: params.Params,
            RunParams: params
         };

         if(!params.SkipActionLog){
            result.LogEntry = await this.StartAndEndActionLog(params, result);
         }

         return result;
      }

      const filtersPassed: boolean = await this.RunFilters(params);
      if(!filtersPassed){
         // filters indicated we should NOT run this action
         const result: ActionResult = {
            Success: true,
            Message: "Filters were run and the result indicated this action should not be executed. This is a Success condition as filters returning false is not considered an error.",
            LogEntry: null, // initially null
            Params: params.Params,
            RunParams: params
         };

         if(!params.SkipActionLog){
            result.LogEntry = await this.StartAndEndActionLog(params, result);
         }
      }

      return await this.RunActionWithTimeout(params);
   }

   /**
    * Wraps `InternalRunAction()` with a universal wall-clock timeout
    * (`Action.MaxExecutionTimeMS`, falling back to `DefaultActionTimeoutMS`)
    * and an `AbortSignal` passed to the action via `params.AbortSignal`.
    *
    * Enforcement is cooperative: when the timeout fires we set an abort on
    * the signal so in-flight `fetch`/`setTimeout`/custom polling logic can
    * short-circuit, and we race the action against a rejection that surfaces
    * a `TIMEOUT` result. If the caller already supplied an `AbortSignal`
    * (e.g. when being run from a Runtime-action bridge that has its own
    * abort), we chain to it so either source can trigger cancellation.
    */
   protected async RunActionWithTimeout(params: RunActionParams): Promise<ActionResult> {
      const actionTimeoutMS = params.Action.MaxExecutionTimeMS ?? this.DefaultActionTimeoutMS;

      // Chain with any upstream AbortSignal (e.g. Runtime-action bridge).
      const controller = new AbortController();
      const externalSignal = params.AbortSignal;
      const relayExternalAbort = () => {
         if (!controller.signal.aborted) {
            controller.abort(externalSignal?.reason ?? 'upstream abort');
         }
      };
      if (externalSignal) {
         if (externalSignal.aborted) {
            relayExternalAbort();
         } else {
            externalSignal.addEventListener('abort', relayExternalAbort, { once: true });
         }
      }

      // Wall-clock timeout.
      const timeoutId = setTimeout(() => {
         if (!controller.signal.aborted) {
            controller.abort(`Action '${params.Action.Name}' exceeded MaxExecutionTimeMS (${actionTimeoutMS}ms)`);
         }
      }, actionTimeoutMS);

      // Assign the chained signal onto params so BaseAction subclasses can poll it.
      const previousSignal = params.AbortSignal;
      params.AbortSignal = controller.signal;

      try {
         const timeoutPromise = new Promise<ActionResult>((_resolve, reject) => {
            controller.signal.addEventListener(
               'abort',
               () => {
                  reject(new Error(String(controller.signal.reason ?? 'aborted')));
               },
               { once: true }
            );
         });

         try {
            return await Promise.race([this.InternalRunAction(params), timeoutPromise]);
         } catch (err) {
            // Timeout or upstream abort — return a standard TIMEOUT result.
            // Result is left undefined (we don't guarantee a 'TIMEOUT' ActionResultCode
            // exists on every action; the Success flag + Message are the canonical
            // failure signal for timeouts).
            if (controller.signal.aborted) {
               const message =
                  typeof controller.signal.reason === 'string'
                     ? controller.signal.reason
                     : `Action '${params.Action.Name}' was aborted`;
               const timeoutResult: ActionResult = {
                  Success: false,
                  Message: message,
                  LogEntry: null,
                  Params: params.Params,
                  RunParams: params,
                  Result: undefined
               };
               if (!params.SkipActionLog) {
                  timeoutResult.LogEntry = await this.StartAndEndActionLog(params, timeoutResult);
               }
               return timeoutResult;
            }
            // Real runtime error unrelated to abort — rethrow so upstream handling catches it.
            throw err;
         }
      } finally {
         clearTimeout(timeoutId);
         if (externalSignal) {
            externalSignal.removeEventListener('abort', relayExternalAbort);
         }
         // Restore whatever AbortSignal the caller had in place so we don't leak our own.
         params.AbortSignal = previousSignal;
      }
   }
   

   protected GetActionParamsForAction(action: MJActionEntityExtended): ActionParam[] {
      const params: ActionParam[] = action.Params.map((param: MJActionParamEntity) => {
         let value: any = null;
         switch (param.ValueType) {
            case 'Scalar':
               value = param.DefaultValue;
               break;
            case 'Simple Object':
               const jsonValue = SafeJSONParse(param.DefaultValue);
               if (jsonValue){
                  value = jsonValue;
               }
               else{
                  value = param.DefaultValue;
               }
               break;
            case 'BaseEntity Sub-Class':
            case 'Other':
               value = param.DefaultValue;
               break;
            default:
               LogError(`Unknown ValueType ${param.ValueType} for param ${param.Name} in action ${action.Name}`);
               value = param.DefaultValue;
               break;

         }

         return {
            Name: param.Name,
            Value: value,
            Type: param.Type
         }
      });

      return params;
   }

   /**
    * This method handles input validation. Subclasses can override this method to provide custom input validation.
    */
   protected async ValidateInputs(params: RunActionParams): Promise<boolean> {
      return true;
   }

   /**
    * This method runs any filters for the action. Subclasses can override this method to provide custom filter logic.
    */
   protected async RunFilters(params: RunActionParams): Promise<boolean> {
      if (params.Filters) {
         for (let filter of params.Filters) {
            if (!await this.RunSingleFilter(params, filter)) {
               return false;
            }
         }
      }
      return true; // if we get here we either had no filters or passed them all
   }

   /**
    * This method runs a single filter. Subclasses can override this method to provide custom filter logic.
    * 
    * @param filter 
    */
   protected async RunSingleFilter(params: RunActionParams, filter: MJActionFilterEntity): Promise<boolean> {
      return true;
      // temp stub above, replace with code that will run the filter      
   }

   protected async InternalRunAction(params: RunActionParams): Promise<ActionResult> {
      let logEntry: MJActionExecutionLogEntity | undefined;
      if(!params.SkipActionLog){
         logEntry = await this.StartActionLog(params);
      }

      try {
         // Branch by Action.Type. Runtime actions go through the sandboxed
         // RuntimeActionExecutor; Custom / Generated (and legacy rows where
         // Type may be null) flow through the existing ClassFactory path.
         const simpleResult: ActionResultSimple =
            params.Action.Type === 'Runtime'
               ? await this.RunRuntimeAction(params)
               : await this.RunClassBasedAction(params);

         const resultCodeEntity: MJActionResultCodeEntity | undefined = this.ActionResultCodes.find(r => UUIDsEqual(r.ActionID, params.Action.ID) &&
                                                               r.ResultCode.trim().toLowerCase() === simpleResult.ResultCode.trim().toLowerCase());
         const result: ActionResult = {
            RunParams: params,
            Success: simpleResult.Success,
            Message: simpleResult.Message,
            AIDirectives: simpleResult.AIDirectives,
            LogEntry: logEntry,
            Params: simpleResult.Params || params.Params,
            Result: resultCodeEntity
         };

         if(logEntry){
            await this.EndActionLog(logEntry, params, result);
         }

         return result;
      }
      catch (e) {
         // if we get here, something went wrong in the action code.
         // NOTE: LogError's 2nd positional arg is `logToFileName`, NOT the error —
         // passing the error there silently swallows it. Use LogErrorEx so the
         // real message + stack trace actually print to the console.
         LogErrorEx({ message: `Error running action ${params.Action.Name}`, error: e instanceof Error ? e : new Error(String(e)) });
         const result: ActionResult = {
            RunParams: params,
            Success: false,
            Message: `Error running action ${params.Action.Name}: ${e instanceof Error ? e.message : String(e)}`,
            LogEntry: logEntry,
            Params: params.Params,
            Result: undefined
         };

         if(logEntry){
            await this.EndActionLog(logEntry, params, result);
         }

         return result;
      }
   }

   /**
    * Resolves and runs a Custom / Generated action via the ClassFactory.
    * This is the pre-existing path — factored out of `InternalRunAction` so
    * the Type dispatch is readable.
    */
   protected async RunClassBasedAction(params: RunActionParams): Promise<ActionResultSimple> {
      const action = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(
         BaseAction,
         params.Action.DriverClass || params.Action.Name,
         params.ContextUser
      );
      if (!action || action.constructor === BaseAction) {
         throw new Error(`Could not find a class for action ${params.Action.Name}.`);
      }
      return await action.Run(params);
   }

   /**
    * Runs an `Action.Type='Runtime'` action by delegating to the sandboxed
    * RuntimeActionExecutor. Approval / Status / Code-presence checks are
    * enforced inside the executor; here we parse the RuntimeActionConfiguration,
    * build the permissioned bridge-handler map, and hand it off.
    *
    * The bridge handlers run in-process on the host (not inside the sandbox)
    * so they have full access to Metadata, RunView, ActionEngine, etc.
    * Permission enforcement against `RuntimeActionConfiguration.permissions`
    * happens inside each handler — see `RuntimeActionBridge.ts`.
    *
    * If the configuration is missing or malformed, we still let the action
    * run in pure-compute mode (no bridge). The action's Code can then only
    * use `input` + `libs`; any attempt to call `utilities.*` at runtime
    * rejects with a "handler not registered" error from the worker pool.
    */
   protected async RunRuntimeAction(params: RunActionParams): Promise<ActionResultSimple> {
      // Extract + validate the RuntimeActionConfiguration JSON blob. Uses
      // the strongly-typed accessor from @memberjunction/core-entities
      // (emitted by the JSONType codegen) rather than parsing the raw string.
      const actionEntity = params.Action as unknown as {
         RuntimeActionConfigurationObject?: unknown;
      };
      const rawConfig = actionEntity.RuntimeActionConfigurationObject;

      let bridgeHandlers: BridgeHandlerMap | undefined;
      let preamble = '';
      let maxBridgeCalls: number | undefined;

      if (rawConfig) {
         const parsed = RuntimeActionConfigurationSchema.safeParse(rawConfig);
         if (!parsed.success) {
            return {
               Success: false,
               ResultCode: 'INVALID_CONFIG',
               Message:
                  `Runtime action '${params.Action.Name}' has a malformed ` +
                  `RuntimeActionConfiguration: ${parsed.error.message}`,
               Params: params.Params
            };
         }
         // Cast to the JSONType-emitted interface: the Zod-inferred type
         // has optional fields due to how `z.object()` composes with this
         // repo's non-strict TS config; the runtime validation above has
         // already proven the shape is valid, so the narrowing cast is safe.
         const config = parsed.data as unknown as MJActionEntity_IRuntimeActionConfiguration;

         // Resolve the concrete bridge builder via MJ's ClassFactory. The
         // implementation lives in `@memberjunction/action-runtime-host`
         // (top of the stack — can statically import AIEngine, AgentRunner,
         // ActionEngineServer, etc. without creating a cycle). If nothing
         // is registered (the host package wasn't imported), we fall through
         // to pure-compute mode: the user's Runtime action still runs, it
         // just can't call any `utilities.*` bridge namespaces.
         const builder = MJGlobal.Instance.ClassFactory.CreateInstance<RuntimeActionBridgeBuilder>(
            RuntimeActionBridgeBuilder
         );
         if (builder) {
            bridgeHandlers = builder.BuildHandlers({
               action: params.Action,
               config,
               contextUser: params.ContextUser,
               abortSignal: params.AbortSignal,
               provider: params.Provider
            });
            preamble = builder.GetPreamble();
         }
         maxBridgeCalls = config.limits?.maxBridgeCalls;
      }

      // If we built a preamble, inject it BEFORE the user's code so
      // `globalThis.utilities` is available from the first line. The
      // executor wraps everything in an async IIFE — the preamble runs
      // inside that same IIFE.
      const codeToRun = preamble
         ? `${preamble}\n${params.Action.Code ?? ''}`
         : params.Action.Code ?? '';

      // We mutate a defensive copy of the action entity so the executor sees
      // the prepended preamble without modifying the live MJActionEntity
      // instance (which the rest of the ActionEngine may still reference).
      const actionForExecution = Object.create(
         Object.getPrototypeOf(params.Action),
         Object.getOwnPropertyDescriptors(params.Action)
      ) as typeof params.Action;
      // The executor checks `action.Code`; override just that getter.
      Object.defineProperty(actionForExecution, 'Code', {
         value: codeToRun,
         writable: false,
         enumerable: true,
         configurable: true
      });

      const execResult = await RuntimeActionExecutor.Instance.execute({
         action: actionForExecution,
         params: params.Params ?? [],
         contextUser: params.ContextUser,
         abortSignal: params.AbortSignal,
         bridgeHandlers,
         maxBridgeCalls
      });

      return {
         Success: execResult.success,
         ResultCode: execResult.resultCode,
         Message: execResult.message,
         Params: execResult.params
      };
   }

   protected async StartActionLog(params: RunActionParams, saveRecord: boolean = true): Promise<MJActionExecutionLogEntity> {
      // this is where the log entry for the action run will be created
      const md = params.Provider ?? new Metadata();
      const logEntity = await md.GetEntityObject<MJActionExecutionLogEntity>('MJ: Action Execution Logs', this.ContextUser);
      logEntity.NewRecord();
      logEntity.ActionID = params.Action.ID;
      logEntity.StartedAt = new Date();
      logEntity.UserID = this.ContextUser.ID;
      // we will save this again in the EndActionLog, this is the initial state, and the action could add/modify the params
      logEntity.Params = JSON.stringify(params.Params);

      if (saveRecord){
         // Fire-and-forget the 'started' INSERT (unless the caller opts out) — the action runs
         // immediately, off the DB round-trip critical path. The ID is already assigned by NewRecord(),
         // so the returned LogEntry.ID is valid right away. EndActionLog's 'ended' UPDATE chains after
         // this INSERT (same entity key), so it can never race it.
         this._logQueue.Insert(logEntity);
      }

      return logEntity;
   }

   protected async EndActionLog(logEntity: MJActionExecutionLogEntity, params: RunActionParams, result: ActionResult): Promise<void> {
      // Capture the 'ended' state NOW (accurate EndedAt + final merged params); the queued UPDATE applies
      // + persists it only AFTER the 'started' INSERT commits (see _logQueue). Caller awaits neither save.
      const endedAt = new Date();
      // Persist the final merged param set (inputs + outputs) — Runtime actions return a fresh array
      // from the sandbox executor that lives on `result.Params`, so logging `params.Params` would lose
      // every new output key. Custom/Generated actions mutate `params.Params` in place, and
      // `result.Params` falls back to that same reference, so they remain equivalent.
      const finalParams = JSON.stringify(result.Params ?? params.Params);
      const resultCode = result.Result?.ResultCode;
      const message = result.Message;
      // Fire-and-forget — the action's caller never blocks on the 'ended' UPDATE. The mutation runs
      // INSIDE the post-INSERT task (after the 'started' INSERT lands), so it can never be reverted by
      // the INSERT's reload. The queue is self-bounding, so no flush is needed on this long-lived singleton.
      this._logQueue.Update(logEntity, () => {
         logEntity.EndedAt = endedAt;
         logEntity.Params = finalParams;
         logEntity.ResultCode = resultCode;
         logEntity.Message = message;
      });
   }

   protected async StartAndEndActionLog(params: RunActionParams, result: ActionResult): Promise<MJActionExecutionLogEntity> {
      // No separate INSERT — the single 'ended' UPDATE (force-persist on a never-inserted NewRecord) inserts.
      const logEntity: MJActionExecutionLogEntity = await this.StartActionLog(params, false);
      await this.EndActionLog(logEntity, params, result);
      return logEntity;
   }
}

