/**
 * Parameters for code execution
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
