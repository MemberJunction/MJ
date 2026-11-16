/**
 * @fileoverview Declarative Entity Lifecycle Policy Engine — State Machines, Field-Freeze, and WriteAuthority.
 *
 * Centralizes entity lifecycle invariants across both client (`BaseEntity.Validate()`) and server
 * (`BaseEntity._innerSave` / `_innerDelete`, `DatabaseProviderBase.Save` / `Delete`, `ResolverBase`):
 *
 * 1. **Declarative State Machine**: initial states on create, directed state transitions (with role gates,
 *    required-server-operation gates, required fields on enter, cleared fields on transition), and terminal states.
 * 2. **Field-Freeze & Post-Create Immutability**: `immutableAfterCreateFields`, `editableFieldsByState`,
 *    `frozenFieldsByState` (keyed by stored pre-save state or `'*'`), and `fieldFreezeExemptOperations`.
 * 3. **WriteAuthority (`'Standard' | 'AppendOnly' | 'ServerOperationOnly'`)**:
 *    - `'AppendOnly'` permits initial creation (`!entity.IsSaved`) and unconditionally refuses updates and deletes.
 *    - `'ServerOperationOnly'` blocks direct client CRUD (`ResolverBase`, `TransactionGroupResolver`,
 *      `EntityCRUDHandler`, `MJ.SaveEntityGraph`) and unscoped saves, succeeding only inside an authorized
 *      {@link ServerOperationScopeManager} frame (automatically established for domain `BaseRemotableOperation`
 *      executions where `GrantsServerWriteAuthority === true`).
 *
 * Policies may be authored declaratively in `EntityInfo.Settings` (`'LifecyclePolicy'`, `'StateMachinePolicy'`,
 * `'WriteAuthorityPolicy'`), in `IEntityConfiguration.Lifecycle` (`MJ: Entities.Configuration`), or registered
 * programmatically via {@link EntityLifecyclePolicyEngine.RegisterPolicy}.
 *
 * @module @memberjunction/core
 */

import {
    BaseSingleton,
    SafeJSONParse,
    UUIDsEqual,
    UUIDSet,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/global';
import type { BaseEntity, EntityField } from './baseEntity';
import { DocumentNumberingEngine } from './documentNumberingEngine';
import type { EntityInfo } from './entityInfo';
import { LogError } from './logging';
import type { UserInfo } from './securityInfo';

export type WriteAuthorityMode = 'Standard' | 'AppendOnly' | 'ServerOperationOnly';
export type EntityWriteOperation = 'Create' | 'Update' | 'Delete';

export interface IStateTransitionRule {
    /** Source state value, or `'*'` to match any non-terminal stored state. */
    from: string | '*';
    /** Target state value. */
    to: string;
    /** Optional role names or Role IDs permitted to perform this transition (matched against `UserInfo.UserRoles`). */
    allowedRoles?: string[];
    /** When true, this transition may only occur inside an active authorized {@link ServerOperationScopeFrame}. */
    requireServerOperation?: boolean;
    /** Specific server operation keys (e.g. `['Accounting.PostBatch']`) allowed to perform this transition. */
    allowedOperations?: string[];
    /** Entity fields that must be non-null and non-blank when entering `to`. */
    requiredFieldsOnEnter?: string[];
    /** Entity fields that must be null or empty string when taking this transition. */
    clearedFieldsOnTransition?: string[];
    /** Custom human-readable refusal message when this rule rejects a transition. */
    errorMessage?: string;
}

export interface IEntityStateMachinePolicy {
    /** Exact field name on the entity holding the lifecycle status (e.g. `'Status'`). */
    statusField: string;
    /** Allowed status values when creating a new record (`!entity.IsSaved`). */
    initialStates?: string[];
    /** Directed transition edges. Keeping the same status (`prior === next`) is always treated as a non-transition. */
    transitions: IStateTransitionRule[];
    /** Terminal states: outbound transitions are blocked, and field edits / deletes are locked by default. */
    terminalStates?: string[];
    /** Default `true`: records stored in a terminal state freeze all non-virtual fields and refuse `Delete()`. */
    freezeAllFieldsInTerminalStates?: boolean;
    /** Fields that may be populated on `Create` (`!entity.IsSaved`) and never modified once saved. */
    immutableAfterCreateFields?: string[];
    /** Allow-list of fields editable while the record's stored (pre-save) state equals key `S`. */
    editableFieldsByState?: Record<string, string[]>;
    /** Deny-list of fields frozen while the record's stored (pre-save) state equals key `S` (or `'*'` for all states). */
    frozenFieldsByState?: Record<string, string[]>;
    /** If provided, `Delete()` is only permitted when the record's stored status is in this list. */
    deletableInStates?: string[];
    /** Stored statuses in which `Delete()` is explicitly forbidden. */
    nonDeletableStates?: string[];
    /** Server operation keys exempted from field-freeze checks (e.g. controlled server amendment operations). */
    fieldFreezeExemptOperations?: string[];
}

export interface IEntityWriteAuthorityPolicy {
    /** Default write authority mode across `Create`, `Update`, and `Delete`. */
    mode: WriteAuthorityMode;
    /** Optional per-operation override (e.g. `Create: 'Standard'`, `Update: 'ServerOperationOnly'`). */
    perOperationMode?: Partial<Record<EntityWriteOperation, WriteAuthorityMode>>;
    /** Optional allow-list of operation keys permitted to write when effective mode is `'ServerOperationOnly'`. */
    allowedOperations?: string[];
    /** Custom refusal message surfaced when a write is denied. */
    errorMessage?: string;
}

export interface IEntityLifecyclePolicy {
    stateMachine?: IEntityStateMachinePolicy;
    writeAuthority?: IEntityWriteAuthorityPolicy;
}

export const CLIENT_DIRECT_CRUD_BOUNDARY_KEY = '__MJ_CLIENT_DIRECT_CRUD__';
/**
 * The frame {@link ServerOperationScopeManager.RunAsServerWork} enters. It names no entities and no
 * policy allows its key, so it grants no write authority; it only ends the client CRUD boundary
 * around it, so the work inside does not read as the client's own request.
 */
export const SERVER_WORK_OPERATION_KEY = '__MJ_SERVER_WORK__';
export const DOCUMENT_SEQUENCE_SQL_STORE_OPERATION_KEY = '__MJ_INTERNAL_DOCUMENT_SEQUENCE_SQL_STORE__';

export interface ServerOperationScopeFrame {
    readonly operationKey: string;
    readonly source: 'RemotableOperation' | 'ServerEngine' | 'ServerAction' | 'ClientCrudBoundary';
    /** Optional entity names this scope covers. Pass `['*']` to cover all entities. */
    readonly allowedEntities?: ReadonlyArray<string>;
    /** Optional acting User ID bound to this scope frame. When set, must match the entity's acting user. */
    readonly userId?: string;
}

export interface IServerOperationScopeTracker {
    readonly IsAsyncSafe?: boolean;
    RunInScope<T>(frame: ServerOperationScopeFrame, fn: () => T): T;
    RunWithoutAuthority?<T>(fn: () => T): T;
    GetActiveFrames(): ReadonlyArray<ServerOperationScopeFrame>;
}

function isPromiseLike<T>(value: T): value is T & PromiseLike<object | string | number | boolean | null | undefined> {
    return (
        value !== null &&
        value !== undefined &&
        (typeof value === 'object' || typeof value === 'function') &&
        'then' in (value as object) &&
        typeof (value as { then?: Function }).then === 'function'
    );
}

/**
 * Browser-safe default synchronous/single-chain stack tracker used when Node's `AsyncLocalStorage`
 * tracker has not been installed (e.g. Angular browser runtime or lightweight MJCore unit tests).
 * On Node servers, `@memberjunction/generic-database-provider` installs `NodeAsyncServerOperationScopeTracker`.
 */
export class StackServerOperationScopeTracker implements IServerOperationScopeTracker {
    public readonly IsAsyncSafe = false;
    private readonly _stack: ServerOperationScopeFrame[] = [];

    public RunInScope<T>(frame: ServerOperationScopeFrame, fn: () => T): T {
        this._stack.push(frame);
        let asyncPending = false;
        try {
            const out = fn();
            if (isPromiseLike(out)) {
                asyncPending = true;
                const popFrame = (): void => {
                    const idx = this._stack.lastIndexOf(frame);
                    if (idx >= 0) {
                        this._stack.splice(idx, 1);
                    }
                };
                return out.then(
                    (resolved) => {
                        popFrame();
                        return resolved;
                    },
                    (err: Error) => {
                        popFrame();
                        throw err;
                    },
                ) as T;
            }
            return out;
        } finally {
            if (!asyncPending) {
                const idx = this._stack.lastIndexOf(frame);
                if (idx >= 0) {
                    this._stack.splice(idx, 1);
                }
            }
        }
    }

    public RunWithoutAuthority<T>(fn: () => T): T {
        return this.RunInScope(
            {
                operationKey: CLIENT_DIRECT_CRUD_BOUNDARY_KEY,
                source: 'ClientCrudBoundary',
                allowedEntities: [],
            },
            fn,
        );
    }

    public GetActiveFrames(): ReadonlyArray<ServerOperationScopeFrame> {
        return [...this._stack];
    }
}

/**
 * Process-wide singleton managing active server operation authority frames.
 * Domain `BaseRemotableOperation` executions (`GrantsServerWriteAuthority === true`) and trusted server
 * engines wrap their mutations in {@link RunWithAuthority}, while client CRUD entry points (`ResolverBase`,
 * `TransactionGroupResolver`, `EntityCRUDHandler`, `SaveEntityGraphOperation`) wrap theirs in
 * {@link RunInClientCrudBoundary} so outer ambient authority can never leak into direct client CRUD.
 */
export class ServerOperationScopeManager extends BaseSingleton<ServerOperationScopeManager> {
    private _tracker: IServerOperationScopeTracker = new StackServerOperationScopeTracker();

    protected constructor() {
        super();
    }

    public static get Instance(): ServerOperationScopeManager {
        return super.getInstance<ServerOperationScopeManager>();
    }

    public SetTracker(tracker: IServerOperationScopeTracker): void {
        this._tracker = tracker;
    }

    public GetTracker(): IServerOperationScopeTracker {
        return this._tracker;
    }

    public RunWithAuthority<T>(frame: ServerOperationScopeFrame, fn: () => T): T {
        if (!frame.operationKey || frame.operationKey === CLIENT_DIRECT_CRUD_BOUNDARY_KEY) {
            throw new Error('ServerOperationScopeManager.RunWithAuthority requires a valid domain operationKey.');
        }
        return this._tracker.RunInScope(frame, fn);
    }

    /**
     * Marks `fn` as executing inside a direct client-originated CRUD boundary. Any outer server-operation
     * authority frame above this boundary is masked until a nested domain {@link RunWithAuthority} is entered.
     */
    public RunInClientCrudBoundary<T>(fn: () => T): T {
        return this._tracker.RunInScope(
            {
                operationKey: CLIENT_DIRECT_CRUD_BOUNDARY_KEY,
                source: 'ClientCrudBoundary',
                allowedEntities: [],
            },
            fn,
        );
    }

    /**
     * Executes `fn` with all outer authority frames cleared/masked (using `AsyncLocalStorage.run([], fn)`
     * when `NodeAsyncServerOperationScopeTracker` is installed).
     */
    public RunWithoutAuthority<T>(fn: () => T): T {
        if (this._tracker.RunWithoutAuthority) {
            return this._tracker.RunWithoutAuthority(fn);
        }
        return this.RunInClientCrudBoundary(fn);
    }

    /**
     * Returns the effective active authority frames since the innermost {@link RunInClientCrudBoundary}
     * (if any). Frames outside a client CRUD boundary are masked.
     */
    public GetEffectiveAuthorityFrames(): ReadonlyArray<ServerOperationScopeFrame> {
        const all = this._tracker.GetActiveFrames();
        let boundaryIdx = -1;
        for (let i = all.length - 1; i >= 0; i--) {
            if (all[i].operationKey === CLIENT_DIRECT_CRUD_BOUNDARY_KEY || all[i].source === 'ClientCrudBoundary') {
                boundaryIdx = i;
                break;
            }
        }
        return boundaryIdx >= 0 ? all.slice(boundaryIdx + 1) : all;
    }

    /**
     * Whether the code running now is a client's own CRUD request: inside a {@link RunInClientCrudBoundary}
     * with no frame entered since, neither server authority nor {@link RunAsServerWork}. A save made here
     * is the requesting user's own act; any other save is server code acting as that user.
     */
    public IsInDirectClientCrud(): boolean {
        const all = this._tracker.GetActiveFrames();
        const innermost = all[all.length - 1];
        return innermost?.operationKey === CLIENT_DIRECT_CRUD_BOUNDARY_KEY || innermost?.source === 'ClientCrudBoundary';
    }

    /**
     * Runs `fn` as server work: when called inside a client's own CRUD request ({@link IsInDirectClientCrud}),
     * `fn` runs under a frame that grants nothing ({@link SERVER_WORK_OPERATION_KEY}), so saves it makes,
     * and work it starts and leaves running, never read as the client's own. Agent runs and the task-graph
     * dispatcher's passes run this way: the async scope follows them out of the request that started them.
     * Elsewhere `fn` runs as is.
     */
    public RunAsServerWork<T>(fn: () => T): T {
        if (!this.IsInDirectClientCrud()) {
            return fn();
        }
        return this._tracker.RunInScope({ operationKey: SERVER_WORK_OPERATION_KEY, source: 'ServerEngine', allowedEntities: [] }, fn);
    }

    public IsOperationActive(
        allowedOperations?: ReadonlyArray<string>,
        entityName?: string,
        actingUser?: UserInfo,
    ): boolean {
        const frames = this.GetEffectiveAuthorityFrames();
        if (frames.length === 0) {
            return false;
        }
        const normalizedEntity = entityName?.trim().toLowerCase();
        const normalizedAllowedOps =
            allowedOperations && allowedOperations.length > 0
                ? new Set(allowedOperations.map((k) => k.trim().toLowerCase()))
                : null;
        const hasAllowedOps = normalizedAllowedOps !== null && normalizedAllowedOps.size > 0;

        for (let i = frames.length - 1; i >= 0; i--) {
            const frame = frames[i];
            if (frame.userId && actingUser?.ID && !UUIDsEqual(frame.userId, actingUser.ID)) {
                continue;
            }
            if (hasAllowedOps && !normalizedAllowedOps.has(frame.operationKey.trim().toLowerCase())) {
                continue;
            }
            const hasFrameEntities = Boolean(frame.allowedEntities && frame.allowedEntities.length > 0);
            if (!hasAllowedOps && !hasFrameEntities) {
                // Fail closed when neither the policy's allowedOperations nor the frame's allowedEntities scopes the authority.
                continue;
            }
            if (normalizedEntity && hasFrameEntities && frame.allowedEntities) {
                const coversAll = frame.allowedEntities.some((e) => e.trim() === '*');
                const coversEntity = frame.allowedEntities.some((e) => e.trim().toLowerCase() === normalizedEntity);
                if (!coversAll && !coversEntity) {
                    continue;
                }
            }
            return true;
        }
        return false;
    }
}

interface CachedMetadataPolicyEntry {
    readonly signature: string;
    readonly policy: IEntityLifecyclePolicy | null;
}

/**
 * Evaluates declarative and programmatic entity lifecycle policies (state machines, field-freeze rules,
 * post-create immutability, and `WriteAuthority` gates).
 */
export class EntityLifecyclePolicyEngine extends BaseSingleton<EntityLifecyclePolicyEngine> {
    public static readonly LIFECYCLE_SETTING_NAME = 'LifecyclePolicy';
    public static readonly STATE_MACHINE_SETTING_NAME = 'StateMachinePolicy';
    public static readonly WRITE_AUTHORITY_SETTING_NAME = 'WriteAuthorityPolicy';
    public static readonly DOCUMENT_SEQUENCE_COUNTERS_ENTITY_NAME = 'MJ: Document Sequence Counters';

    private readonly _programmaticPolicies = new Map<string, IEntityLifecyclePolicy>();
    private readonly _metadataCache = new Map<string, CachedMetadataPolicyEntry>();

    protected constructor() {
        super();
        this.seedBuiltInPolicies();
    }

    public static get Instance(): EntityLifecyclePolicyEngine {
        return super.getInstance<EntityLifecyclePolicyEngine>();
    }

    public RegisterPolicy(entityName: string, policy: IEntityLifecyclePolicy): void {
        const key = entityName.trim().toLowerCase();
        if (!key) {
            throw new Error('EntityLifecyclePolicyEngine.RegisterPolicy: entityName must be non-empty.');
        }
        this._programmaticPolicies.set(key, policy);
    }

    public UnregisterPolicy(entityName: string): void {
        this._programmaticPolicies.delete(entityName.trim().toLowerCase());
    }

    public ClearProgrammaticPolicies(): void {
        this._programmaticPolicies.clear();
        this._metadataCache.clear();
        this.seedBuiltInPolicies();
    }

    private seedBuiltInPolicies(): void {
        const counterPolicy: IEntityLifecyclePolicy = {
            writeAuthority: {
                mode: 'ServerOperationOnly',
                allowedOperations: [DOCUMENT_SEQUENCE_SQL_STORE_OPERATION_KEY],
                errorMessage:
                    'MJ: Document Sequence Counters is a system counter table and can only be mutated via DocumentNumberingEngine.',
            },
        };
        this._programmaticPolicies.set(
            EntityLifecyclePolicyEngine.DOCUMENT_SEQUENCE_COUNTERS_ENTITY_NAME.toLowerCase(),
            counterPolicy,
        );
        this._programmaticPolicies.set('document sequence counters', counterPolicy);
    }

    public ResolvePolicy(entityInfo: EntityInfo | null | undefined): IEntityLifecyclePolicy | null {
        if (!entityInfo || !entityInfo.Name) {
            return null;
        }
        const fromMetadata = this.resolveMetadataPolicy(entityInfo);
        const programmatic = this._programmaticPolicies.get(entityInfo.Name.trim().toLowerCase()) ?? null;

        if (!fromMetadata && !programmatic) {
            return null;
        }
        if (fromMetadata && !programmatic) {
            return fromMetadata;
        }
        if (!fromMetadata && programmatic) {
            return programmatic;
        }
        return {
            stateMachine: programmatic?.stateMachine ?? fromMetadata?.stateMachine,
            writeAuthority: programmatic?.writeAuthority ?? fromMetadata?.writeAuthority,
        };
    }

    /**
     * Whether `ResolverBase.UpdateRecord` MUST load the authoritative stored row from the database
     * rather than hydrating from client-supplied `OldValues___` (preventing status/frozen-field spoofing
     * on entities where `TrackRecordChanges === false`).
     */
    public RequiresStoredTruthOnUpdate(entityInfo: EntityInfo | null | undefined): boolean {
        return (
            this.ResolvePolicy(entityInfo) !== null ||
            DocumentNumberingEngine.Instance.RequiresStoredTruthOnUpdate(entityInfo)
        );
    }

    /**
     * Checks coarse write-authority and delete-state gates before saving or deleting `entity`.
     * Returns `null` when permitted, or a human-readable refusal message when denied.
     */
    public CheckWritePermissionGate(
        entity: BaseEntity,
        operation: EntityWriteOperation,
        user: UserInfo | undefined,
        isServerProvider: boolean,
    ): string | null {
        const policy = this.ResolvePolicy(entity.EntityInfo);
        if (!policy) {
            return null;
        }

        const effectiveMode = this.resolveWriteAuthorityMode(policy.writeAuthority, operation);
        if (effectiveMode === 'AppendOnly' && (operation === 'Update' || operation === 'Delete')) {
            return (
                policy.writeAuthority?.errorMessage ??
                `${entity.EntityInfo.Name} is append-only and cannot be ${operation === 'Update' ? 'modified' : 'deleted'} once created.`
            );
        }

        if (effectiveMode === 'ServerOperationOnly') {
            if (!isServerProvider) {
                return (
                    policy.writeAuthority?.errorMessage ??
                    `${entity.EntityInfo.Name} cannot be ${operation.toLowerCase()}d directly; invoke the designated domain Remote Operation.`
                );
            }
            const allowed = ServerOperationScopeManager.Instance.IsOperationActive(
                policy.writeAuthority?.allowedOperations,
                entity.EntityInfo.Name,
                user,
            );
            if (!allowed) {
                const opsHint =
                    policy.writeAuthority?.allowedOperations && policy.writeAuthority.allowedOperations.length > 0
                        ? ` Allowed operations: ${policy.writeAuthority.allowedOperations.join(', ')}.`
                        : '';
                return (
                    policy.writeAuthority?.errorMessage ??
                    `${entity.EntityInfo.Name} requires an authorized server operation for ${operation}.${opsHint}`
                );
            }
        }

        if (operation === 'Delete' && policy.stateMachine) {
            const sm = policy.stateMachine;
            const statusField = entity.GetFieldByName(sm.statusField);
            if (!statusField) {
                LogError(
                    `EntityLifecyclePolicyEngine: configured statusField '${sm.statusField}' does not exist on entity '${entity.EntityInfo.Name}'.`,
                );
                return `Lifecycle policy error on ${entity.EntityInfo.Name}: configured statusField '${sm.statusField}' does not exist.`;
            }
            const currentStatus = this.stringifyStatusValue(
                statusField.Dirty ? statusField.OldValue : statusField.Value,
            );
            if (
                sm.terminalStates?.includes(currentStatus) &&
                sm.freezeAllFieldsInTerminalStates !== false &&
                !sm.deletableInStates?.includes(currentStatus)
            ) {
                return `Cannot delete ${entity.EntityInfo.Name} while ${sm.statusField} is in terminal state '${currentStatus}'.`;
            }
            if (sm.nonDeletableStates?.includes(currentStatus)) {
                return `Cannot delete ${entity.EntityInfo.Name} while ${sm.statusField} is '${currentStatus}'.`;
            }
            if (sm.deletableInStates && sm.deletableInStates.length > 0 && !sm.deletableInStates.includes(currentStatus)) {
                return (
                    `Cannot delete ${entity.EntityInfo.Name} while ${sm.statusField} is '${currentStatus}'. ` +
                    `Deletable states: ${sm.deletableInStates.join(', ')}.`
                );
            }
        }

        return null;
    }

    /**
     * Evaluates synchronous lifecycle invariants (append-only update guard, initial state on create,
     * state transitions, role/operation transition gates, post-create field immutability, and per-state
     * field-freeze rules) and appends any violations to `result`.
     */
    public ValidateLifecycleOnEntity(
        entity: BaseEntity,
        user: UserInfo | undefined,
        result: ValidationResult,
    ): void {
        const policy = this.ResolvePolicy(entity.EntityInfo);
        if (!policy) {
            return;
        }

        if (entity.IsSaved) {
            const updateMode = this.resolveWriteAuthorityMode(policy.writeAuthority, 'Update');
            if (updateMode === 'AppendOnly' && entity.Dirty) {
                this.failValidation(
                    result,
                    entity.EntityInfo.Name,
                    policy.writeAuthority?.errorMessage ??
                        `${entity.EntityInfo.Name} is append-only and cannot be modified once created.`,
                    null,
                );
                return;
            }
        }

        const sm = policy.stateMachine;
        if (!sm) {
            return;
        }

        const statusField = entity.GetFieldByName(sm.statusField);
        if (!statusField) {
            LogError(
                `EntityLifecyclePolicyEngine: configured statusField '${sm.statusField}' does not exist on entity '${entity.EntityInfo.Name}'.`,
            );
            this.failValidation(
                result,
                sm.statusField,
                `Lifecycle policy error on ${entity.EntityInfo.Name}: configured statusField '${sm.statusField}' does not exist.`,
                null,
            );
            return;
        }

        if (!entity.IsSaved) {
            if (sm.initialStates && sm.initialStates.length > 0) {
                const initialVal = this.stringifyStatusValue(statusField.Value);
                if (!sm.initialStates.includes(initialVal)) {
                    this.failValidation(
                        result,
                        sm.statusField,
                        `New ${entity.EntityInfo.Name} records must start with ${sm.statusField} in [${sm.initialStates.join(', ')}] (received '${initialVal || '(empty)'}').`,
                        initialVal,
                    );
                }
            }
            return;
        }

        // Saved record (Update): evaluate transition from stored (OldValue) status to pending (Value) status.
        const priorStatus = this.stringifyStatusValue(statusField.Dirty ? statusField.OldValue : statusField.Value);
        const nextStatus = this.stringifyStatusValue(statusField.Value);
        const isStatusTransition = statusField.Dirty && priorStatus !== nextStatus;

        let matchedTransitionRule: IStateTransitionRule | null = null;
        if (isStatusTransition) {
            matchedTransitionRule = this.validateStateTransition(entity, sm, priorStatus, nextStatus, user, result);
        }

        // Post-create immutable fields cannot change on any saved record.
        if (sm.immutableAfterCreateFields && sm.immutableAfterCreateFields.length > 0) {
            for (const fieldName of sm.immutableAfterCreateFields) {
                const field = entity.GetFieldByName(fieldName);
                if (field && field.Dirty && !this.valuesEqual(field.OldValue, field.Value)) {
                    this.failValidation(
                        result,
                        field.Name,
                        `Field '${field.Name}' on ${entity.EntityInfo.Name} cannot be modified after creation.`,
                        this.toDiagnosticScalar(field.Value),
                    );
                }
            }
        }

        // Per-state field-freeze rules evaluated against the stored pre-save state (`priorStatus`).
        const freezeExempt =
            sm.fieldFreezeExemptOperations &&
            sm.fieldFreezeExemptOperations.length > 0 &&
            ServerOperationScopeManager.Instance.IsOperationActive(
                sm.fieldFreezeExemptOperations,
                entity.EntityInfo.Name,
                user,
            );
        if (!freezeExempt) {
            this.validateFieldFreezeForState(entity, sm, priorStatus, result, matchedTransitionRule);
        }
    }

    private validateStateTransition(
        entity: BaseEntity,
        sm: IEntityStateMachinePolicy,
        priorStatus: string,
        nextStatus: string,
        user: UserInfo | undefined,
        result: ValidationResult,
    ): IStateTransitionRule | null {
        if (sm.terminalStates?.includes(priorStatus)) {
            this.failValidation(
                result,
                sm.statusField,
                `Cannot transition ${entity.EntityInfo.Name}.${sm.statusField} out of terminal state '${priorStatus}' to '${nextStatus}'.`,
                nextStatus,
            );
            return null;
        }

        const matchingRules = sm.transitions.filter(
            (edge) => (edge.from === priorStatus || edge.from === '*') && edge.to === nextStatus,
        );
        if (matchingRules.length === 0) {
            const validTargets = Array.from(
                new Set(
                    sm.transitions
                        .filter((edge) => edge.from === priorStatus || edge.from === '*')
                        .map((edge) => edge.to),
                ),
            );
            const targetHint =
                validTargets.length > 0
                    ? ` Valid transitions from '${priorStatus}': [${validTargets.join(', ')}].`
                    : ` No transitions are configured from '${priorStatus}'.`;
            this.failValidation(
                result,
                sm.statusField,
                `Invalid state transition on ${entity.EntityInfo.Name}.${sm.statusField}: '${priorStatus}' -> '${nextStatus}'.${targetHint}`,
                nextStatus,
            );
            return null;
        }

        // Prefer an exact `from === priorStatus` rule over wildcard `from === '*'` if both exist,
        // and succeed if at least one matching edge satisfies all role/operation/field guards.
        const exactRules = matchingRules.filter((r) => r.from === priorStatus);
        const candidates = exactRules.length > 0 ? exactRules : matchingRules;

        let firstFailureMessage: string | null = null;
        let firstFailureField = sm.statusField;

        for (const rule of candidates) {
            const ruleFailure = this.evaluateTransitionRuleGuards(entity, sm, rule, user);
            if (!ruleFailure) {
                return rule; // This edge satisfied every guard!
            }
            if (firstFailureMessage === null) {
                firstFailureMessage = ruleFailure.message;
                firstFailureField = ruleFailure.field;
            }
        }

        if (firstFailureMessage !== null) {
            this.failValidation(result, firstFailureField, firstFailureMessage, nextStatus);
        }
        return null;
    }

    private evaluateTransitionRuleGuards(
        entity: BaseEntity,
        sm: IEntityStateMachinePolicy,
        rule: IStateTransitionRule,
        user: UserInfo | undefined,
    ): { field: string; message: string } | null {
        if (rule.allowedRoles && rule.allowedRoles.length > 0) {
            if (!this.userHasAnyRole(user, rule.allowedRoles)) {
                return {
                    field: sm.statusField,
                    message:
                        rule.errorMessage ??
                        `Transition '${rule.from}' -> '${rule.to}' on ${entity.EntityInfo.Name}.${sm.statusField} requires one of roles: [${rule.allowedRoles.join(', ')}].`,
                };
            }
        }

        if (rule.requireServerOperation || (rule.allowedOperations && rule.allowedOperations.length > 0)) {
            const opAllowed = ServerOperationScopeManager.Instance.IsOperationActive(
                rule.allowedOperations,
                entity.EntityInfo.Name,
                user,
            );
            if (!opAllowed) {
                return {
                    field: sm.statusField,
                    message:
                        rule.errorMessage ??
                        `Transition '${rule.from}' -> '${rule.to}' on ${entity.EntityInfo.Name}.${sm.statusField} requires an authorized server operation.`,
                };
            }
        }

        if (rule.requiredFieldsOnEnter && rule.requiredFieldsOnEnter.length > 0) {
            for (const reqFieldName of rule.requiredFieldsOnEnter) {
                const reqField = entity.GetFieldByName(reqFieldName);
                const val = reqField?.Value;
                if (val === null || val === undefined || (typeof val === 'string' && val.trim().length === 0)) {
                    return {
                        field: reqFieldName,
                        message:
                            rule.errorMessage ??
                            `Field '${reqFieldName}' is required when transitioning ${entity.EntityInfo.Name}.${sm.statusField} to '${rule.to}'.`,
                    };
                }
            }
        }

        if (rule.clearedFieldsOnTransition && rule.clearedFieldsOnTransition.length > 0) {
            for (const clearFieldName of rule.clearedFieldsOnTransition) {
                const clearField = entity.GetFieldByName(clearFieldName);
                const val = clearField?.Value;
                if (val !== null && val !== undefined && !(typeof val === 'string' && val.trim().length === 0)) {
                    return {
                        field: clearFieldName,
                        message:
                            rule.errorMessage ??
                            `Field '${clearFieldName}' must be cleared when transitioning ${entity.EntityInfo.Name}.${sm.statusField} to '${rule.to}'.`,
                    };
                }
            }
        }

        return null;
    }

    private validateFieldFreezeForState(
        entity: BaseEntity,
        sm: IEntityStateMachinePolicy,
        priorStatus: string,
        result: ValidationResult,
        matchedTransitionRule: IStateTransitionRule | null = null,
    ): void {
        const statusKeyLower = sm.statusField.trim().toLowerCase();
        const transitionExemptFields = new Set<string>([statusKeyLower]);
        if (matchedTransitionRule) {
            for (const req of matchedTransitionRule.requiredFieldsOnEnter ?? []) {
                transitionExemptFields.add(req.trim().toLowerCase());
            }
            for (const clr of matchedTransitionRule.clearedFieldsOnTransition ?? []) {
                transitionExemptFields.add(clr.trim().toLowerCase());
            }
        }

        if (sm.terminalStates?.includes(priorStatus) && sm.freezeAllFieldsInTerminalStates !== false) {
            for (const field of entity.Fields) {
                if (
                    this.isUserMutatedDataField(field) &&
                    !transitionExemptFields.has(field.Name.trim().toLowerCase())
                ) {
                    this.failValidation(
                        result,
                        field.Name,
                        `Field '${field.Name}' on ${entity.EntityInfo.Name} is frozen because ${sm.statusField} is in terminal state '${priorStatus}'.`,
                        this.toDiagnosticScalar(field.Value),
                    );
                }
            }
            return;
        }

        const editableList = sm.editableFieldsByState?.[priorStatus];
        if (editableList) {
            const allowedSet = new Set(editableList.map((f) => f.trim().toLowerCase()));
            for (const exempt of transitionExemptFields) {
                allowedSet.add(exempt);
            }
            for (const field of entity.Fields) {
                if (!this.isUserMutatedDataField(field)) {
                    continue;
                }
                if (!allowedSet.has(field.Name.trim().toLowerCase())) {
                    this.failValidation(
                        result,
                        field.Name,
                        `Field '${field.Name}' on ${entity.EntityInfo.Name} cannot be modified while ${sm.statusField} is '${priorStatus}'.`,
                        this.toDiagnosticScalar(field.Value),
                    );
                }
            }
        }

        const globalFrozen = sm.frozenFieldsByState?.['*'] ?? [];
        const stateFrozen = sm.frozenFieldsByState?.[priorStatus] ?? [];
        if (globalFrozen.length > 0 || stateFrozen.length > 0) {
            const frozenSet = new Set(
                [...globalFrozen, ...stateFrozen].map((f) => f.trim().toLowerCase()),
            );
            for (const exempt of transitionExemptFields) {
                frozenSet.delete(exempt);
            }
            for (const field of entity.Fields) {
                if (!this.isUserMutatedDataField(field)) {
                    continue;
                }
                if (frozenSet.has(field.Name.trim().toLowerCase())) {
                    this.failValidation(
                        result,
                        field.Name,
                        `Field '${field.Name}' on ${entity.EntityInfo.Name} is frozen while ${sm.statusField} is '${priorStatus}'.`,
                        this.toDiagnosticScalar(field.Value),
                    );
                }
            }
        }
    }

    private isUserMutatedDataField(field: EntityField): boolean {
        if (!field.Dirty) {
            return false;
        }
        const info = field.EntityFieldInfo;
        if (info.IsVirtual || info.IsPrimaryKey || info.IsSpecialDateField) {
            return false;
        }
        return !this.valuesEqual(field.OldValue, field.Value);
    }

    private resolveWriteAuthorityMode(
        writeAuthority: IEntityWriteAuthorityPolicy | undefined,
        operation: EntityWriteOperation,
    ): WriteAuthorityMode {
        if (!writeAuthority) {
            return 'Standard';
        }
        return writeAuthority.perOperationMode?.[operation] ?? writeAuthority.mode ?? 'Standard';
    }

    private resolveMetadataPolicy(entityInfo: EntityInfo): IEntityLifecyclePolicy | null {
        const settings = entityInfo.Settings ?? [];
        const lifecycleSetting = settings.find(
            (s) => s.Name?.trim().toLowerCase() === EntityLifecyclePolicyEngine.LIFECYCLE_SETTING_NAME.toLowerCase(),
        );
        const smSetting = settings.find(
            (s) => s.Name?.trim().toLowerCase() === EntityLifecyclePolicyEngine.STATE_MACHINE_SETTING_NAME.toLowerCase(),
        );
        const waSetting = settings.find(
            (s) => s.Name?.trim().toLowerCase() === EntityLifecyclePolicyEngine.WRITE_AUTHORITY_SETTING_NAME.toLowerCase(),
        );
        const configLifecycle = entityInfo.ConfigurationObject?.Lifecycle;

        const signature = `${lifecycleSetting?.Value ?? ''}|${smSetting?.Value ?? ''}|${waSetting?.Value ?? ''}|${configLifecycle ? JSON.stringify(configLifecycle) : ''}`;
        if (signature === '|||') {
            return null;
        }

        const cacheKey = entityInfo.ID || entityInfo.Name;
        const cached = this._metadataCache.get(cacheKey);
        if (cached && cached.signature === signature) {
            return cached.policy;
        }

        let parseFailed = false;
        const parseSettingJson = (settingName: string, rawVal: string | null | undefined): Record<string, object | string | number | boolean | null> | null => {
            if (!rawVal || rawVal.trim().length === 0) {
                return null;
            }
            const parsed = SafeJSONParse<Record<string, object | string | number | boolean | null>>(rawVal, false);
            if (!parsed || typeof parsed !== 'object') {
                LogError(
                    `EntityLifecyclePolicyEngine: invalid JSON in EntitySetting '${settingName}' on entity '${entityInfo.Name}'; failing closed.`,
                );
                parseFailed = true;
                return null;
            }
            return parsed;
        };

        const rawUnified = parseSettingJson(EntityLifecyclePolicyEngine.LIFECYCLE_SETTING_NAME, lifecycleSetting?.Value);
        const rawSm = parseSettingJson(EntityLifecyclePolicyEngine.STATE_MACHINE_SETTING_NAME, smSetting?.Value);
        const rawWa = parseSettingJson(EntityLifecyclePolicyEngine.WRITE_AUTHORITY_SETTING_NAME, waSetting?.Value);

        if (parseFailed) {
            const failClosedPolicy: IEntityLifecyclePolicy = {
                writeAuthority: {
                    mode: 'ServerOperationOnly',
                    allowedOperations: ['__MJ_MALFORMED_METADATA_LIFECYCLE_POLICY__'],
                    errorMessage: `Lifecycle policy metadata JSON on ${entityInfo.Name} is malformed; writes are blocked until repaired.`,
                },
            };
            this._metadataCache.set(cacheKey, { signature, policy: failClosedPolicy });
            return failClosedPolicy;
        }

        const rawConfigLifecycle = configLifecycle as Record<string, object | string | number | boolean | null> | undefined;
        const unifiedSmObj = (rawUnified?.stateMachine ?? rawUnified?.StateMachine) as Record<string, object | string | number | boolean | null> | undefined;
        const unifiedWaObj = (rawUnified?.writeAuthority ?? rawUnified?.WriteAuthority) as Record<string, object | string | number | boolean | null> | undefined;
        const configSmObj = (rawConfigLifecycle?.stateMachine ?? rawConfigLifecycle?.StateMachine) as Record<string, object | string | number | boolean | null> | undefined;
        const configWaObj = (rawConfigLifecycle?.writeAuthority ?? rawConfigLifecycle?.WriteAuthority) as Record<string, object | string | number | boolean | null> | undefined;

        const stateMachineSource = rawSm ?? unifiedSmObj ?? configSmObj;
        const writeAuthoritySource = rawWa ?? unifiedWaObj ?? configWaObj;

        const stateMachine = stateMachineSource ? this.normalizeStateMachinePolicy(stateMachineSource) : undefined;
        const writeAuthority = writeAuthoritySource ? this.normalizeWriteAuthorityPolicy(writeAuthoritySource) : undefined;

        const policy: IEntityLifecyclePolicy | null =
            stateMachine || writeAuthority
                ? {
                      ...(stateMachine ? { stateMachine } : {}),
                      ...(writeAuthority ? { writeAuthority } : {}),
                  }
                : null;

        this._metadataCache.set(cacheKey, { signature, policy });
        return policy;
    }

    private normalizeStateMachinePolicy(
        raw: Record<string, object | string | number | boolean | null>,
    ): IEntityStateMachinePolicy {
        const rawTransitions = (raw.transitions ?? raw.Transitions) as Array<Record<string, object | string | number | boolean | null>> | undefined;
        const transitions: IStateTransitionRule[] = Array.isArray(rawTransitions)
            ? rawTransitions.map((t) => ({
                  from: String(t.from ?? t.From ?? ''),
                  to: String(t.to ?? t.To ?? ''),
                  allowedRoles: (t.allowedRoles ?? t.AllowedRoles) as string[] | undefined,
                  requireServerOperation: (t.requireServerOperation ?? t.RequireServerOperation) as boolean | undefined,
                  allowedOperations: (t.allowedOperations ?? t.AllowedOperations) as string[] | undefined,
                  requiredFieldsOnEnter: (t.requiredFieldsOnEnter ?? t.RequiredFieldsOnEnter) as string[] | undefined,
                  clearedFieldsOnTransition: (t.clearedFieldsOnTransition ?? t.ClearedFieldsOnTransition) as string[] | undefined,
                  errorMessage: (t.errorMessage ?? t.ErrorMessage) as string | undefined,
              }))
            : [];
        return {
            statusField: String(raw.statusField ?? raw.StatusField ?? ''),
            initialStates: (raw.initialStates ?? raw.InitialStates) as string[] | undefined,
            transitions,
            terminalStates: (raw.terminalStates ?? raw.TerminalStates) as string[] | undefined,
            freezeAllFieldsInTerminalStates: (raw.freezeAllFieldsInTerminalStates ??
                raw.FreezeAllFieldsInTerminalStates) as boolean | undefined,
            immutableAfterCreateFields: (raw.immutableAfterCreateFields ??
                raw.ImmutableAfterCreateFields) as string[] | undefined,
            editableFieldsByState: (raw.editableFieldsByState ?? raw.EditableFieldsByState) as
                | Record<string, string[]>
                | undefined,
            frozenFieldsByState: (raw.frozenFieldsByState ?? raw.FrozenFieldsByState) as
                | Record<string, string[]>
                | undefined,
            deletableInStates: (raw.deletableInStates ?? raw.DeletableInStates) as string[] | undefined,
            nonDeletableStates: (raw.nonDeletableStates ?? raw.NonDeletableStates) as string[] | undefined,
            fieldFreezeExemptOperations: (raw.fieldFreezeExemptOperations ??
                raw.FieldFreezeExemptOperations) as string[] | undefined,
        };
    }

    private normalizeWriteAuthorityPolicy(
        raw: Record<string, object | string | number | boolean | null>,
    ): IEntityWriteAuthorityPolicy {
        return {
            mode: ((raw.mode ?? raw.Mode) as WriteAuthorityMode) ?? 'Standard',
            perOperationMode: (raw.perOperationMode ?? raw.PerOperationMode) as
                | Partial<Record<EntityWriteOperation, WriteAuthorityMode>>
                | undefined,
            allowedOperations: (raw.allowedOperations ?? raw.AllowedOperations) as string[] | undefined,
            errorMessage: (raw.errorMessage ?? raw.ErrorMessage) as string | undefined,
        };
    }

    private userHasAnyRole(user: UserInfo | undefined, allowedRoles: ReadonlyArray<string>): boolean {
        if (!user || !user.UserRoles || user.UserRoles.length === 0) {
            return false;
        }
        const roleIdSet = new UUIDSet();
        const roleNameSet = new Set<string>();
        for (const ur of user.UserRoles) {
            if (typeof ur.Role === 'string') {
                roleNameSet.add(ur.Role.trim().toLowerCase());
            }
            if (typeof ur.RoleID === 'string' && ur.RoleID.trim().length > 0) {
                roleIdSet.Add(ur.RoleID);
            }
        }
        for (const allowed of allowedRoles) {
            const wanted = allowed.trim();
            if (roleNameSet.has(wanted.toLowerCase()) || roleIdSet.Has(wanted)) {
                return true;
            }
        }
        return false;
    }

    private stringifyStatusValue(value: EntityField['Value']): string {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value).trim();
    }

    private valuesEqual(left: EntityField['Value'], right: EntityField['Value']): boolean {
        if (left === right) {
            return true;
        }
        if (left instanceof Date && right instanceof Date) {
            return left.getTime() === right.getTime();
        }
        return false;
    }

    private toDiagnosticScalar(value: EntityField['Value']): string | number | boolean | null {
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }
        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : value.toISOString();
        }
        return String(value);
    }

    private failValidation(
        result: ValidationResult,
        fieldName: string,
        message: string,
        value: string | number | boolean | null,
    ): void {
        result.Success = false;
        result.Errors.push(new ValidationErrorInfo(fieldName, message, value, ValidationErrorType.Failure));
    }
}
