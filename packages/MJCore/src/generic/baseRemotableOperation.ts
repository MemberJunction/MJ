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
 * Server-side execution context handed to {@link BaseRemotableOperation.ExecuteServer} (and through
 * it to `InternalExecute`) when a Remote Operation runs in-process on the server. It carries
 * everything a server implementation needs without coupling the operation to any transport.
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
     * The universal entry point — identical on client and server. Routes the operation through the
     * active (or explicitly supplied) provider's {@link IRemoteOperationProvider.RouteOperation}.
     *
     * @param input - The typed input payload.
     * @param options - Optional invocation options (mode, progress callback, explicit provider/user).
     * @returns The result; never throws for logical failures — inspect `Success` / `ErrorMessage`.
     */
    public async Execute(input: TInput, options: RemoteOpInvokeOptions = {}): Promise<RemoteOpResult<TOutput>> {
        let provider: IRemoteOperationProvider | undefined;
        try {
            provider = (options.provider ?? Metadata.Provider) as unknown as IRemoteOperationProvider | undefined;
        } catch {
            // Metadata.Provider throws when no global provider has been configured — treat as "no provider".
            provider = undefined;
        }
        if (!provider || typeof provider.RouteOperation !== 'function') {
            return {
                Success: false,
                ResultCode: 'NO_PROVIDER',
                ErrorMessage: 'No remote-operation-capable provider is available to route this operation',
            };
        }
        return provider.RouteOperation<TInput, TOutput>(this.OperationKey, input, options);
    }

    /**
     * Server-side execution entry point, invoked **in-process** by a server provider / resolver
     * after it has resolved this operation by key and applied the framework authorization gates
     * (scope / system-user / entity permissions). It runs the per-operation {@link Authorize} hook
     * and then {@link InternalExecute}, wrapping the outcome in a {@link RemoteOpResult}.
     *
     * @param input - The typed input payload.
     * @param context - The server execution context (provider, acting user, progress emitter).
     * @returns The wrapped result; logical failures are returned, not thrown.
     */
    public async ExecuteServer(input: TInput, context: RemoteOpServerContext): Promise<RemoteOpResult<TOutput>> {
        try {
            const authorized = await this.Authorize(input, context.user);
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
     * @param _context - The full server execution context (provider, user, progress emitter, handle).
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
     * rules against the input and acting user.
     *
     * @param _input - The typed input payload.
     * @param _user - The acting user.
     * @returns True if the operation may proceed.
     */
    protected async Authorize(_input: TInput, _user: UserInfo): Promise<boolean> {
        return true;
    }
}
