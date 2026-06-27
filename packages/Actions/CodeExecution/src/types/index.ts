/**
 * A host-side bridge handler function. Registered per-execution via
 * `CodeExecutionService.execute({ bridgeHandlers, ... })` and invoked when
 * sandboxed code calls `__bridgeCall(name, args)`. The handler receives the
 * args (already JSON-round-tripped, so primitives + plain objects only) and
 * returns any JSON-serializable value; it may also throw, in which case the
 * sandbox's `await __bridgeCall(...)` rejects with the error's message.
 *
 * The handler runs in the **host process**, not the sandbox. It has full
 * access to MJ's services, DB, and filesystem — so higher layers
 * (RuntimeActionBridge in @memberjunction/action-runtime) are responsible
 * for enforcing per-Runtime-action permission scopes before each call
 * reaches this point.
 */
export type BridgeHandler = (args: unknown) => Promise<unknown> | unknown;

/**
 * A name → handler map passed to `CodeExecutionService.execute()` for a
 * single invocation. The sandbox can only call names that are present in
 * this map; unknown names reject with a "handler not registered" error.
 */
export type BridgeHandlerMap = Record<string, BridgeHandler>;

/**
 * Parameters for code execution.
 *
 * `bridgeHandlers` is the ONLY field that is NOT sent over IPC — functions
 * can't be serialized across the process boundary. The host keeps the map
 * alive for the duration of this execution and uses it to service
 * `bridge-call` messages coming back from the worker.
 */
export interface CodeExecutionParams {
    /**
     * The code to execute
     */
    code: string;

    /**
     * Programming language (currently only 'javascript' supported)
     */
    language: 'javascript';

    /**
     * Input data available to the code via 'input' variable
     */
    inputData?: any;

    /**
     * Maximum execution time in seconds (default: 30)
     */
    timeoutSeconds?: number;

    /**
     * Memory limit in MB (default: 128)
     * Note: Memory limiting requires Node.js flags, enforced at process level
     */
    memoryLimitMB?: number;

    /**
     * Optional map of bridge handlers to expose to sandbox code as
     * `__bridgeCall(name, args)`. When present, the sandbox can make async
     * round-trips to the host for each registered name. Host-side only — not
     * sent over IPC. See {@link BridgeHandler}.
     */
    bridgeHandlers?: BridgeHandlerMap;

    /**
     * Optional cap on the number of bridge calls a single execution may
     * make (default: 100). The (N+1)th call rejects with a BRIDGE_LIMIT
     * error. Prevents runaway loops inside sandbox code.
     */
    maxBridgeCalls?: number;

    /**
     * Optional AbortSignal for upstream cancellation. When aborted, any
     * in-flight `await __bridgeCall(...)` inside the sandbox rejects and
     * the sandbox script is left to wind down (we don't dispose the isolate
     * mid-execution — see design notes in the plan).
     */
    abortSignal?: AbortSignal;
}

/**
 * Result of code execution
 */
export interface CodeExecutionResult {
    /**
     * Whether execution was successful
     */
    success: boolean;
    
    /**
     * The output value set by the code (value of 'output' variable)
     */
    output?: any;
    
    /**
     * Console logs captured during execution
     */
    logs?: string[];
    
    /**
     * Error message if execution failed
     */
    error?: string;
    
    /**
     * Type of error that occurred
     */
    errorType?: 'TIMEOUT' | 'MEMORY_LIMIT' | 'SYNTAX_ERROR' | 'RUNTIME_ERROR' | 'SECURITY_ERROR';
    
    /**
     * Execution time in milliseconds
     */
    executionTimeMs?: number;
}

/**
 * Options for JavaScript sandbox execution
 */
export interface JavaScriptExecutionOptions {
    /**
     * Timeout in seconds
     */
    timeout: number;
    
    /**
     * Memory limit in MB
     */
    memoryLimit: number;
    
    /**
     * List of allowed npm packages that can be required
     */
    allowedLibraries?: string[];
}

/**
 * IPC message types for worker/host communication.
 *
 * Existing: `execute`, `result`, `error`, `ready`.
 * NEW for the bridge: `bridge-call` (worker→host), `bridge-response`
 * (host→worker), `abort` (host→worker).
 */

/** Host → Worker: run this code. */
export interface ExecuteIpcMessage {
    type: 'execute';
    requestId: string;
    /** The IPC-safe subset of `CodeExecutionParams` (no `bridgeHandlers`). */
    params: Omit<CodeExecutionParams, 'bridgeHandlers' | 'abortSignal'>;
}

/** Worker → Host: execution finished cleanly. */
export interface ResultIpcMessage {
    type: 'result';
    requestId: string;
    result: CodeExecutionResult;
}

/** Worker → Host: execution threw before the handler could assemble a result. */
export interface ErrorIpcMessage {
    type: 'error';
    requestId: string;
    error: string;
}

/** Worker → Host: sandbox code wants the host to service a bridge call. */
export interface BridgeCallIpcMessage {
    type: 'bridge-call';
    requestId: string;
    /** Unique per call so Promise.all-style concurrency is correlated correctly. */
    callId: string;
    /** Name registered in the execution's `bridgeHandlers` map. */
    functionName: string;
    /** JSON-round-tripped args. */
    args: unknown;
}

/** Host → Worker: result of a bridge call. One of `result` | `error` is populated. */
export interface BridgeResponseIpcMessage {
    type: 'bridge-response';
    requestId: string;
    callId: string;
    result?: unknown;
    error?: string;
}

/** Host → Worker: abort in-flight bridge calls for this requestId. */
export interface AbortIpcMessage {
    type: 'abort';
    requestId: string;
    reason: string;
}

/** Worker → Host: initial ready signal (no requestId). */
export interface ReadyIpcMessage {
    type: 'ready';
}

/** Host → Worker message types. */
export type HostToWorkerMessage = ExecuteIpcMessage | BridgeResponseIpcMessage | AbortIpcMessage;

/** Worker → Host message types. */
export type WorkerToHostMessage =
    | ResultIpcMessage
    | ErrorIpcMessage
    | BridgeCallIpcMessage
    | ReadyIpcMessage;

/**
 * Sandbox context provided to executed code
 */
export interface SandboxContext {
    /**
     * Input data for the code
     */
    input: any;
    
    /**
     * Output data set by the code
     */
    output: any;
    
    /**
     * Console API for logging
     */
    console: {
        log: (...args: any[]) => void;
        error: (...args: any[]) => void;
        warn: (...args: any[]) => void;
        info: (...args: any[]) => void;
    };
}
