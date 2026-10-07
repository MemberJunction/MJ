import { BaseEngine, IMetadataProvider, UserInfo, RunView, BaseEnginePropertyConfig } from "@memberjunction/core";
import { EntityChangeContext } from './EntityChangeContext';
import { MJActionCategoryEntity, MJActionEntity, MJActionExecutionLogEntity, MJActionFilterEntity, MJActionLibraryEntity, MJActionParamEntity, MJActionResultCodeEntity, MJEntityActionEntity, MJEntityActionParamEntity } from "@memberjunction/core-entities";
import { MJActionEntityExtended } from "./MJActionEntityExtended";
import type { ActionRunAudience } from "./ActionAudience";


export class ActionLibrary {
   LibraryName: string;
   ItemsUsed: string[];
}

/**
 * Class that is used for passing around generated code includes properties such as the code itself and a description of what the code does.
 */
export class GeneratedCode {
    /**
     * Indicates if the code generation was successful or not.  
     */
    Success: boolean;
    /**
     * The generated executable code
     */
    Code: string;
    /**
     * List of libraries and library items used in the generated code
     */
    LibrariesUsed: ActionLibrary[];
    /**
     * A description of the code used for documentation purposes
     */
    Comments: string;
    /**
     * ErrorMessage if the code generation failed
     */
    ErrorMessage?: string;
}

/**
 * Represents a directive from an action to an AI agent. Unlike `Message` (which is informational
 * and meant for display or logging), directives are structured instructions that the agent
 * framework surfaces as explicit guidance the AI must consider.
 *
 * Actions return directives when they need to steer agent behavior — for example, telling the
 * agent which action to call next, constraining it from taking a particular path, or providing
 * critical context that should influence its decision.
 *
 * @example
 * ```typescript
 * return {
 *     Success: true,
 *     ResultCode: 'SUCCESS',
 *     Message: 'Found 10 matching queries.',
 *     AIDirectives: [
 *         { message: 'Call "Run Stored Query" with QueryID "abc-123"', type: 'instruction', priority: 'high' },
 *         { message: 'Do NOT write fresh SQL — use the stored query above', type: 'constraint', priority: 'critical' },
 *         { message: 'The stored query provides columns: ID, Name, FieldCount', type: 'context', priority: 'medium' }
 *     ]
 * };
 * ```
 */
export interface AIDirective {
    /** The directive message text to surface to the AI agent */
    Message: string;
    /**
     * The kind of directive:
     * - `instruction`: Direct command to perform a specific action or follow a specific path
     * - `constraint`: Restriction on what the AI must NOT do
     * - `context`: Important background information that should influence the AI's decisions
     * - `suggestion`: Optional recommendation the AI may choose to follow or ignore
     */
    Type: 'instruction' | 'constraint' | 'context' | 'suggestion';
    /**
     * How strongly the AI should follow this directive:
     * - `low`: Nice to follow, can be ignored if the AI has a better approach
     * - `medium`: Should follow unless there's a clear reason not to
     * - `high`: Must follow in most cases
     * - `critical`: Must always follow, no exceptions
     */
    Priority: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Class that has the result of the individual action execution and used by the engine or other caller
 */

export class ActionResultSimple {
   /**
    * Indicates if the action was successful or not.
    */
   public Success: boolean;

   /**
    * A string that indicates the strucutred output/results of the action
    */
   public ResultCode: string;

   /**
    * All parameters including inputs and outputs are provided here for convenience
    */
   public Params?: ActionParam[];

   /**
    * Optional, additional information about the result of the action
    */
   public Message?: string;

   /**
    * Optional array of structured directives for the AI agent.
    * Unlike Message (which is informational), directives are surfaced as
    * explicit guidance the AI must consider. Each directive has a type
    * (instruction, constraint, context, suggestion) and priority level.
    */
   public AIDirectives?: AIDirective[];
}

/**
 * Class that has the result of a complete action execution, returned by the Run method of the ActionEngine.
 */
export class ActionResult {
   /**
    * Contains the parameters that were used to run the action as a convenience.
    */
   public RunParams: RunActionParams;
      
   /**
    * Indicates if the action was successful or not.
    */
   public Success: boolean;

   /**
    * A code that indicates the outcome of the action. Will be one of the possible ResultCodes enumerated in the MJActionResultCodeEntity
    */
   public Result?: MJActionResultCodeEntity;

   /**
    * The result code as text: the action's own `ActionResultSimple.ResultCode`, or the code of a refusal the
    * engine made without running the action ({@link AUDIENCE_UNSUPPORTED_RESULT_CODE}). Set whether or not it
    * matches one of the action's metadata result codes — {@link Result} is that match, `undefined` when there is
    * none. Absent when the run ended without a code (a timeout, an exception, a validation or filter refusal).
    */
   public ResultCode?: string;

   /**
    * Whenever an action is executed a log entry is created. This log entry is stored in the database and can be used to track the execution of the action. This property contains the log entry object for the action that was run.
    */
   public LogEntry?: MJActionExecutionLogEntity;

   /**
    * Optional, a message an action can include that describes the outcome of the action. This is typically used to display a message to the user.
    */
   public Message?: string;

   /**
    * All parameters including inputs and outputs are provided here for convenience
    */
   public Params?: ActionParam[];

   /**
    * Optional array of structured directives for the AI agent.
    * Propagated from ActionResultSimple.AIDirectives returned by the action implementation.
    */
   public AIDirectives?: AIDirective[];
}

/**
 * Runtime parameter class that is used to pass key/value pairs in arrays to/from the action engine.  
 */
export class ActionParam {
   /**
    * The name of the parameter
    */
   public Name: string;
   /**
    * The value of the parameter. This can be any type of object.
    */
   public Value: any;
   /**
    * The type of the Action parameter. Input parameters are used to pass data into the action while output parameters are used to return data from the action.
    */
   public Type: 'Input' | 'Output' | 'Both';
}

/**
 * Where an action run came from, when it was dispatched by an Entity Action binding rather than
 * invoked directly. Carried on {@link RunActionParams.Provenance} and stamped onto
 * `ActionExecutionLog` so a failed workflow is diagnosable: *which binding fired this, on which
 * record, from which event.*
 *
 * Also supplies the two things the engine cannot work out for itself once the run is under way —
 * the binding's `LoggingMode`, and the `EntityActionParam` rows the redaction rules need in order
 * to see a parameter's `ValueType` and per-binding `LogValue` override.
 *
 * Absent for direct invocations (a resolver, a script, an agent step, a scheduled action), which
 * is exactly what the log's NULL provenance columns mean.
 */
export class ActionInvocationProvenance {
   /** The Entity Action binding that caused this run. */
   public EntityActionID?: string;

   /**
    * Which lifecycle event fired the binding — `AfterUpdate`, `Validate`, `List` and so on.
    * Recorded separately from {@link EntityActionID} because one binding may be attached to
    * several invocation types, and telling a `Validate` refusal apart from an `AfterUpdate` side
    * effect is the first question anyone asks of the log.
    */
   public EntityActionInvocationTypeID?: string;

   /**
    * The entity of the record the run operated on. Denormalized rather than derived through
    * {@link EntityActionID} so it survives the binding being deleted or retargeted, and so the log
    * can be queried by record with no join. Kept generic — every invoker has a subject, not only
    * Entity Actions.
    */
   public TargetEntityID?: string;

   /**
    * The primary key of the record the run operated on, as text. For multi-record invocation types
    * (`List`, `View`) one log row is written per record, so this is always a single record.
    */
   public TargetRecordID?: string;

   /** The binding's `LoggingMode` — `All` / `FailuresOnly` / `None`. Defaults to `All` when absent. */
   public LoggingMode?: MJEntityActionEntity['LoggingMode'];

   /**
    * The binding's parameter rows. Required by the redaction rules: `ValueType` drives the hard
    * whole-record rule, and `LogValue` supplies the per-binding override.
    */
   public EntityActionParams?: MJEntityActionParamEntity[];
}

/**
 * Class that holds the parameters for an action to be run. This is passed to the Run method of an action.
 *
 * @template TContext - Type of the context object passed to the action execution.
 *                      This allows for type-safe context propagation from agents to actions.
 *                      Defaults to any for backward compatibility.
 * 
 * @example
 * ```typescript
 * // Define a typed context
 * interface MyActionContext {
 *   apiEndpoint: string;
 *   apiKey: string;
 *   environment: 'dev' | 'staging' | 'prod';
 * }
 * 
 * // Use with type safety
 * const params = new RunActionParams<MyActionContext>();
 * params.Action = myAction;
 * params.ContextUser = currentUser;
 * params.Context = {
 *   apiEndpoint: 'https://api.example.com',
 *   apiKey: process.env.API_KEY,
 *   environment: 'prod'
 * };
 * ```
 */
export class RunActionParams<TContext = any> {
   /**
    * The action entity to be run.
    */
   public Action: MJActionEntity;

   /**
    * The user context for the action.
    */
   public ContextUser: UserInfo;
   /**
    * Optional, if true, an MJActionExecutionLogEntity will not be created for this action run.
    */
   public SkipActionLog?: boolean;
   /**
    * Optional, a list of filters that should be run before the action is executed.
    */
   public Filters: MJActionFilterEntity[];
   /**
    * Optional, the input and output parameters as defined in the metadata for the action.
    */
   public Params: ActionParam[];

   /**
    * What changed about the record, when this run was dispatched by an entity action.
    *
    * Present only on the entity-action path — a directly invoked action has no record transition to
    * describe. This is what makes a *transition* filter possible ("when Status becomes Approved"),
    * as opposed to a state filter over current values, which was all a filter could see before.
    */
   public EntityChange?: EntityChangeContext;

   /**
    * When set, replaces *executing* the action — after validation and filters have passed.
    *
    * The seam durable dispatch hangs on. Submitting the work before this point would hand it over
    * without the scope check and without the binding's filters ever running, so a scoped durable
    * trigger would fire for every record and a filtered one on every save. Deferring *here* means
    * the two paths share one gate: whatever decides an inline run should happen decides a durable
    * one should be submitted.
    *
    * **Returning `null` declines the deferral** and the action executes normally. That is what makes
    * the fallback free: a handoff that could not be completed becomes an ordinary run rather than
    * requiring the deferral to reimplement execution.
    */
   public DeferExecution?: (params: RunActionParams) => Promise<ActionResultSimple | null>;

   /**
    * Optional context object that provides runtime-specific information to the action.
    * This context is separate from the action parameters and is not stored in the database.
    *
    * Common use cases include:
    * - Environment-specific configuration (API endpoints, service URLs)
    * - Runtime credentials or authentication tokens
    * - User preferences or session information
    * - Feature flags or toggles
    * - Request-specific correlation IDs
    *
    * The context flows from agents to actions, maintaining consistency throughout
    * the execution hierarchy. Actions can use this context to adapt their behavior
    * based on runtime conditions without modifying their core parameter structure.
    *
    * Note: Avoid including sensitive data like passwords unless absolutely necessary,
    * as context may be passed through multiple execution layers.
    *
    * Well-known keys stamped by BaseAgent when an action runs inside an agent run:
    * - `AgentID` — the calling agent
    * - `ActiveSkillIDs` — the skills active in the run (always present in a run; `[]` = none)
    * - `__resolvedStorageAccountId` — the file storage account the run resolved
    */
   public Context?: TContext;

   /**
    * The run's {@link RuntimeAPIKeyResolver}, set by BaseAgent when — and only when — the agent run
    * carries runtime API keys. Per dispatch, like {@link DeferExecution}: it is bound to THIS action,
    * so the agent's policy and audit line name the right action even when actions run in parallel,
    * and it is not on {@link Context} — which is the agent's own object, shared by every action in
    * the run and copied into sub-agent runs. An action that calls an AI vendor directly asks it for
    * ONE driver class and gets that key, or the platform key when the run has none for that class
    * (the same fallback prompts get). The key list itself is never handed to an action: it cannot
    * enumerate the run's credentials, only request the one it names, and the agent may refuse.
    * Absent outside an agent run, when the action uses `GetAIAPIKey(driverClass)` as it always did.
    */
   public RuntimeAPIKeyResolver?: RuntimeAPIKeyResolver;

   /**
    * The agent run's credential scope, set by BaseAgent from `ExecuteAgentParams.CredentialScope`.
    * Under `'RuntimeOnly'` an action that calls an AI vendor itself must take the
    * {@link RuntimeAPIKeyResolver}'s answer as final — `undefined`, or no resolver at all, means the
    * run has no key for that vendor, NOT "use `GetAIAPIKey`". Absent means `'Any'`.
    *
    * An action that runs its own prompt or agent must forward this onto that prompt's or agent's
    * params (`CredentialScope`). It is not handed the run's keys, so under `'RuntimeOnly'` that
    * prompt finds no usable model and fails — which is the point: otherwise it would resolve the
    * platform's keys inside a run restricted to the caller's.
    */
   public CredentialScope?: RuntimeCredentialScope;

   /**
    * Everyone besides {@link ContextUser} who will see what this action returns — set by BaseAgent, per
    * dispatch, from the agent run's audience (`ExecuteAgentParams.Audience`) when it adds a reader. Not on
    * {@link Context}, for the reason {@link RuntimeAPIKeyResolver} is not: the context is the agent's own
    * object, shared by every action in the run. The model cannot set it.
    *
    * **The engine gates on it.** When it adds a reader beyond the caller, `ActionEngineServer.RunAction`
    * refuses — result code {@link AUDIENCE_UNSUPPORTED_RESULT_CODE}, without running the action or writing an
    * execution log row — any action whose class does not declare `SupportsAudience`, and every runtime-defined
    * or deferred action. For an action it lets through, it first normalizes this to the distinct readers
    * beyond the caller ({@link ActionAudienceReaders}), and clears it when the audience adds nobody, so an
    * action may treat "present" as "there is a room" and `Readers` as exactly the people to check.
    *
    * An action that declares support must return only what every reader may see: pass the audience to the
    * search engine (`SearchParams.Audience`), check each reader's entitlement to anything it scopes by, and
    * leave out counts or other aggregates computed before that filtering.
    */
   public Audience?: ActionRunAudience;

   /**
    * The agent run's scope — its tenant (`PrimaryScopeRecordID`) and secondary dimensions — set by BaseAgent on
    * every dispatch inside an agent run, from the run's validated scope (`ExecuteAgentParams.PrimaryScope*` /
    * `SecondaryScopes`, as written to the `MJ: AI Agent Runs` row). Fields are `null` when the run is unscoped;
    * the object itself is ABSENT outside an agent run. Per dispatch and not on {@link Context}, for the reason
    * {@link Audience} is not: the context is the agent's own object. The model cannot set it.
    *
    * An action that scopes by tenant must treat it as authoritative over its own parameters, which inside a Loop
    * agent are model-written: default a missing tenant to the run's, and refuse one the run does not carry.
    */
   public RunScope?: ActionRunScope;

   /**
    * Optional AbortSignal that is aborted when the action exceeds its wall-clock
    * time budget (set via `Action.MaxExecutionTimeMS` or the engine default). Set
    * automatically by `ActionEngine.RunAction()` — callers should not populate it
    * directly. Long-running action implementations should poll this signal
    * (e.g. between batches, between retries, inside tight loops) and return
    * early with `ResultCode = 'TIMEOUT'` when it fires, so the enforcement is
    * cooperative rather than ending the Node process.
    *
    * The engine also records the timeout on `AbortSignal.reason` as a string
    * describing which side (action vs engine default) supplied the budget,
    * which makes timeout-origin debugging straightforward.
    */
   public AbortSignal?: AbortSignal;

   /**
    * Optional metadata provider to use for entity lookups and data access during this action run.
    *
    * **Why this matters for transaction isolation in multi-provider scenarios:**
    * MemberJunction supports running multiple providers in the same process (e.g., a transaction-scoped
    * provider for a unit-of-work, alongside the default global provider). When an action runs inside a
    * transaction, it MUST use the same provider that owns the transaction so that all reads/writes
    * happen on the same connection and participate in the same transaction.
    *
    * If `Provider` is not supplied, action implementations fall back to the default global provider via
    * `new Metadata()`. This preserves backward compatibility for single-provider deployments and for
    * existing callers that don't yet thread a provider through.
    *
    * Action implementations should use the pattern:
    * ```typescript
    * const md = params.Provider ?? new Metadata();
    * ```
    * to honor the caller's provider when supplied while remaining backward compatible.
    */
   public Provider?: IMetadataProvider;

   /**
    * Optional. Set by the Entity Action invocation path to record which binding, which event and
    * which record produced this run — see {@link ActionInvocationProvenance}. Left undefined for
    * direct invocations, which is what the execution log's NULL provenance columns mean.
    */
   public Provenance?: ActionInvocationProvenance;
};
 

/**
 * Base class for Action metadata. 
 */
export class ActionEngineBase extends BaseEngine<ActionEngineBase> {
   private __coreRootCategoryID = '15E03732-607E-4125-86F4-8C846EE88749'; // UUID within MJ forever for the ROOT category of System Actions

   /**
    * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
    */
   public static get Instance(): ActionEngineBase {
      return super.getInstance<ActionEngineBase>("ActionEngineBase");
   }

    private _Actions: MJActionEntityExtended[];  // case-violation-ok-legacy-back-compat: the name is also a string literal that resolves this member at runtime, so renaming it breaks the lookup
    private _ActionCategories: MJActionCategoryEntity[];  // case-violation-ok-legacy-back-compat: the name is also a string literal that resolves this member at runtime, so renaming it breaks the lookup
    private _Filters: MJActionFilterEntity[];  // case-violation-ok-legacy-back-compat: the name is also a string literal that resolves this member at runtime, so renaming it breaks the lookup
    private _Params: MJActionParamEntity[];  // case-violation-ok-legacy-back-compat: the name is also a string literal that resolves this member at runtime, so renaming it breaks the lookup
    private _ActionResultCodes: MJActionResultCodeEntity[];  // case-violation-ok-legacy-back-compat: the name is also a string literal that resolves this member at runtime, so renaming it breaks the lookup
    private _ActionLibraries: MJActionLibraryEntity[] = [];  // case-violation-ok-legacy-back-compat: the name is also a string literal that resolves this member at runtime, so renaming it breaks the lookup

   /**
    * This method is called to configure the ActionEngine. It loads the metadata for the actions, filters, and result codes and caches them in the GlobalObjectStore. You must call this method before running any actions.
    * If this method was previously run on the instance of the ActionEngine, it will return immediately without re-loading the metadata. If you want to force a reload of the metadata, you can pass true for the forceReload parameter.
    * @param forceRefresh If true, the metadata will be loaded from the database even if it was previously loaded.
    * @param contextUser If you are running the action on the server side you must pass this in, but it is not required in an environment where a user is authenticated directly, e.g. a browser or other client. 
    */
   public async Config(forceRefresh: boolean = false, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
      const config: Array<Partial<BaseEnginePropertyConfig>> = [
         {
               EntityName: 'MJ: Actions',
               PropertyName: '_Actions',
               CacheLocal: true
         },
         {
               EntityName: 'MJ: Action Categories',
               PropertyName: '_ActionCategories',
               CacheLocal: true
         },
         {
               EntityName: 'MJ: Action Filters',
               PropertyName: '_Filters',
               CacheLocal: true
         },
         {
               EntityName: 'MJ: Action Result Codes',
               PropertyName: '_ActionResultCodes',
               CacheLocal: true
         },
         {
               EntityName: 'MJ: Action Params',
               PropertyName: '_Params',
               CacheLocal: true
         },
         {
               EntityName: 'MJ: Action Libraries',
               PropertyName: '_ActionLibraries',
               CacheLocal: true
         }];

      await this.Load(config, provider, forceRefresh, contextUser);
   }

   /**
    * Override to ensure all action metadata is loaded without MaxRows limits.
    * Action Params can have many records (1000+), so we need to ignore the entity's UserViewMaxRows setting.
    */
   protected override async LoadMultipleEntityConfigs(configs: any[], contextUser: any): Promise<void> {
      if (configs && configs.length > 0) {
         const p = this.RunViewProviderToUse;
         const rv = new RunView(p);
         const viewConfigs = configs.map(c => {
            return {
               EntityName: c.EntityName,
               ResultType: 'entity_object' as const,
               ExtraFilter: c.Filter,
               OrderBy: c.OrderBy,
               IgnoreMaxRows: true  // CRITICAL: Ignore UserViewMaxRows to load all records
            };
         });
         const results = await rv.RunViews(viewConfigs, contextUser);
         // now loop through the results and process them
         for (let i = 0; i < configs.length; i++) {
            this.HandleSingleViewResult(configs[i], results[i]);
         }
      }
   }

    public get Actions(): MJActionEntityExtended[] {
      return this._Actions;
    }
    public get ActionCategories(): MJActionCategoryEntity[] {
      return this._ActionCategories;
    }
    public get ActionParams(): MJActionParamEntity[] {
      return this._Params;
    }
    public get ActionFilters(): MJActionFilterEntity[] {
      return this._Filters;
    }
    public get ActionResultCodes(): MJActionResultCodeEntity[] {
      return this._ActionResultCodes;
    }
    public get ActionLibraries(): MJActionLibraryEntity[] {
      return this._ActionLibraries;
    }

    /**
     * Returns a list of all core actions.
     */
    public get CoreActions(): MJActionEntityExtended[] {
      return this._Actions.filter((a) => this.IsCoreAction(a));
    }
    /**
     * Returns a list of all non-core actions.
     */
    public get NonCoreActions(): MJActionEntityExtended[] {
      return this._Actions.filter((a) => !this.IsCoreAction(a));
    }

   /**
    * Returns the root category ID for core actions.
    */
   public get CoreActionsRootCategoryID(): string {
      return this.__coreRootCategoryID;
   }

   /**
    * Utility method that determines if a given Action Category ID is a child of the specified parent category ID.
    * @param categoryId - The ID of the category to check.
    * @param parentCategoryId - The ID of the parent category to check against.
    * @returns True if the categoryId is a child of the parentCategoryId, false otherwise.
    */
   public IsChildCategoryOf(categoryId: string, parentCategoryId: string): boolean {
      if (!categoryId || !parentCategoryId) {
         return false;
      }
      if (categoryId.trim().toLowerCase() === parentCategoryId.trim().toLowerCase()) {
         return true;
      }
      const category = this._ActionCategories.find(c => c.ID.trim().toLowerCase() === categoryId.trim().toLowerCase());
      if (!category) {
         return false;
      }
      // Check if the parent ID matches the parentCategoryId or if it is a child of the parentCategoryId
      if (category.ParentID?.trim().toLowerCase() === parentCategoryId.trim().toLowerCase()) {
         return true;
      }
      // If the parent ID is not the parentCategoryId, recursively check the parent category
      return this.IsChildCategoryOf(category.ParentID, parentCategoryId);
   }

   /**
    * Checks if the specified action is a core action by checking if its category is a child of the core actions root category.
    * @param action - The action entity to check.
    * @returns True if the action is a core action, false otherwise.
    */
   public IsCoreAction(action: MJActionEntityExtended): boolean {
      if (!action) {
         return false;
      }
      return this.IsChildCategoryOf(action.CategoryID, this.CoreActionsRootCategoryID);
   }

   /**
    * Checks if the specified category ID is a core action category at any level, using recursion to check the entire hierarchy.
    * @param categoryId 
    * @returns 
    */
   public IsCoreActionCategory(categoryId: string): boolean {
      if (!categoryId) {
         return false;
      }
      return this.IsChildCategoryOf(categoryId, this.CoreActionsRootCategoryID);
   }

   /**
    * Returns an action based on its name
    * @param actionName 
    * @returns 
    */
   public GetActionByName(actionName: string): MJActionEntityExtended | undefined {
      if (!actionName || actionName.trim().length === 0) {
         throw new Error("Action name cannot be null or empty.");
      }
      return this.Actions.find(a => a.Name.trim().toLowerCase() === actionName.trim().toLowerCase());
   }

   /**
    * This method handles input validation. Subclasses can override this method to provide custom input validation.
    * 
    * @template TContext - Type of the context object in RunActionParams
    */
   protected async ValidateInputs<TContext = any>(params: RunActionParams<TContext>): Promise<boolean> {
      return true;
   }
}

/**
 * Resolves the API key an action should use for ONE AI driver class, inside an agent run.
 *
 * BaseAgent sets one on {@link RunActionParams.RuntimeAPIKeyResolver} when — and only when — the run
 * carries runtime API keys. It answers with the run's key for that driver class, else the platform
 * key, else `undefined`; it is the run's prompt resolution (`GetAIAPIKey(driverClass, runKeys)`)
 * behind a function, so an action gets the same key the prompts use without ever holding the list
 * they come from. `undefined` also means "refused": the agent decides whether this action may use
 * the run's key for that class, and a refusal leaves the action on the platform key exactly as if
 * the run had none.
 */
export type RuntimeAPIKeyResolver = (driverClass: string) => string | undefined;

/**
 * Which credentials an agent run may spend: `'Any'` (the run's keys, then the platform's) or
 * `'RuntimeOnly'` (the run's keys alone). The same union as `AICredentialScope` in
 * `@memberjunction/ai`, declared here for the reason {@link RuntimeAPIKeyResolver} is: this package
 * does not depend on that one.
 */
export type RuntimeCredentialScope = 'Any' | 'RuntimeOnly';

/**
 * One secondary scope dimension's value. The same union as `SecondaryScopeValue` in
 * `@memberjunction/ai-core-plus`, declared here because that package depends on this one: BaseAgent assigns
 * the one to the other, so a value added to either and not both fails to compile there.
 */
export type ActionRunScopeValue = string | number | boolean | string[];

/**
 * An agent run's scope, as BaseAgent hands it to each action dispatch ({@link RunActionParams.RunScope}).
 * `null` fields mean the run carries no such scope; the whole object is absent outside an agent run.
 */
export interface ActionRunScope {
   /** The primary scope entity's name (e.g. `'Organizations'`), or `null` when the run names none. */
   PrimaryScopeEntityName?: string | null;
   /** The run's tenant: the record ID within the primary scope entity, or `null` when the run has none. */
   PrimaryScopeRecordID: string | null;
   /** The run's secondary dimensions (with the agent's configured defaults applied), or `null` when it has none. */
   SecondaryScopes?: Record<string, ActionRunScopeValue> | null;
}
