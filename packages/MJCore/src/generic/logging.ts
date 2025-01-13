let fs: any;

if (runningOnNode()) {
    try {
        fs = eval("require('fs')"); // wrap the require in eval to avoid bundling attempt and also avoid runtime scanning issues in the browser.
    } catch (err) {
        // shouldn't get here since we're checking for the node variables above, but have this
        // try/catch block just in case.
        // fs module is not available, normal in browser situation, we can't log to "Files" as that doesn't make sense in browser
    }
}

export function LogError(message: any, logToFileName: string | null = null, ...args: any[]) {
    if (logToFileName !== null && logToFileName !== undefined && logToFileName.length >= 0)
        logToFile(message, true, logToFileName, ...args)
    else
        logToConsole(message, true, ...args)
}

export function LogStatus(message: any, logToFileName: string = null, ...args: any[]) {
    if (logToFileName !== null && logToFileName !== undefined && logToFileName.length >= 0)
        logToFile(message, false, logToFileName, ...args)
    else
        logToConsole(message, false, ...args)
}

function logToConsole(message: any, isError: boolean, ...args: any[]) {
    if (isError) // always do console.error() for errors even in production
        console.error(message, ...args);
    else if (!GetProductionStatus()) // only do console.log() if we're not in production
        console.log(message, ...args);
}
function logToFile(message, isError: boolean, logToFileName: string, ...args: any[]) {
    if (fs === null || fs === undefined) {
        console.error('Attempting to log to file, but fs module is not available, logging to console instead');
        logToConsole(message, isError, ...args);
    }
    else
        fs.appendFileSync(logToFileName, `${isError ? 'ERROR' : 'STATUS'} (${new Date()}: ${message}${args && args.length > 0 && args.join('').length > 0 ? '\n   ARGS' + args.join('\n   ')  : ''}` + '\n');
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
