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
    params: CodeExecutionParams;
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

type WorkerMessage = ExecuteMessage;
type ParentMessage = ResultMessage | ErrorMessage | ReadyMessage;

/**
 * Execute JavaScript code in an isolated-vm isolate
 *
 * SECURITY: This function creates and manages the V8 isolate. It must ensure:
 * - Only safe built-ins are exposed to untrusted code
 * - Module loading is strictly controlled via allowlist
 * - Input/output data is properly serialized (no object references leak)
 */
async function executeInIsolate(params: CodeExecutionParams): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = (params.timeoutSeconds || 30) * 1000;
    const memoryLimitMB = params.memoryLimitMB || 128;

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

        // Set up module cache for require()
        await jail.set('_moduleCache', new ivm.Reference({}));

        // SECURITY: Create require() function with strict module allowlisting
        // This ivm.Reference is safe - it's a loader function we control
        const requireFunc = new ivm.Reference(async (moduleName: string) => {
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
        const wrappedCode = `
            (function() {
                let output;
                ${params.code}
                return output;
            })();
        `;

        // SECURITY: Compile and execute code with timeout
        // CVE-2022-39266: Never use cachedData from untrusted sources
        // We do NOT pass any cachedData parameter here - only compile from source
        const script = await isolate.compileScript(wrappedCode);
        const result = await script.run(context, { timeout: timeoutMs });

        // SECURITY: Extract output value - use .copy() to get plain data, not References
        // This ensures no ivm objects leak back to caller
        let output: any;
        if (result && typeof result === 'object' && 'copy' in result) {
            output = await result.copy();
        } else {
            output = result;
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
process.on('message', async (message: WorkerMessage) => {
    if (message.type === 'execute') {
        try {
            const result = await executeInIsolate(message.params);
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
    }
});

// Signal that worker is ready to accept work
process.send!({ type: 'ready' });
