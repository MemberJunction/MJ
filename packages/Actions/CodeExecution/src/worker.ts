/**
 * Worker Process for Code Execution
 *
 * This worker runs in a SEPARATE PROCESS to provide true process-level isolation
 * for code execution. If a catastrophic V8 error occurs (e.g., severe OOM that crashes V8),
 * only this worker process terminates, not the main application.
 *
 * SECURITY CRITICAL: This file handles the isolate boundary between host and sandbox.
 * Any changes to this file MUST be reviewed for security implications:
 * - NEVER expose ivm.Reference or ivm.ExternalCopy objects to untrusted code
 * - NEVER accept untrusted V8 cachedData (CVE-2022-39266)
 * - ALWAYS validate and sanitize data crossing the isolate boundary
 * - ONLY pass primitives and plain objects via IPC (JSON-serializable data)
 *
 * Defense-in-depth layers:
 * 1. Process isolation (this file) - protects against V8 catastrophic failures
 * 2. V8 isolate (isolated-vm) - protects against sandbox escapes
 * 3. Module blocking - prevents dangerous Node.js API access
 * 4. Resource limits - prevents DoS via timeout/memory exhaustion
 *
 * ==============================================================================
 * Bidirectional Bridge (Phase 1d)
 * ==============================================================================
 * Sandbox code can call `__bridgeCall(name, args)` to invoke a host-registered
 * handler and await its result. The flow:
 *
 *   1. Sandbox calls `__bridgeCall('rv.RunView', { EntityName: '...' })`
 *   2. That dispatches to the host-side `_bridgeCall` ivm.Reference via
 *      `applyAsync`. The reference's JS body sends a `bridge-call` IPC
 *      message to the parent process and waits for the matching
 *      `bridge-response`.
 *   3. Parent process routes the request to the registered handler,
 *      executes it, and sends `bridge-response` back.
 *   4. The worker's `process.on('message')` handler resolves the pending
 *      promise for that callId.
 *   5. `applyAsync` resolves inside the isolate with the JSON-stringified
 *      result. Sandbox code parses it and sees a plain object.
 *
 * The bridge is scoped per-requestId: each `execute` message opens a new
 * pending-calls map that is either drained on completion or rejected en
 * masse on `abort`. Nothing persists between executions.
 */

import ivm from 'isolated-vm';
import { CodeExecutionParams, CodeExecutionResult } from './types';
import { getLibrarySource, isModuleAllowed, getAllowedModuleNames } from './libraries';

/**
 * Message types for IPC communication with parent process
 * All messages use JSON serialization (primitives and plain objects only)
 */
interface ExecuteMessage {
    type: 'execute';
    params: Omit<CodeExecutionParams, 'bridgeHandlers' | 'abortSignal'>;
    requestId: string;
}

interface ResultMessage {
    type: 'result';
    requestId: string;
    result: CodeExecutionResult;
}

interface ErrorMessage {
    type: 'error';
    requestId: string;
    error: string;
}

interface ReadyMessage {
    type: 'ready';
}

interface BridgeCallMessage {
    type: 'bridge-call';
    requestId: string;
    callId: string;
    functionName: string;
    args: unknown;
}

interface BridgeResponseMessage {
    type: 'bridge-response';
    requestId: string;
    callId: string;
    result?: unknown;
    error?: string;
}

interface AbortMessage {
    type: 'abort';
    requestId: string;
    reason: string;
}

type ParentInboundMessage = ExecuteMessage | BridgeResponseMessage | AbortMessage;
type ParentOutboundMessage = ResultMessage | ErrorMessage | ReadyMessage | BridgeCallMessage;

// ---------------------------------------------------------------------------
// Bridge state — one entry per in-flight execution.
//
// The key is the host-assigned `requestId` for the execute() call. Each entry
// owns a Map of in-flight bridge calls (callId → { resolve, reject }) so
// multiple concurrent `await __bridgeCall(...)` invocations from inside one
// execution (e.g. Promise.all) are correlated by callId. The `callCount` +
// `maxCalls` fields enforce the per-execution bridge-call cap.
// ---------------------------------------------------------------------------
interface BridgeExecutionState {
    pending: Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>;
    callCount: number;
    maxCalls: number;
    aborted: boolean;
    abortReason?: string;
}

const bridgeStates = new Map<string, BridgeExecutionState>();

function getBridgeState(requestId: string): BridgeExecutionState | undefined {
    return bridgeStates.get(requestId);
}

/**
 * Execute JavaScript code in an isolated-vm isolate
 *
 * SECURITY: This function creates and manages the V8 isolate. It must ensure:
 * - Only safe built-ins are exposed to untrusted code
 * - Module loading is strictly controlled via allowlist
 * - Input/output data is properly serialized (no object references leak)
 */
async function executeInIsolate(
    params: ExecuteMessage['params'],
    requestId: string
): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = (params.timeoutSeconds || 30) * 1000;
    const memoryLimitMB = params.memoryLimitMB || 128;
    const maxBridgeCalls = params.maxBridgeCalls ?? 100;

    // Open the bridge state for this execution before the isolate starts so
    // any bridge-response / abort messages that race in are delivered to a
    // real slot rather than dropped.
    bridgeStates.set(requestId, {
        pending: new Map(),
        callCount: 0,
        maxCalls: maxBridgeCalls,
        aborted: false
    });

    let isolate: ivm.Isolate | null = null;
    let context: ivm.Context | null = null;

    try {
        // Create isolated VM with memory limit
        isolate = new ivm.Isolate({ memoryLimit: memoryLimitMB });
        context = await isolate.createContext();

        // Capture console logs
        const logs: string[] = [];

        // Set up console object
        const jail = context.global;
        await jail.set('global', jail.derefInto());

        // SECURITY: Create console methods that capture output
        // This ivm.Reference is safe - it's a callback we control, not exposed to user code
        const consoleLog = new ivm.Reference((level: string, ...args: any[]) => {
            const formattedArgs = args.map(arg => formatConsoleArg(arg)).join(' ');
            logs.push(`[${level}] ${formattedArgs}`);
        });

        await jail.set('_consoleLog', consoleLog);

        // Set up console in the isolate
        await context.eval(`
            globalThis.console = {
                log: (...args) => _consoleLog.applySync(undefined, ['LOG', ...args]),
                error: (...args) => _consoleLog.applySync(undefined, ['ERROR', ...args]),
                warn: (...args) => _consoleLog.applySync(undefined, ['WARN', ...args]),
                info: (...args) => _consoleLog.applySync(undefined, ['INFO', ...args])
            };
        `);

        // SECURITY: Set up input data - only primitives and plain objects, no References
        if (params.inputData !== undefined) {
            const inputDataStr = JSON.stringify(params.inputData);
            await jail.set('_inputData', inputDataStr);
            await context.eval('globalThis.input = JSON.parse(_inputData);');
        }

        // Set up safe built-in objects
        await context.eval(`
            globalThis.JSON = JSON;
            globalThis.Math = Math;
            globalThis.Date = Date;
            globalThis.Array = Array;
            globalThis.Object = Object;
            globalThis.String = String;
            globalThis.Number = Number;
            globalThis.Boolean = Boolean;
            globalThis.RegExp = RegExp;
            globalThis.Error = Error;
            globalThis.TypeError = TypeError;
            globalThis.RangeError = RangeError;
            globalThis.SyntaxError = SyntaxError;
        `);

        // SECURITY: Block network access via fetch() API (available in Node.js 18+)
        // This is a global in modern Node.js and must be explicitly disabled
        await context.eval(`
            globalThis.fetch = () => {
                throw new Error('Security Error: Network access via fetch() is not allowed in sandboxed code');
            };
        `);

        // ===================================================================
        // BRIDGE SETUP
        //
        // Inject a single host-backed async function as `_bridgeCall`. The
        // reference's body sends an IPC message to the parent and awaits the
        // matching `bridge-response` via the `bridgeStates` map above. The
        // isolate wraps it as `globalThis.__bridgeCall(name, args)` which
        // returns a Promise resolving to the parsed JSON result (or rejects
        // with the host error message).
        //
        // Args + result cross the boundary as JSON strings so complex object
        // shapes, Dates, etc. behave consistently and no ivm.Reference ever
        // leaks back into user code.
        // ===================================================================
        // The bridge callback NEVER throws — errors are encoded as a JSON
        // envelope `{ __bridgeError: '...' }` and re-thrown inside the
        // isolate. This avoids firing unhandled-rejection in the worker
        // process when the caller exceeds maxBridgeCalls or the host handler
        // throws; isolated-vm would propagate the rejection across the
        // boundary, but Node 24+'s strict unhandled-rejection semantics can
        // fire a process.unhandledRejection handler before isolated-vm's
        // delivery settles, killing the worker.
        const bridgeCall = new ivm.Reference(
            async (callId: string, functionName: string, argsJson: string): Promise<string> => {
                try {
                    const state = getBridgeState(requestId);
                    if (!state) {
                        throw new Error('Bridge state missing for this execution');
                    }
                    if (state.aborted) {
                        throw new Error(state.abortReason ?? 'Execution aborted');
                    }
                    if (state.callCount >= state.maxCalls) {
                        throw new Error(
                            `Bridge call limit exceeded (maxBridgeCalls=${state.maxCalls}). ` +
                                'Runtime action tried to make too many host round-trips.'
                        );
                    }
                    state.callCount++;

                    let args: unknown;
                    try {
                        args = JSON.parse(argsJson);
                    } catch {
                        throw new Error('Bridge call args must be JSON-serializable');
                    }

                    const resultPromise = new Promise<unknown>((resolve, reject) => {
                        state.pending.set(callId, { resolve, reject });
                    });

                    const callMessage: BridgeCallMessage = {
                        type: 'bridge-call',
                        requestId,
                        callId,
                        functionName,
                        args
                    };
                    // SECURITY: IPC is JSON-serialized by Node's child-process
                    // plumbing; no references leak.
                    process.send!(callMessage);

                    const hostResult = await resultPromise;
                    // Return as a JSON string so the isolate receives a primitive
                    // it can safely JSON.parse — no copyInto / ExternalCopy needed.
                    return JSON.stringify({ ok: hostResult === undefined ? null : hostResult });
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    return JSON.stringify({ __bridgeError: message });
                }
            }
        );

        await jail.set('_bridgeCall', bridgeCall);

        // Counter inside the isolate for unique callIds — we use a monotonic
        // counter instead of Math.random() so the sequence is deterministic
        // for debugging and tests.
        await context.eval(`
            globalThis.__bridgeCallSeq = 0;
            globalThis.__bridgeCall = async function(functionName, args) {
                const callId = 'bc-' + (++globalThis.__bridgeCallSeq);
                const argsJson = JSON.stringify(args ?? null);
                // Reference.apply returns a Promise when called from inside
                // an isolate. { result: { promise: true } } tells isolated-vm
                // that the host callback returns a Promise it should await
                // before resolving. The result is a primitive string, which
                // transfers cleanly without needing ExternalCopy.
                const envelope = await _bridgeCall.apply(
                    undefined,
                    [callId, functionName, argsJson],
                    { result: { promise: true } }
                );
                const parsed = envelope ? JSON.parse(envelope) : null;
                if (parsed && parsed.__bridgeError) {
                    throw new Error(parsed.__bridgeError);
                }
                // Envelope is always { ok: value } on success.
                return parsed ? parsed.ok : null;
            };
        `);

        // Set up module cache for require()
        await jail.set('_moduleCache', new ivm.Reference({}));

        // SECURITY: Create require() function with strict module allowlisting
        // This ivm.Reference is safe - it's a loader function we control
        // CRITICAL: Must be synchronous (not async) - see file header comments for why
        const requireFunc = new ivm.Reference((moduleName: string) => {
            const blockedModules = ['fs', 'path', 'http', 'https', 'net', 'child_process', 'cluster', 'os', 'process', 'axios'];

            // Check if module is blocked
            if (blockedModules.includes(moduleName)) {
                throw new Error(`Security Error: Module '${moduleName}' is not allowed in sandboxed code`);
            }

            // Check if module is allowed
            if (!isModuleAllowed(moduleName)) {
                const allowedList = getAllowedModuleNames().join(', ');
                throw new Error(`Module '${moduleName}' is not available. Allowed modules: ${allowedList}`);
            }

            // Load the library source
            const libSource = getLibrarySource(moduleName);
            if (!libSource) {
                throw new Error(`Failed to load library '${moduleName}'`);
            }

            return libSource;
        });

        await jail.set('_requireLoader', requireFunc);

        // Set up require() and module loading in the isolate
        await context.eval(`
            globalThis._loadedModules = {};

            // Save a reference to eval for controlled module loading
            const _controlledEval = eval;

            globalThis.require = function(moduleName) {
                // Check cache first
                if (globalThis._loadedModules[moduleName]) {
                    return globalThis._loadedModules[moduleName];
                }

                // Load the module source from host
                const moduleSource = _requireLoader.applySync(undefined, [moduleName]);

                // Evaluate the module source to get the exports (controlled eval for library loading only)
                const moduleExports = _controlledEval('(' + moduleSource + ')');

                // Cache it
                globalThis._loadedModules[moduleName] = moduleExports;

                return moduleExports;
            };
        `);

        // Wrap user code to capture output
        // We store output in globalThis._output because script.run() doesn't reliably
        // return the IIFE's return value - we need to extract it from the context
        await jail.set('_output', undefined);

        // Now that the bridge can be awaited, user code may be async. Wrap in
        // an async IIFE that exposes its return value via globalThis._output.
        // The script.run() call below awaits the script completion (the IIFE
        // itself returns a Promise, and with `promise: true` script.run
        // awaits it). Back-compat: code that does NOT use await still works
        // because the wrapper is an async function.
        const wrappedCode = `
            (async function() {
                let output;
                ${params.code}
                globalThis._output = output;
            })();
        `;

        // SECURITY: Compile and execute code with timeout
        // CVE-2022-39266: Never use cachedData from untrusted sources
        // We do NOT pass any cachedData parameter here - only compile from source
        const script = await isolate.compileScript(wrappedCode);
        // `promise: true` ensures script.run awaits the IIFE's returned Promise
        // so await __bridgeCall(...) inside user code works end-to-end.
        await script.run(context, { timeout: timeoutMs, promise: true });

        // SECURITY: Extract output value - use .copySync() to get plain data, not References
        // This ensures no ivm objects leak back to caller
        const outputRef = await jail.get('_output');
        let output: any;
        if (outputRef && typeof outputRef === 'object' && 'copySync' in outputRef) {
            output = outputRef.copySync();
        } else {
            output = outputRef;
        }

        return {
            success: true,
            output,
            logs: logs.length > 0 ? logs : undefined,
            executionTimeMs: Date.now() - startTime
        };

    } catch (error) {
        let errorType: CodeExecutionResult['errorType'] = 'RUNTIME_ERROR';
        let errorMessage = error instanceof Error ? error.message : String(error);

        // Classify error types
        if (errorMessage.includes('Script execution timed out')) {
            errorType = 'TIMEOUT';
            errorMessage = `Code execution exceeded timeout of ${params.timeoutSeconds || 30} seconds`;
        } else if (errorMessage.includes('SyntaxError') || errorMessage.includes('Unexpected')) {
            errorType = 'SYNTAX_ERROR';
        } else if (errorMessage.includes('Security Error')) {
            errorType = 'SECURITY_ERROR';
        } else if (errorMessage.includes('memory limit')) {
            errorType = 'MEMORY_LIMIT';
        }

        return {
            success: false,
            error: errorMessage,
            errorType,
            executionTimeMs: Date.now() - startTime
        };

    } finally {
        // Clean up bridge state — reject any promises that didn't resolve
        // naturally (e.g. execution threw before a bridge call returned).
        const state = bridgeStates.get(requestId);
        if (state) {
            for (const [, entry] of state.pending) {
                entry.reject(new Error('Execution ended with pending bridge call'));
            }
            bridgeStates.delete(requestId);
        }

        // Clean up resources
        if (context) {
            context.release();
        }
        if (isolate) {
            isolate.dispose();
        }
    }
}

/**
 * Format console arguments for logging
 */
function formatConsoleArg(arg: any): string {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);

    try {
        return JSON.stringify(arg, null, 2);
    } catch {
        return String(arg);
    }
}

/**
 * Handle messages from parent process via IPC
 * Messages are automatically JSON serialized/deserialized by Node.js
 */
process.on('message', async (message: ParentInboundMessage) => {
    if (message.type === 'execute') {
        try {
            const result = await executeInIsolate(message.params, message.requestId);
            const response: ResultMessage = {
                type: 'result',
                requestId: message.requestId,
                result
            };
            // SECURITY: Only plain objects are sent via IPC - no References or functions
            process.send!(response);
        } catch (error) {
            const response: ErrorMessage = {
                type: 'error',
                requestId: message.requestId,
                error: error instanceof Error ? error.message : String(error)
            };
            process.send!(response);
        }
        return;
    }

    if (message.type === 'bridge-response') {
        const state = bridgeStates.get(message.requestId);
        if (!state) {
            // Stale response — execution already ended. Drop silently.
            return;
        }
        const entry = state.pending.get(message.callId);
        if (!entry) {
            // Unknown callId — either it was already aborted or we've got a
            // bug. Drop silently; the server-side WorkerPool would re-issue
            // if it still cared.
            return;
        }
        state.pending.delete(message.callId);
        if (message.error) {
            entry.reject(new Error(message.error));
        } else {
            entry.resolve(message.result);
        }
        return;
    }

    if (message.type === 'abort') {
        const state = bridgeStates.get(message.requestId);
        if (!state) {
            return;
        }
        state.aborted = true;
        state.abortReason = message.reason;
        const pending = Array.from(state.pending.entries());
        state.pending.clear();
        for (const [, entry] of pending) {
            entry.reject(new Error(message.reason || 'Execution aborted'));
        }
        // Note: we do NOT dispose the isolate from here. isolated-vm's
        // `script.run(..., { timeout })` will still terminate the script
        // when its own deadline fires, and rejecting the pending bridge
        // calls is enough for cooperative user code to unwind.
        return;
    }
});

// Export nothing — this file is only executed as a child process entrypoint.
// The ParentOutboundMessage type is exported via the types module instead.
void ({} as ParentOutboundMessage);

// Signal that worker is ready to accept work
process.send!({ type: 'ready' });
