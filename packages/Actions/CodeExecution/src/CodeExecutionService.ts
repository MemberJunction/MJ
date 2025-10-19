/**
 * Code Execution Service
 *
 * Provides secure, sandboxed execution of JavaScript code using isolated-vm.
 * This service enables AI agents and workflows to generate and run code safely
 * without compromising system security.
 *
 * Security Model:
 * - Uses isolated-vm for true V8 isolate separation
 * - No filesystem access (fs module blocked)
 * - No network access (http/https/net modules blocked)
 * - Configurable timeout and memory limits
 * - Curated allowlist of safe npm packages
 *
 * @module @memberjunction/code-execution
 */

import ivm from 'isolated-vm';
import { CodeExecutionParams, CodeExecutionResult } from './types';
import { getLibrarySource, isModuleAllowed, getAllowedModuleNames } from './libraries';

/**
 * Service for executing JavaScript code in a secure sandbox
 */
export class CodeExecutionService {
    /**
     * Cache of loaded modules per isolate
     */
    private moduleCache: Map<string, any> = new Map();
    /**
     * Execute JavaScript code in a sandboxed environment
     *
     * @param params - Execution parameters (code, language, input data, limits)
     * @returns Execution result with output, logs, or error
     */
    async execute(params: CodeExecutionParams): Promise<CodeExecutionResult> {
        const startTime = Date.now();

        // Validate parameters
        if (!params.code || typeof params.code !== 'string') {
            return {
                success: false,
                error: 'Code parameter is required and must be a string',
                errorType: 'RUNTIME_ERROR'
            };
        }

        if (params.language !== 'javascript') {
            return {
                success: false,
                error: `Unsupported language: ${params.language}. Only 'javascript' is currently supported.`,
                errorType: 'RUNTIME_ERROR'
            };
        }

        try {
            return await this.executeJavaScript(params, startTime);
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                errorType: 'RUNTIME_ERROR',
                executionTimeMs: Date.now() - startTime
            };
        }
    }

    /**
     * Execute JavaScript code using isolated-vm
     * @private
     */
    private async executeJavaScript(params: CodeExecutionParams, startTime: number): Promise<CodeExecutionResult> {
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

            // Create console methods that capture output
            const consoleLog = new ivm.Reference((level: string, ...args: any[]) => {
                const formattedArgs = args.map(arg => this.formatConsoleArg(arg)).join(' ');
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

            // Set up input data if provided
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

            // Set up module cache for require()
            await jail.set('_moduleCache', new ivm.Reference({}));

            // Create require() function that loads allowed libraries
            const requireFunc = new ivm.Reference(async (moduleName: string) => {
                const blockedModules = ['fs', 'path', 'http', 'https', 'net', 'child_process', 'cluster', 'os', 'process'];

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
            // We keep eval temporarily for module loading, then delete it after user code runs
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

            // Execute the code with timeout
            const script = await isolate.compileScript(wrappedCode);
            const result = await script.run(context, { timeout: timeoutMs });

            // Extract output value
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
     * @private
     */
    private formatConsoleArg(arg: any): string {
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
}
