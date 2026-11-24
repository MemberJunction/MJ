import type { IMetadataProvider, TenantContext, UserInfo } from '@memberjunction/core';
import type { MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { ActionAudienceReaders, type ActionRunAudience } from './ActionAudience';
import type {
    ActionParam,
    ActionResultSimple,
    ActionRunScope,
    ActionRunScopeValue,
    AIDirective,
    RunActionParams,
} from './ActionEngine-Base';

/**
 * JSON-safe primitive and structured value types used by SupportsAudience contracts
 * so payloads avoid `any` and `unknown`.
 */
export type ContractJSONScalar = string | number | boolean | null;
export type ContractJSONValue =
    | ContractJSONScalar
    | ReadonlyArray<ContractJSONValue>
    | { readonly [key: string]: ContractJSONValue };
export type ContractJSONObject = { readonly [key: string]: ContractJSONValue };

/**
 * Audience execution modes supported by an action.
 * - `'Caller'`: single-caller execution with no additional audience readers.
 * - `'Intersection'`: enumerated `Readers` where every reader must be entitled to any returned content.
 * - `'ScopeCommonReach'`: structural audience mode where no individual `Readers` are enumerated,
 *   but results are bounded to common reach within `RunScope`.
 */
export type ActionAudienceMode = 'Caller' | 'Intersection' | 'ScopeCommonReach';

/**
 * Normalized descriptor of the audience context under which an action executes.
 */
export interface ActionAudienceDescriptor {
    Mode: ActionAudienceMode;
    Readers?: ReadonlyArray<UserInfo>;
    ReaderUserIDs?: ReadonlyArray<string>;
    IsStructuralAudience?: boolean;
    RunScope?: ActionRunScope | null;
}

/**
 * Authoritative server-side source for a hidden scope parameter that LLM/client callers
 * must never supply or override.
 */
export type ServerBoundScopeSource =
    | 'RunScope.PrimaryScopeEntityName'
    | 'RunScope.PrimaryScopeRecordID'
    | 'RunScope.SecondaryScope'
    | 'RunScope.SearchScopeIDs'
    | 'ContextUser.ID'
    | 'ExplicitServerBinding';

/**
 * How the engine responds when an untrusted client or LLM caller attempts to supply a parameter
 * declared as server-bound hidden scope.
 * - `'Reject'` (default): fail closed with `SERVER_BOUND_SCOPE_SPOOFING` before executing the action.
 * - `'StripAndInject'`: remove every client-supplied key variant and inject the authoritative server value.
 */
export type HiddenScopeOverridePolicy = 'Reject' | 'StripAndInject';

/**
 * Declarative specification of a single server-bound hidden scope parameter.
 */
export interface ServerBoundHiddenScopeParamDeclaration {
    /** Canonical action parameter name injected by the server. */
    ParamName: string;
    /** Authoritative server-side source from which the value is resolved. */
    Source: ServerBoundScopeSource;
    /** Secondary scope key when `Source === 'RunScope.SecondaryScope'`. */
    SecondaryScopeKey?: string;
    /** When true, execution fails closed if the server cannot resolve a value. */
    Required?: boolean;
    /** Spoofing mitigation policy. Defaults to `'Reject'`. */
    OverridePolicy?: HiddenScopeOverridePolicy;
}

/**
 * Scalar or list scope values bound by trusted server code (`RunActionParams.ServerBoundScopeParams`).
 */
export type ServerBoundScopeValue = ActionRunScopeValue | null;

/**
 * Map of server-bound hidden scope parameter names to authoritative server values.
 */
export type ServerBoundScopeBindings = Readonly<Record<string, ServerBoundScopeValue | undefined>>;

/** Result code emitted when an untrusted caller attempts to spoof or override a hidden scope parameter. */
export const SERVER_BOUND_SCOPE_SPOOFING_RESULT_CODE = 'SERVER_BOUND_SCOPE_SPOOFING' as const;

/** Result code emitted when a required server-bound hidden scope parameter cannot be resolved server-side. */
export const SERVER_BOUND_SCOPE_MISSING_RESULT_CODE = 'SERVER_BOUND_SCOPE_MISSING' as const;

/**
 * Structured record describing a single server-bound hidden scope violation.
 */
export interface ServerBoundScopeSpoofingViolation {
    ParamName: string;
    ClientSuppliedParamName: string;
    Reason: 'SpoofedHiddenScopeParam' | 'MissingRequiredServerScope';
    Message: string;
}

/**
 * Outcome of enforcing server-bound hidden scope parameter declarations against `RunActionParams`.
 */
export interface ServerBoundScopeEnforcementResult {
    Allowed: boolean;
    EnforcedParams: ActionParam[];
    InjectedParamNames: string[];
    StrippedParamNames: string[];
    Violations: ServerBoundScopeSpoofingViolation[];
    ResultCode?: typeof SERVER_BOUND_SCOPE_SPOOFING_RESULT_CODE | typeof SERVER_BOUND_SCOPE_MISSING_RESULT_CODE;
    RefusalMessage?: string;
}

/**
 * Policy governing receipt-only chat return shaping so sensitive internal payloads
 * are stripped before results reach chat surfaces or LLM contexts.
 */
export interface ReceiptOnlyReturnShapingPolicy {
    /** Whether receipt-only return shaping is active. */
    Enabled: boolean;
    /** When true, applies shaping only when the run has an active audience (`Audience` or `IsStructuralAudience`). */
    ApplyOnlyWhenAudienceScoped?: boolean;
    /** Allowlisted output parameter names safe to retain in the chat receipt (case-insensitive). */
    AllowedReceiptParamNames?: ReadonlyArray<string>;
    /** Explicit output parameter names that must always be stripped (case-insensitive). */
    StrippedParamNames?: ReadonlyArray<string>;
    /** Optional fixed confirmation summary replacing raw `Message`. */
    ReceiptMessage?: string;
    /** Strip `AIDirectives` from chat-facing output. Defaults to `true`. */
    StripAIDirectives?: boolean;
    /** Semantic receipt category (e.g. `'WorkflowSubmission'`, `'NamedPersonAgentRequest'`). */
    ReceiptType?: string;
    /** Optional safe output parameter name carrying a scalar reference ID for `ActionChatReceipt.ReferenceID`. */
    ReferenceIDParamName?: string;
}

/**
 * Sanitized confirmation receipt emitted to chat surfaces when receipt-only shaping is applied.
 */
export interface ActionChatReceipt {
    ReceiptOnly: true;
    ActionName: string;
    ActionID?: string;
    Success: boolean;
    ResultCode: string;
    Summary: string;
    ReceiptType?: string;
    ReferenceID?: string;
    RedactedOutputParamNames: string[];
    RetainedOutputParamNames: string[];
    TimestampIso: string;
}

/**
 * Result of shaping an `ActionResultSimple` for chat consumption.
 */
export interface ShapedActionReturn {
    Result: ActionResultSimple;
    Receipt: ActionChatReceipt;
}

/**
 * Payload for submitting a host-granted durable workflow from an audience-aware or scoped action.
 * Hosts enforce that only pre-approved `WorkflowKey` templates can run and bind `ServerBoundScope`
 * and `Audience` server-side.
 */
export interface HostGrantedWorkflowSubmissionPayload {
    WorkflowKey: string;
    WorkflowName?: string;
    Inputs: ContractJSONObject;
    ServerBoundScope: ServerBoundScopeBindings;
    Audience?: ActionAudienceDescriptor;
    RunScope?: ActionRunScope | null;
    ConversationDetailID?: string | null;
    EnvironmentID?: string | null;
    SubmittedByAgentRunID?: string | null;
    WorkflowBudget?: {
        MaxCostUsd?: number;
        MaxWallClockMs?: number;
        StartedAtMs?: number;
    };
    /** Optional action contract governing whether host-granted workflow submission is allowed. */
    AudienceContract?: SupportsAudienceContract;
    ContextUser: UserInfo;
    Provider?: IMetadataProvider;
}

/**
 * Sanitized receipt returned after submitting a host-granted workflow.
 */
export interface HostGrantedWorkflowSubmissionResult {
    Success: boolean;
    ParentTaskID?: string;
    WorkflowKey: string;
    Status: 'Submitted' | 'Rejected' | 'Unavailable';
    ReceiptMessage: string;
    ErrorMessage?: string;
}

/**
 * Host-registered service interface implementing durable workflow submission for host-granted workflows.
 */
export interface HostGrantedWorkflowSubmitter {
    SubmitHostGrantedWorkflow(payload: HostGrantedWorkflowSubmissionPayload): Promise<HostGrantedWorkflowSubmissionResult>;
}

/**
 * Process-wide singleton registry allowing `MJServer` (or a host application) to supply
 * the durable workflow submission backend without coupling `@memberjunction/actions-base`
 * to `@memberjunction/task-graph`.
 */
export class HostGrantedWorkflowSubmitterRegistry extends BaseSingleton<HostGrantedWorkflowSubmitterRegistry> {
    private _submitter: HostGrantedWorkflowSubmitter | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): HostGrantedWorkflowSubmitterRegistry {
        return super.getInstance<HostGrantedWorkflowSubmitterRegistry>('HostGrantedWorkflowSubmitterRegistry');
    }

    /** Registers the active host-granted workflow submitter. */
    public Register(submitter: HostGrantedWorkflowSubmitter): void {
        this._submitter = submitter;
    }

    /** Clears the registered submitter (for unit test isolation). */
    public Clear(): void {
        this._submitter = null;
    }

    /** Returns the currently registered submitter, or `null` when none is registered. */
    public get Submitter(): HostGrantedWorkflowSubmitter | null {
        return this._submitter;
    }

    /**
     * Submits a host-granted workflow through the registered submitter, failing closed
     * when `AudienceContract` disallows workflow submission or when no submitter is registered.
     */
    public async Submit(payload: HostGrantedWorkflowSubmissionPayload): Promise<HostGrantedWorkflowSubmissionResult> {
        if (payload.AudienceContract !== undefined) {
            const gate = AssertAllowsHostGrantedWorkflowSubmission(payload.AudienceContract);
            if ('ErrorMessage' in gate) {
                return {
                    Success: false,
                    WorkflowKey: payload.WorkflowKey,
                    Status: 'Rejected',
                    ReceiptMessage: `Workflow '${payload.WorkflowKey}' submission was rejected.`,
                    ErrorMessage: gate.ErrorMessage,
                };
            }
        }
        if (!this._submitter) {
            return {
                Success: false,
                WorkflowKey: payload.WorkflowKey,
                Status: 'Unavailable',
                ReceiptMessage: `Workflow '${payload.WorkflowKey}' could not be submitted because no host workflow submitter is registered.`,
                ErrorMessage: 'HostGrantedWorkflowSubmitter is not registered.',
            };
        }
        return this._submitter.SubmitHostGrantedWorkflow(payload);
    }
}

/**
 * Delivery mode for a named-person agent request.
 */
export type NamedPersonAgentRequestDeliveryMode = 'DirectUserRequest' | 'InterAgent' | 'Approval';

/**
 * Strongly-typed contract for routing an agent request to a specific named person.
 */
export interface NamedPersonAgentRequestPayload {
    TargetUserID: string;
    TargetUserDisplayName?: string;
    TargetAgentID?: string;
    RequestTypeName?: string;
    DeliveryMode?: NamedPersonAgentRequestDeliveryMode;
    Subject: string;
    Message: string;
    Priority?: number;
    ExpiresAt?: Date;
    OriginatingAgentRunID?: string | null;
    OriginatingConversationDetailID?: string | null;
    Audience?: ActionAudienceDescriptor;
    ServerBoundScope?: ServerBoundScopeBindings;
    Metadata?: ContractJSONObject;
    /** Optional action contract governing whether named-person agent requests are allowed. */
    AudienceContract?: SupportsAudienceContract;
    /** Optional explicit tenant context of the target recipient for cross-tenant verification. */
    TargetUserTenantContext?: TenantContext;
    ContextUser: UserInfo;
    Provider?: IMetadataProvider;
}

/**
 * Sanitized confirmation receipt returned when creating a named-person agent request.
 */
export interface NamedPersonAgentRequestReceipt {
    Success: boolean;
    AgentRequestID?: string;
    TargetUserID: string;
    Status?: MJAIAgentRequestEntity['Status'];
    ReceiptMessage: string;
    ErrorMessage?: string;
}

/**
 * Server-side handler interface for creating named-person `MJ: AI Agent Requests`.
 */
export interface NamedPersonAgentRequestHandler {
    CreateNamedPersonRequest(payload: NamedPersonAgentRequestPayload): Promise<NamedPersonAgentRequestReceipt>;
}

/**
 * Process-wide singleton registry decoupling named-person agent request creation in
 * `@memberjunction/actions-base` from server entity persistence in `@memberjunction/core-entities-server`.
 */
export class NamedPersonAgentRequestRegistry extends BaseSingleton<NamedPersonAgentRequestRegistry> {
    private _handler: NamedPersonAgentRequestHandler | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): NamedPersonAgentRequestRegistry {
        return super.getInstance<NamedPersonAgentRequestRegistry>('NamedPersonAgentRequestRegistry');
    }

    /** Registers the active named-person agent request handler. */
    public Register(handler: NamedPersonAgentRequestHandler): void {
        this._handler = handler;
    }

    /** Clears the registered handler (for unit test isolation). */
    public Clear(): void {
        this._handler = null;
    }

    /** Returns the currently registered handler, or `null` when none is registered. */
    public get Handler(): NamedPersonAgentRequestHandler | null {
        return this._handler;
    }

    /**
     * Dispatches a named-person agent request through the registered handler, failing closed
     * when `AudienceContract` disallows named-person requests or when no handler is registered.
     */
    public async CreateRequest(payload: NamedPersonAgentRequestPayload): Promise<NamedPersonAgentRequestReceipt> {
        if (payload.AudienceContract !== undefined) {
            const gate = AssertAllowsNamedPersonAgentRequests(payload.AudienceContract);
            if ('ErrorMessage' in gate) {
                return {
                    Success: false,
                    TargetUserID: payload.TargetUserID,
                    ReceiptMessage: `Request for user '${payload.TargetUserID}' was rejected.`,
                    ErrorMessage: gate.ErrorMessage,
                };
            }
        }
        if (!this._handler) {
            return {
                Success: false,
                TargetUserID: payload.TargetUserID,
                ReceiptMessage: `Request for user '${payload.TargetUserID}' could not be created because no request handler is registered.`,
                ErrorMessage: 'NamedPersonAgentRequestHandler is not registered.',
            };
        }
        return this._handler.CreateNamedPersonRequest(payload);
    }
}

/**
 * Full formalized contract for an audience-capable action (`SupportsAudience`).
 */
export interface SupportsAudienceContract {
    /** Whether the action honours an audience boundary. */
    SupportsAudience: boolean;
    /** Audience modes this action accepts. When omitted, both `'Intersection'` and `'ScopeCommonReach'` are permitted. */
    SupportedModes?: ReadonlyArray<ActionAudienceMode>;
    /** Hidden scope parameters that the server binds authoritatively and clients/LLMs may never spoof. */
    HiddenScopeParams?: ReadonlyArray<ServerBoundHiddenScopeParamDeclaration>;
    /** Receipt-only chat return shaping configuration. */
    ReturnShaping?: ReceiptOnlyReturnShapingPolicy;
    /** Declares whether this action may submit host-granted workflows. */
    AllowsHostGrantedWorkflowSubmission?: boolean;
    /** Declares whether this action may dispatch named-person agent requests. */
    AllowsNamedPersonAgentRequests?: boolean;
}

/**
 * Type guard verifying a candidate object conforms to {@link SupportsAudienceContract}.
 */
export function IsSupportsAudienceContract(
    candidate: SupportsAudienceContract | object | null | undefined
): candidate is SupportsAudienceContract {
    if (!candidate || typeof candidate !== 'object') {
        return false;
    }
    if (!('SupportsAudience' in candidate) || typeof candidate.SupportsAudience !== 'boolean') {
        return false;
    }
    if ('HiddenScopeParams' in candidate && candidate.HiddenScopeParams !== undefined) {
        if (!Array.isArray(candidate.HiddenScopeParams)) {
            return false;
        }
        for (const decl of candidate.HiddenScopeParams) {
            if (!isValidHiddenScopeDeclaration(decl)) {
                return false;
            }
        }
    }
    if ('ReturnShaping' in candidate && candidate.ReturnShaping !== undefined) {
        if (!isValidReturnShapingPolicy(candidate.ReturnShaping)) {
            return false;
        }
    }
    if ('SupportedModes' in candidate && candidate.SupportedModes !== undefined) {
        if (
            !Array.isArray(candidate.SupportedModes) ||
            !candidate.SupportedModes.every(
                (mode) => mode === 'Caller' || mode === 'Intersection' || mode === 'ScopeCommonReach'
            )
        ) {
            return false;
        }
    }
    if (
        'AllowsHostGrantedWorkflowSubmission' in candidate &&
        candidate.AllowsHostGrantedWorkflowSubmission !== undefined &&
        typeof candidate.AllowsHostGrantedWorkflowSubmission !== 'boolean'
    ) {
        return false;
    }
    if (
        'AllowsNamedPersonAgentRequests' in candidate &&
        candidate.AllowsNamedPersonAgentRequests !== undefined &&
        typeof candidate.AllowsNamedPersonAgentRequests !== 'boolean'
    ) {
        return false;
    }
    return true;
}

/**
 * Verifies that a {@link SupportsAudienceContract} explicitly permits host-granted workflow submission.
 */
export function AssertAllowsHostGrantedWorkflowSubmission(
    contract: SupportsAudienceContract | undefined,
    actionName?: string
): { Allowed: true } | { Allowed: false; ErrorMessage: string } {
    if (contract?.AllowsHostGrantedWorkflowSubmission === true) {
        return { Allowed: true };
    }
    const label = actionName ? `Action '${actionName}'` : 'This action';
    return {
        Allowed: false,
        ErrorMessage: `${label} is not authorized to submit host-granted workflows (AllowsHostGrantedWorkflowSubmission must be true).`,
    };
}

/**
 * Verifies that a {@link SupportsAudienceContract} explicitly permits dispatching named-person agent requests.
 */
export function AssertAllowsNamedPersonAgentRequests(
    contract: SupportsAudienceContract | undefined,
    actionName?: string
): { Allowed: true } | { Allowed: false; ErrorMessage: string } {
    if (contract?.AllowsNamedPersonAgentRequests === true) {
        return { Allowed: true };
    }
    const label = actionName ? `Action '${actionName}'` : 'This action';
    return {
        Allowed: false,
        ErrorMessage: `${label} is not authorized to dispatch named-person agent requests (AllowsNamedPersonAgentRequests must be true).`,
    };
}

/**
 * Submits a host-granted workflow only after verifying {@link SupportsAudienceContract.AllowsHostGrantedWorkflowSubmission}.
 */
export async function SubmitContractGovernedWorkflow(
    contract: SupportsAudienceContract | undefined,
    payload: HostGrantedWorkflowSubmissionPayload,
    actionName?: string
): Promise<HostGrantedWorkflowSubmissionResult> {
    const gate = AssertAllowsHostGrantedWorkflowSubmission(contract, actionName);
    if ('ErrorMessage' in gate) {
        return {
            Success: false,
            WorkflowKey: payload.WorkflowKey,
            Status: 'Rejected',
            ReceiptMessage: `Workflow '${payload.WorkflowKey}' submission was rejected.`,
            ErrorMessage: gate.ErrorMessage,
        };
    }
    return HostGrantedWorkflowSubmitterRegistry.Instance.Submit({
        ...payload,
        AudienceContract: contract,
    });
}

/**
 * Dispatches a named-person agent request only after verifying {@link SupportsAudienceContract.AllowsNamedPersonAgentRequests}.
 */
export async function CreateContractGovernedNamedPersonRequest(
    contract: SupportsAudienceContract | undefined,
    payload: NamedPersonAgentRequestPayload,
    actionName?: string
): Promise<NamedPersonAgentRequestReceipt> {
    const gate = AssertAllowsNamedPersonAgentRequests(contract, actionName);
    if ('ErrorMessage' in gate) {
        return {
            Success: false,
            TargetUserID: payload.TargetUserID,
            ReceiptMessage: `Request for user '${payload.TargetUserID}' was rejected.`,
            ErrorMessage: gate.ErrorMessage,
        };
    }
    return NamedPersonAgentRequestRegistry.Instance.CreateRequest({
        ...payload,
        AudienceContract: contract,
    });
}

/**
 * Type guard verifying a candidate object conforms to {@link HostGrantedWorkflowSubmissionPayload}.
 */
export function IsHostGrantedWorkflowSubmissionPayload(
    candidate: HostGrantedWorkflowSubmissionPayload | object | null | undefined
): candidate is HostGrantedWorkflowSubmissionPayload {
    if (!candidate || typeof candidate !== 'object') {
        return false;
    }
    if (!('WorkflowKey' in candidate) || typeof candidate.WorkflowKey !== 'string' || candidate.WorkflowKey.trim().length === 0) {
        return false;
    }
    if (!('Inputs' in candidate) || !isPlainRecord(candidate.Inputs)) {
        return false;
    }
    if (!('ServerBoundScope' in candidate) || !isPlainRecord(candidate.ServerBoundScope)) {
        return false;
    }
    if (!('ContextUser' in candidate) || !hasUserIdentity(candidate.ContextUser)) {
        return false;
    }
    return true;
}

/**
 * Type guard verifying a candidate object conforms to {@link NamedPersonAgentRequestPayload}.
 */
export function IsNamedPersonAgentRequestPayload(
    candidate: NamedPersonAgentRequestPayload | object | null | undefined
): candidate is NamedPersonAgentRequestPayload {
    if (!candidate || typeof candidate !== 'object') {
        return false;
    }
    if (!('TargetUserID' in candidate) || typeof candidate.TargetUserID !== 'string' || candidate.TargetUserID.trim().length === 0) {
        return false;
    }
    if (!('Subject' in candidate) || typeof candidate.Subject !== 'string' || candidate.Subject.trim().length === 0) {
        return false;
    }
    if (!('Message' in candidate) || typeof candidate.Message !== 'string' || candidate.Message.trim().length === 0) {
        return false;
    }
    if (!('ContextUser' in candidate) || !hasUserIdentity(candidate.ContextUser)) {
        return false;
    }
    return true;
}

/**
 * Returns `true` when the contract declares one or more server-bound hidden scope parameters.
 */
export function HasServerBoundHiddenScopeParams(contract: SupportsAudienceContract | undefined): boolean {
    return Boolean(contract?.HiddenScopeParams && contract.HiddenScopeParams.length > 0);
}

/**
 * Determines whether receipt-only chat return shaping applies for the given contract, override, and audience state.
 */
export function RequiresReceiptOnlyChatReturn(
    contract: SupportsAudienceContract | undefined,
    overridePolicy: ReceiptOnlyReturnShapingPolicy | undefined,
    isAudienceScoped: boolean
): boolean {
    const effective = overridePolicy ?? contract?.ReturnShaping;
    if (!effective || !effective.Enabled) {
        return false;
    }
    if (effective.ApplyOnlyWhenAudienceScoped && !isAudienceScoped) {
        return false;
    }
    return true;
}

/**
 * Normalizes action dispatch inputs into a deterministic {@link ActionAudienceDescriptor}.
 */
export function NormalizeAudienceDescriptor(input: {
    Audience?: ActionRunAudience;
    IsStructuralAudience?: boolean;
    RunScope?: ActionRunScope | null;
    ContextUser?: UserInfo;
}): ActionAudienceDescriptor {
    if (input.IsStructuralAudience === true) {
        return {
            Mode: 'ScopeCommonReach',
            IsStructuralAudience: true,
            RunScope: input.RunScope ?? null,
        };
    }
    const distinctReaders = ActionAudienceReaders(input.Audience, input.ContextUser);
    if (distinctReaders && distinctReaders.length > 0) {
        return {
            Mode: 'Intersection',
            Readers: distinctReaders,
            ReaderUserIDs: distinctReaders.map((reader) => reader.ID),
            IsStructuralAudience: false,
            RunScope: input.RunScope ?? null,
        };
    }
    return {
        Mode: 'Caller',
        Readers: [],
        ReaderUserIDs: [],
        IsStructuralAudience: false,
        RunScope: input.RunScope ?? null,
    };
}

/**
 * Resolves the authoritative server-bound value for a single {@link ServerBoundHiddenScopeParamDeclaration}.
 */
export function ResolveServerBoundScopeValue(
    declaration: ServerBoundHiddenScopeParamDeclaration,
    params: Pick<RunActionParams, 'RunScope' | 'ContextUser' | 'ServerBoundScopeParams'>
): { Found: boolean; Value: ServerBoundScopeValue | undefined } {
    const explicitBindings = params.ServerBoundScopeParams;
    if (explicitBindings) {
        const matchedKey = Object.keys(explicitBindings).find(
            (key) => key.trim().toLowerCase() === declaration.ParamName.trim().toLowerCase()
        );
        if (matchedKey !== undefined && explicitBindings[matchedKey] !== undefined) {
            return { Found: true, Value: explicitBindings[matchedKey] };
        }
    }

    switch (declaration.Source) {
        case 'RunScope.PrimaryScopeEntityName': {
            const val = params.RunScope?.PrimaryScopeEntityName;
            return val !== undefined && val !== null && val.trim().length > 0
                ? { Found: true, Value: val }
                : { Found: false, Value: undefined };
        }
        case 'RunScope.PrimaryScopeRecordID': {
            const val = params.RunScope?.PrimaryScopeRecordID;
            return val !== undefined && val !== null && val.trim().length > 0
                ? { Found: true, Value: val }
                : { Found: false, Value: undefined };
        }
        case 'RunScope.SecondaryScope': {
            const secondaryKey = declaration.SecondaryScopeKey?.trim();
            const secondaryMap = params.RunScope?.SecondaryScopes;
            if (!secondaryKey || !secondaryMap) {
                return { Found: false, Value: undefined };
            }
            const matchedKey = Object.keys(secondaryMap).find(
                (key) => key.trim().toLowerCase() === secondaryKey.toLowerCase()
            );
            if (matchedKey !== undefined && secondaryMap[matchedKey] !== undefined) {
                return { Found: true, Value: secondaryMap[matchedKey] };
            }
            return { Found: false, Value: undefined };
        }
        case 'RunScope.SearchScopeIDs': {
            const ids = params.RunScope?.SearchScopeIDs;
            return Array.isArray(ids) && ids.length > 0
                ? { Found: true, Value: [...ids] }
                : { Found: false, Value: undefined };
        }
        case 'ContextUser.ID': {
            const userId = params.ContextUser?.ID;
            return userId && userId.trim().length > 0
                ? { Found: true, Value: userId }
                : { Found: false, Value: undefined };
        }
        case 'ExplicitServerBinding':
        default:
            return { Found: false, Value: undefined };
    }
}

/**
 * Enforces all declared and server-bound hidden scope parameters against `params.Params`:
 * - Detects untrusted LLM/client overrides (`Bound !== true` or mismatched values) case-insensitively.
 * - Under `'Reject'` policy (default), strips spoofed keys and returns `Allowed: false` (`SERVER_BOUND_SCOPE_SPOOFING`).
 * - Under `'StripAndInject'`, strips all client-supplied matching keys and injects the authoritative server value (`Bound: true`).
 * - Always injects authoritative server-bound values (`Bound: true`) so action implementations read trusted values.
 */
export function EnforceServerBoundHiddenScopeParams(
    params: Pick<RunActionParams, 'Params' | 'RunScope' | 'ContextUser' | 'ServerBoundScopeParams'>,
    declarations: ReadonlyArray<ServerBoundHiddenScopeParamDeclaration>
): ServerBoundScopeEnforcementResult {
    const mergedDeclarations = mergeScopeDeclarations(declarations, params.ServerBoundScopeParams);
    if (mergedDeclarations.length === 0) {
        return {
            Allowed: true,
            EnforcedParams: [...(params.Params ?? [])],
            InjectedParamNames: [],
            StrippedParamNames: [],
            Violations: [],
        };
    }

    const declaredLowerToDecl = new Map<string, ServerBoundHiddenScopeParamDeclaration>();
    for (const decl of mergedDeclarations) {
        const lower = decl.ParamName.trim().toLowerCase();
        if (lower.length > 0 && !declaredLowerToDecl.has(lower)) {
            declaredLowerToDecl.set(lower, decl);
        }
    }

    const resolvedByLower = new Map<string, { Found: boolean; Value: ServerBoundScopeValue | undefined }>();
    for (const [lower, decl] of declaredLowerToDecl.entries()) {
        resolvedByLower.set(lower, ResolveServerBoundScopeValue(decl, params));
    }

    const violations: ServerBoundScopeSpoofingViolation[] = [];
    const strippedParamNames: string[] = [];
    const survivingParams: ActionParam[] = [];

    for (const param of params.Params ?? []) {
        const lower = param.Name.trim().toLowerCase();
        const decl = declaredLowerToDecl.get(lower);
        if (!decl) {
            survivingParams.push(param);
            continue;
        }

        const resolved = resolvedByLower.get(lower);
        const alreadyAuthoritative =
            param.Bound === true &&
            resolved?.Found === true &&
            scopeValuesEqual(param.Value as ServerBoundScopeValue | undefined, resolved.Value);

        if (alreadyAuthoritative) {
            // Will be re-emitted cleanly below in canonical casing with Bound: true.
            continue;
        }

        strippedParamNames.push(param.Name);
        const policy = decl.OverridePolicy ?? 'Reject';
        if (policy === 'Reject') {
            violations.push({
                ParamName: decl.ParamName,
                ClientSuppliedParamName: param.Name,
                Reason: 'SpoofedHiddenScopeParam',
                Message: `Parameter '${param.Name}' is server-bound hidden scope ('${decl.ParamName}') and cannot be supplied or overridden by callers.`,
            });
        }
    }

    const injectedParamNames: string[] = [];
    const injectedParams: ActionParam[] = [];
    for (const [lower, decl] of declaredLowerToDecl.entries()) {
        const resolved = resolvedByLower.get(lower);
        if (resolved?.Found) {
            injectedParams.push({
                Name: decl.ParamName,
                Type: 'Input',
                Value: resolved.Value,
                Bound: true,
            });
            injectedParamNames.push(decl.ParamName);
        } else if (decl.Required === true) {
            violations.push({
                ParamName: decl.ParamName,
                ClientSuppliedParamName: decl.ParamName,
                Reason: 'MissingRequiredServerScope',
                Message: `Required server-bound hidden scope parameter '${decl.ParamName}' (source '${decl.Source}') is missing from server context.`,
            });
        }
    }

    if (violations.length > 0) {
        const hasSpoof = violations.some((v) => v.Reason === 'SpoofedHiddenScopeParam');
        return {
            Allowed: false,
            EnforcedParams: survivingParams,
            InjectedParamNames: [],
            StrippedParamNames: strippedParamNames,
            Violations: violations,
            ResultCode: hasSpoof ? SERVER_BOUND_SCOPE_SPOOFING_RESULT_CODE : SERVER_BOUND_SCOPE_MISSING_RESULT_CODE,
            RefusalMessage: violations.map((v) => v.Message).join(' '),
        };
    }

    return {
        Allowed: true,
        EnforcedParams: [...survivingParams, ...injectedParams],
        InjectedParamNames: injectedParamNames,
        StrippedParamNames: strippedParamNames,
        Violations: [],
    };
}

/**
 * Shapes an action's execution result into a sanitized confirmation receipt suitable for chat
 * and LLM contexts so sensitive internal outputs, raw records, and directives are never leaked.
 */
export function ShapeActionReturnForChat(
    actionName: string,
    actionId: string | undefined,
    result: ActionResultSimple,
    policy: ReceiptOnlyReturnShapingPolicy,
    hiddenParamNames: ReadonlyArray<string> = []
): ShapedActionReturn {
    const allowedSet = new Set(
        (policy.AllowedReceiptParamNames ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean)
    );
    const strippedSet = new Set(
        [...(policy.StrippedParamNames ?? []), ...hiddenParamNames]
            .map((name) => name.trim().toLowerCase())
            .filter(Boolean)
    );

    const retainedParams: ActionParam[] = [];
    const redactedOutputParamNames: string[] = [];
    const redactedSeenLower = new Set<string>();
    const retainedOutputParamNames: string[] = [];
    let referenceId: string | undefined;
    const referenceParamLower = policy.ReferenceIDParamName?.trim().toLowerCase();

    const recordRedacted = (name: string, lowerName: string): void => {
        if (!redactedSeenLower.has(lowerName)) {
            redactedSeenLower.add(lowerName);
            redactedOutputParamNames.push(name);
        }
    };

    for (const param of result.Params ?? []) {
        const normalizedType = param.Type.trim().toLowerCase();
        const lowerName = param.Name.trim().toLowerCase();

        // Always strip hidden scope and server-bound parameters regardless of Type ('Input' | 'Output' | 'Both').
        if (strippedSet.has(lowerName) || param.Bound === true) {
            recordRedacted(param.Name, lowerName);
            continue;
        }

        if (referenceParamLower && lowerName === referenceParamLower && typeof param.Value === 'string' && param.Value.trim().length > 0) {
            referenceId = param.Value.trim();
        }

        if (normalizedType === 'input') {
            retainedParams.push(param);
            continue;
        }

        const isAllowed = allowedSet.has(lowerName);
        if (isAllowed) {
            retainedParams.push(param);
            retainedOutputParamNames.push(param.Name);
        } else {
            recordRedacted(param.Name, lowerName);
        }
    }

    const effectiveResultCode = result.ResultCode || (result.Success ? 'SUCCESS' : 'FAILED');
    const summary =
        policy.ReceiptMessage && policy.ReceiptMessage.trim().length > 0
            ? policy.ReceiptMessage.trim()
            : `${actionName} ${result.Success ? 'completed' : 'failed'} (${effectiveResultCode}).`;

    const receipt: ActionChatReceipt = {
        ReceiptOnly: true,
        ActionName: actionName,
        ...(actionId ? { ActionID: actionId } : {}),
        Success: result.Success,
        ResultCode: effectiveResultCode,
        Summary: summary,
        ...(policy.ReceiptType ? { ReceiptType: policy.ReceiptType } : {}),
        ...(referenceId ? { ReferenceID: referenceId } : {}),
        RedactedOutputParamNames: redactedOutputParamNames,
        RetainedOutputParamNames: retainedOutputParamNames,
        TimestampIso: new Date().toISOString(),
    };

    const directives: AIDirective[] | undefined =
        policy.StripAIDirectives === false ? result.AIDirectives : undefined;

    const shapedResult: ActionResultSimple = {
        Success: result.Success,
        ResultCode: effectiveResultCode,
        Message: summary,
        Params: retainedParams,
        ...(directives ? { AIDirectives: directives } : {}),
        ...(result.ErrorRecovery ? { ErrorRecovery: result.ErrorRecovery } : {}),
        ChatReceipt: receipt,
    };

    return { Result: shapedResult, Receipt: receipt };
}

function mergeScopeDeclarations(
    declarations: ReadonlyArray<ServerBoundHiddenScopeParamDeclaration>,
    explicitBindings: ServerBoundScopeBindings | undefined
): ServerBoundHiddenScopeParamDeclaration[] {
    const merged: ServerBoundHiddenScopeParamDeclaration[] = [...declarations];
    if (!explicitBindings) {
        return merged;
    }
    const existingLower = new Set(merged.map((d) => d.ParamName.trim().toLowerCase()));
    for (const key of Object.keys(explicitBindings)) {
        if (explicitBindings[key] === undefined) {
            continue;
        }
        const lower = key.trim().toLowerCase();
        if (!existingLower.has(lower)) {
            existingLower.add(lower);
            merged.push({
                ParamName: key,
                Source: 'ExplicitServerBinding',
                OverridePolicy: 'Reject',
            });
        }
    }
    return merged;
}

function scopeValuesEqual(a: ServerBoundScopeValue | undefined, b: ServerBoundScopeValue | undefined): boolean {
    if (a === b) return true;
    if (typeof a === 'string' && typeof b === 'string') {
        return UUIDsEqual(a, b) || a === b;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, index) => val === b[index] || UUIDsEqual(val, b[index]));
    }
    return false;
}

function isPlainRecord(value: object | ContractJSONValue | undefined): value is ContractJSONObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasUserIdentity(user: UserInfo | object | null | undefined): boolean {
    if (!user || typeof user !== 'object') {
        return false;
    }
    return 'ID' in user && typeof user.ID === 'string' && user.ID.trim().length > 0;
}

function isValidHiddenScopeDeclaration(decl: ServerBoundHiddenScopeParamDeclaration | object | null | undefined): boolean {
    if (!decl || typeof decl !== 'object') {
        return false;
    }
    return (
        'ParamName' in decl &&
        typeof decl.ParamName === 'string' &&
        decl.ParamName.trim().length > 0 &&
        'Source' in decl &&
        typeof decl.Source === 'string'
    );
}

function isValidReturnShapingPolicy(policy: ReceiptOnlyReturnShapingPolicy | object | null | undefined): boolean {
    if (!policy || typeof policy !== 'object') {
        return false;
    }
    return 'Enabled' in policy && typeof policy.Enabled === 'boolean';
}
