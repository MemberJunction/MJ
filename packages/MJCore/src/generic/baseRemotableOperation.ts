import { MJGlobal } from "@memberjunction/global";
import { Metadata } from "./metadata";
import { UserInfo } from "./securityInfo";
import {
    IMetadataProvider,
    IRemoteOperationProvider,
    RemoteOpExecMode,
    RemoteOpInvokeOptions,
    RemoteOpProgress,
    RemoteOpResult,
} from "./interfaces";

/**
 * Structured logical failure that a {@link BaseRemotableOperation.InternalExecute} or
 * {@link BaseRemotableOperation.Authorize} implementation can throw to return a specific
 * machine-readable {@link ResultCode} (instead of the generic `'EXECUTION_ERROR'`) without
 * changing `InternalExecute`'s typed `TOutput` return signature.
 */
export class RemoteOperationError extends Error {
    /** Machine-readable outcome code surfaced on {@link RemoteOpResult.ResultCode}. */
    public readonly ResultCode: string;

    constructor(resultCode: string, message: string) {
        super(message);
        this.name = 'RemoteOperationError';
        this.ResultCode = resultCode;
    }
}

/**
 * Structural input/output contract fields used to compute a deterministic wire fingerprint for a
 * Remote Operation (both at CodeGen emit time and at server runtime via `RemoteOperationEngineBase`).
 */
export interface RemoteOperationContractSpec {
    OperationKey: string;
    ExecutionMode?: RemoteOpExecMode | string | null;
    InputTypeName?: string | null;
    InputTypeDefinition?: string | null;
    InputTypeIsArray?: boolean | null;
    OutputTypeName?: string | null;
    OutputTypeDefinition?: string | null;
    OutputTypeIsArray?: boolean | null;
}

/**
 * Computes a deterministic, browser-safe 64-bit FNV-1a contract fingerprint (`ro_fp_<16-hex>`)
 * from an operation's structural contract metadata. Whitespace runs inside type definitions are
 * collapsed so CRLF vs LF formatting differences never trigger false mismatches.
 */
export function ComputeRemoteOperationContractFingerprint(spec: RemoteOperationContractSpec): string {
    const collapseWs = (s: string | null | undefined): string => (s ?? '').trim().replace(/\s+/g, ' ');
    const canonical = [
        (spec.OperationKey ?? '').trim(),
        (spec.ExecutionMode ?? 'Sync').trim(),
        (spec.InputTypeName ?? '').trim(),
        spec.InputTypeIsArray ? '1' : '0',
        collapseWs(spec.InputTypeDefinition),
        (spec.OutputTypeName ?? '').trim(),
        spec.OutputTypeIsArray ? '1' : '0',
        collapseWs(spec.OutputTypeDefinition),
    ].join('|');

    // Dual 32-bit FNV-1a lanes combined into 16 hex digits (browser-safe, zero BigInt/crypto overhead).
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < canonical.length; i++) {
        const c = canonical.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= c ^ (i & 0xff);
        h2 = Math.imul(h2, 0x811c9dc5);
    }
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `ro_fp_${hex1}${hex2}`;
}

/**
 * JSON-Schema-compatible primitive/nested value type for opt-in Agent / MCP tool input schemas.
 */
export type RemoteOpToolSchemaValue =
    | string
    | number
    | boolean
    | null
    | RemoteOpToolSchemaValue[]
    | { [key: string]: RemoteOpToolSchemaValue };

/**
 * Descriptor returned by {@link BaseRemotableOperation.GetExposedToolOperations} for operations
 * that opt into automatic AI Agent tool or MCP tool discovery.
 */
export interface ExposedRemoteOperationToolDescriptor {
    OperationKey: string;
    ExposeAsAgentTool: boolean;
    ExposeAsMCPTool: boolean;
    Description?: string;
    InputSchema?: Record<string, RemoteOpToolSchemaValue>;
    RequiredScope?: string;
    RequiresSystemUser?: boolean;
    ExecutionMode: RemoteOpExecMode;
}

/**
 * Server-side execution context handed to {@link BaseRemotableOperation.ExecuteServer} (and through
 * it to `Authorize` and `InternalExecute`) when a Remote Operation runs in-process on the server.
 * It carries everything a server implementation needs without coupling the operation to any transport.
 */
export interface RemoteOpServerContext {
    /** The provider that owns this execution (use this for data access — never `new Metadata()`). */
    provider: IMetadataProvider;
    /** The resolved acting user for permission-scoped data work. */
    user: UserInfo;
    /** Emits a streaming progress update for `LongRunning` operations (no-op for `Sync`). */
    emitProgress: (progress: RemoteOpProgress) => void;
    /** Opaque handle for the backing run (e.g. a `ProcessRunID`), when one has been created. */
    handle?: string;
    /**
     * Normalized HTTP `Origin` header (`scheme://host[:port]`, lowercased, no trailing slash)
     * when the operation arrived over HTTP/GraphQL. Undefined for in-process calls or requests
     * lacking an `Origin` header — origin allowlist checks must fail closed on `undefined`.
     */
    requestOrigin?: string;
    /**
     * Caller's network IP address (`req.ip`) when invoked over HTTP/GraphQL. Suitable for abuse
     * rate-limiting and forensic audit logging; never use as an identity check.
     */
    clientIp?: string;
    /** Caller's authenticated session ID when available from the server transport. */
    sessionId?: string;
    /** SHA-256 hash of the caller's MJ API key when invoked via `mj_sk_*` API key / MCP. */
    apiKeyHash?: string;
}

/**
 * Base class for a **typed, provider-routed Remote Operation** — the typed peer of `BaseEntity`
 * (record CRUD) and `RunView` (set reads) for arbitrary server capabilities.
 *
 * A concrete operation declares its stable {@link OperationKey} and is invoked through the single
 * universal {@link Execute} entry point, which routes through the active provider: on the client
 * the call is marshalled over GraphQL, on the server it is dispatched in-process — the developer
 * writes the same call regardless of where their code runs (the unified-developer-surface principle).
 *
 * The class is **never abstract on the work itself**: {@link InternalExecute} has a throwing
 * default so a CodeGen-emitted base carrying AI-authored or default plumbing is fully executable
 * with no hand-written subclass. Subclassing to override {@link InternalExecute} / {@link Authorize}
 * is available but never required.
 *
 * Concrete subclasses are resolved by stable key via the MJ ClassFactory, e.g.
 * `@RegisterClass(BaseRemotableOperation, 'RecordProcess.RunNow')`; the last registration (the
 * hand-authored subclass, which imports and extends the generated base) wins by import order.
 *
 * @typeParam TInput - The operation's input payload type.
 * @typeParam TOutput - The operation's output payload type.
 */
export abstract class BaseRemotableOperation<TInput = unknown, TOutput = unknown> {
    /** Stable registry key and wire token for this operation (e.g. `RecordProcess.RunNow`). */
    public abstract readonly OperationKey: string;

    /**
     * Optional API-key scope string (e.g. `recordprocess:execute`) enforced for API-key / MCP
     * callers by the server resolver. `undefined` means no scope gate; interactive users remain
     * bounded by their entity permissions. Informational here — the server applies it.
     */
    public readonly RequiredScope?: string;

    /** When true, the server only permits the system user to invoke this operation. */
    public readonly RequiresSystemUser?: boolean;

    /** Whether this operation is a plain `Sync` request/response or a `LongRunning` run. */
    public readonly ExecutionMode: RemoteOpExecMode = 'Sync';

    /**
     * Optional structural contract fingerprint emitted by CodeGen (or set by a hand-authored
     * operation). Automatically forwarded on {@link Execute} when the caller didn't override
     * `options.contractFingerprint`, allowing the server resolver to detect stale client bundles.
     */
    public readonly ContractFingerprint?: string;

    /** When true, exposes this operation for automatic discovery by MJ AI Agent tool adapters. */
    public readonly ExposeAsAgentTool?: boolean;

    /** When true, exposes this operation for automatic discovery by MJ MCP server tool adapters. */
    public readonly ExposeAsMCPTool?: boolean;

    /** Human/LLM-readable description when exposed as an Agent or MCP tool. */
    public readonly ToolDescription?: string;

    /** Optional JSON-Schema object describing `TInput` when exposed as an Agent or MCP tool. */
    public readonly ToolInputSchema?: Record<string, RemoteOpToolSchemaValue>;

    /**
     * Discovers all ClassFactory-registered {@link BaseRemotableOperation} subclasses that opt into
     * AI Agent (`ExposeAsAgentTool`) and/or MCP (`ExposeAsMCPTool`) tool exposure.
     */
    public static GetExposedToolOperations(filter?: {
        agentOnly?: boolean;
        mcpOnly?: boolean;
    }): ExposedRemoteOperationToolDescriptor[] {
        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseRemotableOperation);
        const seenKeys = new Set<string>();
        const descriptors: ExposedRemoteOperationToolDescriptor[] = [];

        // Walk in reverse registration order so the highest-priority / latest subclass override wins per key.
        for (let i = registrations.length - 1; i >= 0; i--) {
            const reg = registrations[i];
            const key = reg.Key;
            if (!key || seenKeys.has(key)) {
                continue;
            }
            seenKeys.add(key);

            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<object, object>>(
                BaseRemotableOperation,
                key,
            );
            if (!instance) {
                continue;
            }
            const asAgent = instance.ExposeAsAgentTool === true;
            const asMcp = instance.ExposeAsMCPTool === true;
            if (!asAgent && !asMcp) {
                continue;
            }
            if (filter?.agentOnly && !asAgent) {
                continue;
            }
            if (filter?.mcpOnly && !asMcp) {
                continue;
            }
            descriptors.push({
                OperationKey: instance.OperationKey,
                ExposeAsAgentTool: asAgent,
                ExposeAsMCPTool: asMcp,
                Description: instance.ToolDescription,
                InputSchema: instance.ToolInputSchema,
                RequiredScope: instance.RequiredScope,
                RequiresSystemUser: instance.RequiresSystemUser,
                ExecutionMode: instance.ExecutionMode,
            });
        }

        return descriptors.sort((a, b) => (a.OperationKey < b.OperationKey ? -1 : a.OperationKey > b.OperationKey ? 1 : 0));
    }

    /**
     * The universal entry point — identical on client and server. Routes the operation through the
     * active (or explicitly supplied) provider's {@link IRemoteOperationProvider.RouteOperation}.
     *
     * @param input - The typed input payload.
     * @param options - Optional invocation options (mode, progress callback, explicit provider/user).
     * @returns The result; never throws for logical failures — inspect `Success` / `ErrorMessage`.
     */
    public async Execute(input: TInput, options: RemoteOpInvokeOptions = {}): Promise<RemoteOpResult<TOutput>> {
        let provider: IRemoteOperationProvider | undefined;
        const candidateProvider: IMetadataProvider | undefined = options.provider ?? (() => {
            try {
                return Metadata.Provider;
            } catch {
                // Metadata.Provider throws when no global provider has been configured — treat as "no provider".
                return undefined;
            }
        })();
        if (candidateProvider && 'RouteOperation' in candidateProvider) {
            provider = candidateProvider as IMetadataProvider & IRemoteOperationProvider;
        }
        if (!provider || typeof provider.RouteOperation !== 'function') {
            return {
                Success: false,
                ResultCode: 'NO_PROVIDER',
                ErrorMessage: 'No remote-operation-capable provider is available to route this operation',
            };
        }
        const effectiveOptions: RemoteOpInvokeOptions =
            this.ContractFingerprint && options.contractFingerprint === undefined
                ? { ...options, contractFingerprint: this.ContractFingerprint }
                : options;
        return provider.RouteOperation<TInput, TOutput>(this.OperationKey, input, effectiveOptions);
    }

    /**
     * Server-side execution entry point, invoked **in-process** by a server provider / resolver
     * after it has resolved this operation by key and applied the framework authorization gates
     * (scope / system-user / entity permissions). It runs the per-operation {@link Authorize} hook
     * and then {@link InternalExecute}, wrapping the outcome in a {@link RemoteOpResult}.
     *
     * @param input - The typed input payload.
     * @param context - The server execution context (provider, acting user, progress emitter, HTTP metadata).
     * @returns The wrapped result; logical failures are returned, not thrown.
     */
    public async ExecuteServer(input: TInput, context: RemoteOpServerContext): Promise<RemoteOpResult<TOutput>> {
        try {
            const authorized = await this.Authorize(input, context.user, context);
            if (!authorized) {
                return {
                    Success: false,
                    ResultCode: 'FORBIDDEN',
                    ErrorMessage: `Not authorized to run operation '${this.OperationKey}'`,
                };
            }
            const output = await this.InternalExecute(input, context.provider, context.user, context);
            return { Success: true, ResultCode: 'SUCCESS', Output: output };
        } catch (e) {
            if (e instanceof RemoteOperationError) {
                return {
                    Success: false,
                    ResultCode: e.ResultCode,
                    ErrorMessage: e.message,
                };
            }
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                ErrorMessage: e instanceof Error ? e.message : String(e),
            };
        }
    }

    /**
     * The operation's server-side work. The default throws — a routable operation must supply a
     * body (CodeGen-emitted AI/default plumbing, or a hand-authored override). Implementations must
     * use `context.provider` / `context.user` for data access (never `new Metadata()`), per the
     * multi-provider rule.
     *
     * @param _input - The typed input payload.
     * @param _provider - The owning provider for data access.
     * @param _user - The acting user.
     * @param _context - The full server execution context (provider, user, progress emitter, handle, origin, IP).
     * @returns The typed output payload.
     */
    protected InternalExecute(_input: TInput, _provider: IMetadataProvider, _user: UserInfo, _context: RemoteOpServerContext): Promise<TOutput> {
        throw new Error(
            `Remote operation '${this.OperationKey}' has no server implementation. ` +
            `Provide CodeGen-generated (AI/Default) plumbing or a hand-authored subclass.`,
        );
    }

    /**
     * Per-operation authorization hook, composed with (and applied after) the framework gates that
     * the server resolver runs. Returns true by default. Override to enforce operation-specific
     * rules against the input, acting user, and server transport context (e.g. `context.requestOrigin`).
     *
     * @param _input - The typed input payload.
     * @param _user - The acting user.
     * @param _context - Optional server execution context (always supplied by {@link ExecuteServer}).
     * @returns True if the operation may proceed.
     */
    protected async Authorize(_input: TInput, _user: UserInfo, _context?: RemoteOpServerContext): Promise<boolean> {
        return true;
    }
}
