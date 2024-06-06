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

export function LogError(message: any, logToFileName: string = null, ...args: any[]) {
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
            return `${colors.fg.white}${message}${colors.reset}`;
        case 'Warning':
            return `${colors.fg.yellow}${message}${colors.reset}`;
        case 'Critical':
            return `${colors.fg.red}${message}${colors.reset}`;
        default:
            return message;
    }
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

export const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",
    
    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        gray: "\x1b[90m",
        crimson: "\x1b[38m" // Scarlet
    },
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
        gray: "\x1b[100m",
        crimson: "\x1b[48m"
    }
};