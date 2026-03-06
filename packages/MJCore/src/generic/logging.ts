import debug, { Debugger } from 'debug';
import { MJGlobal } from '@memberjunction/global';
import { IFileSystemProvider } from './interfaces';

// Create the default logger with the "MJGlobal" namespace.
const __defaultLogger: Debugger = debug('MJGlobal');

/**
 * Logs a debug message using the default 'MJGlobal' namespace logger.
 *
 * This function wraps the debug library's logger for the 'MJGlobal' namespace.
 * It accepts any number of arguments and forwards them directly to the underlying
 * debug logger. This provides a simple, out-of-the-box logging function for the MJGlobal library.
 *
 * @param {...any} args - The messages or objects to be logged.
 *
 * @example
 * LogDebug('Initialization complete, version %s', '1.0.0');
 */
export function LogDebug(...args: any[]): void {
  // Using apply to avoid spread argument type issues.
  __defaultLogger.apply(undefined, args);
}

/**
 * Options for the enhanced LogErrorEx function
 */
export interface LogErrorOptions {
    /** The error message */
    message: string;
    
    /** Optional file name to log to */
    logToFileName?: string;
    
    /** Additional arguments to pass to console.error (varargs) */
    additionalArgs?: any[];
    
    /** Error severity level */
    severity?: 'warning' | 'error' | 'critical';
    
    /** Category for filtering logs */
    category?: string;
    
    /** The actual error object */
    error?: Error;
    
    /** Additional metadata about the error */
    metadata?: Record<string, any>;
    
    /** Whether to include stack trace */
    includeStack?: boolean;
}

/**
 * Enhanced error logging function with structured error information.
 * 
 * Provides rich error logging capabilities including severity levels, categories,
 * error objects with stack traces, metadata, and varargs support.
 * 
 * @param options - Error logging options or a simple string message for backward compatibility
 * 
 * @example
 * // Simple string message
 * LogErrorEx('Something went wrong');
 * 
 * @example
 * // With error object and metadata
 * LogErrorEx({
 *   message: 'Failed to process request',
 *   error: new Error('Network timeout'),
 *   severity: 'critical',
 *   category: 'NetworkError',
 *   metadata: { 
 *     url: 'https://api.example.com',
 *     timeout: 5000 
 *   }
 * });
 * 
 * @example
 * // With additional arguments (varargs)
 * LogErrorEx({
 *   message: 'Multiple values failed',
 *   additionalArgs: [value1, value2, value3]
 * });
 */
export function LogErrorEx(options: LogErrorOptions | string): void {
    // Handle simple string message for backward compatibility
    if (typeof options === 'string') {
        logToConsole(options, true);
        return;
    }
    
    // Build the error message with optional metadata
    let fullMessage = options.message;
    
    // Add category if provided
    if (options.category) {
        fullMessage = `[${options.category}] ${fullMessage}`;
    }
    
    // Add severity if not default
    if (options.severity && options.severity !== 'error') {
        fullMessage = `[${options.severity.toUpperCase()}] ${fullMessage}`;
    }
    
    // Add error details if provided
    if (options.error) {
        fullMessage += `\n  Error: ${options.error.message}`;
        if (options.includeStack !== false && options.error.stack) {
            fullMessage += `\n  Stack: ${options.error.stack}`;
        }
    }
    
    // Add metadata if provided
    if (options.metadata && Object.keys(options.metadata).length > 0) {
        fullMessage += '\n  Metadata: ' + JSON.stringify(options.metadata, null, 2);
    }
    
    // Log the error using the internal logging mechanism
    if (options.logToFileName !== null && options.logToFileName !== undefined && options.logToFileName.length >= 0) {
        logToFile(fullMessage, true, options.logToFileName, ...(options.additionalArgs || []));
    } else {
        logToConsole(fullMessage, true, ...(options.additionalArgs || []));
    }
}

export function LogError(message: any, logToFileName: string | null = null, ...args: any[]) {
    // Use LogErrorEx internally
    LogErrorEx({
        message: String(message),
        logToFileName,
        additionalArgs: args
    });
}

/**
 * Options for the enhanced LogStatusEx function
 */
export interface LogStatusOptions {
    /** The message to log */
    message: string;
    
    /** Optional file name to log to */
    logToFileName?: string;
    
    /** Additional arguments to pass to console.log (varargs) */
    additionalArgs?: any[];
    
    /** If true, only logs when verbose mode is enabled */
    verboseOnly?: boolean;
    
    /** Optional custom function to check if verbose logging is enabled */
    isVerboseEnabled?: () => boolean;
    
    /** Severity level for future extensibility */
    severity?: SeverityType;
    
    /** Category for filtering logs */
    category?: string;
}

/**
 * Enhanced status logging function with verbose control and extensibility.
 * 
 * Provides flexible logging with verbose mode support, custom verbose checks,
 * categories, severity levels, and varargs support. Messages can be conditionally
 * logged based on global or custom verbose settings.
 * 
 * @param options - Logging options or a simple string message for backward compatibility
 * 
 * @example
 * // Simple string message
 * LogStatusEx('Operation completed');
 * 
 * @example
 * // Verbose-only message with global check
 * LogStatusEx({
 *   message: 'Detailed trace information',
 *   verboseOnly: true
 * });
 * 
 * @example
 * // With custom verbose check and additional args
 * LogStatusEx({
 *   message: 'Processing items:',
 *   verboseOnly: true,
 *   isVerboseEnabled: () => params.verbose === true,
 *   additionalArgs: [item1, item2, item3]
 * });
 * 
 * @example
 * // With category and file logging
 * LogStatusEx({
 *   message: 'Batch processing complete',
 *   category: 'BatchJob',
 *   logToFileName: '/logs/batch.log'
 * });
 */
export function LogStatusEx(options: LogStatusOptions | string): void {
    // Handle simple string message for backward compatibility
    if (typeof options === 'string') {
        logToConsole(options, false);
        return;
    }
    
    // Check if this is a verbose-only message
    if (options.verboseOnly) {
        const checkVerbose = options.isVerboseEnabled || IsVerboseLoggingEnabled;
        if (!checkVerbose()) {
            return; // Skip verbose messages when verbose mode is off
        }
    }
    
    // Log the message using the internal logging mechanism
    if (options.logToFileName !== null && options.logToFileName !== undefined && options.logToFileName.length >= 0) {
        logToFile(options.message, false, options.logToFileName, ...(options.additionalArgs || []));
    } else {
        logToConsole(options.message, false, ...(options.additionalArgs || []));
    }
}

/**
 * Checks if verbose logging is enabled globally
 * Works in both Node.js and Browser environments
 * @returns true if verbose logging is enabled
 */
export function IsVerboseLoggingEnabled(): boolean {
    // Node.js environment
    if (runningOnNode()) {
        const verbose = process.env.MJ_VERBOSE;
        if (verbose !== undefined) {
            return ['true', '1', 'yes'].includes(verbose.toLowerCase());
        }
    }
    
    // Browser environment
    if (runningInBrowser()) {
        // Check global variable
        if ((window as any).MJ_VERBOSE !== undefined) {
            return (window as any).MJ_VERBOSE === true;
        }
        
        // Check localStorage
        try {
            const stored = localStorage.getItem('MJ_VERBOSE');
            if (stored !== null) {
                return ['true', '1', 'yes'].includes(stored.toLowerCase());
            }
        } catch {
            // localStorage might be blocked
        }
        
        // Check URL parameter
        if (typeof URLSearchParams !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const verbose = params.get('MJ_VERBOSE');
            if (verbose) {
                return ['true', '1', 'yes'].includes(verbose.toLowerCase());
            }
        }
    }
    
    return false; // Default to non-verbose
}

/**
 * Sets verbose logging mode in browser environments
 * @param enabled Whether to enable verbose logging
 */
export function SetVerboseLogging(enabled: boolean): void {
    if (runningInBrowser()) {
        (window as any).MJ_VERBOSE = enabled;
        try {
            localStorage.setItem('MJ_VERBOSE', enabled ? 'true' : 'false');
        } catch {
            // localStorage might be blocked
        }
    }
}

export function LogStatus(message: any, logToFileName: string = null, ...args: any[]) {
    // Use LogStatusEx internally
    LogStatusEx({
        message: String(message),
        logToFileName,
        additionalArgs: args,
        verboseOnly: false
    });
}

function logToConsole(message: any, isError: boolean, ...args: any[]) {
    if (isError) // always do console.error() for errors even in production
        console.error(message, ...args);
    else if (!GetProductionStatus()) // only do console.log() if we're not in production
        console.log(message, ...args);
}
/**
 * Retrieves the FileSystemProvider from the global Metadata provider.
 * Accesses MJGlobal's object store directly (rather than importing Metadata)
 * to avoid circular dependency — logging.ts is imported by many core modules.
 */
function getFileSystemProvider(): IFileSystemProvider | null {
    const g = MJGlobal.Instance.GetGlobalObjectStore();
    if (!g) return null;
    const provider = g['MJ_MetadataProvider'];
    return provider?.FileSystemProvider ?? null;
}

function logToFile(message: string, isError: boolean, logToFileName: string, ...args: unknown[]) {
    const provider = getFileSystemProvider();
    if (!provider) {
        console.error('Attempting to log to file, but FileSystemProvider is not available, logging to console instead');
        logToConsole(message, isError, ...args);
        return;
    }

    const formattedMessage = `${isError ? 'ERROR' : 'STATUS'} (${new Date()}: ${message}${args && args.length > 0 && args.join('').length > 0 ? '\n   ARGS' + args.join('\n   ') : ''}` + '\n';
    provider.AppendToFile(logToFileName, formattedMessage).catch(err => {
        console.error('Failed to log to file:', err);
        logToConsole(message, isError, ...args);
    });
}

let _productionStatus: boolean = null;
export function GetProductionStatus(): boolean {
    if (_productionStatus)
        return _productionStatus;
    else {
        if (runningOnNode()) {
            return (process.env.NODE_ENV === 'production')
        }
        else if (runningInBrowser()) {
            // no status set if we get here, so return false, default to false to be safe and log stuff
            // for debug scenarios on staging environments/etc.
            return false;
        }
    }
}

export function SetProductionStatus(isProduction: boolean) {
    _productionStatus = isProduction;
}

function runningInBrowser(): boolean {
    return (typeof window !== 'undefined' && window.location !== null)
}

function runningOnNode(): boolean {
    return (typeof process !== 'undefined' && process.versions !== null && process.versions.node !== null)
}

export function FormatConsoleMessage(message: string, serverity: SeverityType): string {
    switch (serverity) {
        case 'Trace':
        case 'Debug':
        case 'Info':
            return FormatConsoleMessageInternal(ConsoleColor.white, message);
        case 'Warning':
            return FormatConsoleMessageInternal(ConsoleColor.yellow, message);
        case 'Critical':
            return FormatConsoleMessageInternal(ConsoleColor.red, message);
        default:
            return message;
    }
}

function FormatConsoleMessageInternal(color: ConsoleColor, message: string) {
    return `\r\x1b[${getAnsiColorCode(ConsoleColor.white)}m${message}\x1b[0m`;
}

export function FormatFileMessage(message: string, serverity: SeverityType): string {
    switch (serverity) {
        case 'Trace':
            return `[Trace] ${message}`;
        case 'Debug':
            return `[Debug] ${message}`;
        case 'Info':
            return `[Info] ${message}`;
        case 'Warning':
            return `[Warning] ${message}`;
        case 'Critical':
            return `[Critical] ${message}`;
        default:
            return message;
    }
}

export const SeverityType = {
    Trace: 'Trace',
    Debug: 'Debug',
    Info: 'Info',
    Warning: 'Warning',
    Critical: 'Critical'
} as const;

export type SeverityType = typeof SeverityType[keyof typeof SeverityType];

/**
 * Enum of console colors that can be used to update the console line color.
 */
export const ConsoleColor = {
    black: 'black',
    red: 'red',
    green: 'green',
    yellow: 'yellow',
    blue: 'blue',
    magenta: 'magenta',
    cyan: 'cyan',
    white: 'white',
    gray: 'gray',
    crimson: 'crimson',
} as const;
type ConsoleColor = typeof ConsoleColor[keyof typeof ConsoleColor];


/**
 * Helper function to get the ANSI color code for the given console color.
 * @param color
 */
export function getAnsiColorCode(color: ConsoleColor): number {
    switch (color) {
        case ConsoleColor.black: return 30;
        case ConsoleColor.red: return 31;
        case ConsoleColor.green: return 32;
        case ConsoleColor.yellow: return 33;
        case ConsoleColor.blue: return 34;
        case ConsoleColor.magenta: return 35;
        case ConsoleColor.cyan: return 36;
        case ConsoleColor.white: return 37;
        case ConsoleColor.gray: return 90;
        case ConsoleColor.crimson: return 38;
        default: return 37;
    }
}

/**
 * Utility function that udpates the current console line with the provided message and color.
 * @param message
 * @param color
 */
export function UpdateCurrentConsoleLine(message: string, color: ConsoleColor = ConsoleColor.white) {
    if (runningOnNode()) {
        // Running in Node.js environment
        //console.log(`\r\x1b[${getAnsiColorCode(color)}m${message}\x1b[0m`);
        //process.stdout.write(`\r\x1b[${getAnsiColorCode(color)}m${message}\x1b[0m`);
//        console.log(`\x1b[2K\r\x1b[${getAnsiColorCode(color)}m${message}\x1b[0m`);
        console.log(`\x1b[${getAnsiColorCode(color)}m${message}\x1b[0m`);
    }
    else {
        // Running in browser environment
        console.log(`\r%c${message}`, `color: ${color}`);
    }
}

export function UpdateCurrentConsoleProgress(message: string, current: number, total: number, color: ConsoleColor = ConsoleColor.white) {
    // show the message, current count of total count, and % complete formated as 0.0%
    UpdateCurrentConsoleLine(`${message} ${current} of ${total} (${(current/total*100).toFixed(1)}%)`, color);
}
