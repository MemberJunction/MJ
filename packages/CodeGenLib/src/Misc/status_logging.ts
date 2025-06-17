import { configInfo, currentWorkingDirectory } from "../Config/config";
import { LogError, LogStatus, SeverityType, FormatFileMessage, FormatConsoleMessage } from '@memberjunction/core'
import { MJGlobal, RegisterClass } from "@memberjunction/global";
import path from 'path';
import ora from 'ora-classic';

/**
 * Base class for logging, you can sub-class this class to create your own logger and override the logError and logStatus methods if desired.
 * The default behavior in the base class is to use the LogError/LogStatus functions from the @memberjunction/core package to log to the console and to a log file if configured in the config.json file.
 * 
 * Supports two modes:
 * - Verbose mode: Full console output with detailed messages  
 * - Normal mode: Clean spinner-based status updates
 */
export class LoggerBase {
   private _spinner: any = null;

   private get isVerbose(): boolean {
      // Lazy check - configInfo might not be available during module initialization
      return configInfo?.verboseOutput ?? false;
   }

   private ensureSpinner(): void {
      if (!this.isVerbose && !this._spinner) {
         this._spinner = ora();
      }
   }

   /**
    * Start a spinner with a message (non-verbose mode only)
    */
   public startSpinner(message: string): void {
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinner.start(message);
         } else {
            // Fallback if spinner creation failed
            console.log(`🔄 ${message}`);
         }
      } else {
         this.logStatus(message, SeverityType.Info);
      }
   }

   /**
    * Update spinner text (non-verbose mode only)
    */
   public updateSpinner(message: string): void {
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinner.text = message;
         } else {
            // Fallback if spinner creation failed
            console.log(`🔄 ${message}`);
         }
      } else {
         this.logStatus(message, SeverityType.Info);
      }
   }

   /**
    * Stop spinner with success message
    */
   public succeedSpinner(message?: string): void {
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinner.succeed(message);
         } else if (message) {
            // Fallback if spinner creation failed
            console.log(`✅ ${message}`);
         }
      } else if (message) {
         this.logStatus(`✓ ${message}`, SeverityType.Info);
      }
   }

   /**
    * Stop spinner with failure message
    */
   public failSpinner(message?: string): void {
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinner.fail(message);
         } else if (message) {
            // Fallback if spinner creation failed
            console.log(`❌ ${message}`);
         }
      } else if (message) {
         this.logError(`✗ ${message}`, SeverityType.Critical);
      }
   }

   /**
    * Stop spinner with warning message
    */
   public warnSpinner(message?: string): void {
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinner.warn(message);
         } else if (message) {
            // Fallback if spinner creation failed
            console.log(`⚠️ ${message}`);
         }
      } else if (message) {
         this.logError(`⚠ ${message}`, SeverityType.Warning);
      }
   }

   /**
    * Stop spinner without status
    */
   public stopSpinner(): void {
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinner.stop();
         }
      }
   }

   /**
    * Logs an error message to the console and to the log file if configured
    * @param message
    * @param args
    */
   public logError(message: string, severity: SeverityType, ...args: any[]) {
      const consoleMessage: string = FormatConsoleMessage(message, severity);
      const fileMessage: string = FormatFileMessage(message, severity);
      this.logToConsole(consoleMessage, true, ...args);
      this.logToFile(fileMessage, true, ...args);
   }

   /**
    * Logs a status message to the console and to the log file if configured
    * @param message
    * @param args
    */
   public logStatus(message: string, severity: SeverityType, ...args: any[]) {
      const consoleMessage: string = FormatConsoleMessage(message, severity);
      const fileMessage: string = FormatFileMessage(message, severity);
      this.logToConsole(consoleMessage, false, ...args);
      this.logToFile(fileMessage, false, ...args);
   }

   /**
    * Helper function to log a message with a specified severity and whether it is an error
    * @param message The message to log
    * @param severity The severity of the message
    * @param isError Whether to treat this message as an error
    * @param args Any additional arguments to log
    */
   public logMessage(message: string, severity: SeverityType, isError: boolean, ...args: any[]) {
      const consoleMessage: string = FormatConsoleMessage(message, severity);
      const fileMessage: string = FormatFileMessage(message, severity);
      this.logToConsole(consoleMessage, isError, ...args);
      this.logToFile(fileMessage, isError, ...args);
   }

   protected logToConsole(message: string, isError: boolean, ...args: any[]) {
      // Only log to console in verbose mode or for errors
      if (configInfo?.logging?.console && (this.isVerbose || isError)) {
         if (isError){
            LogError(message, null!, ...args);
         }
         else{
            LogStatus(message, null!, ...args);
         }
      }
   }
   protected logToFile(message: string, isError: boolean, ...args: any[]) {
      if (configInfo?.logging?.log) {
         if (configInfo.logging.logFile === null || configInfo.logging.logFile === undefined || configInfo.logging.logFile === '') {
            LogError('ERROR: No log file specified in config', null!, ...args);
         }
         else  {
            const file: string = path.join(currentWorkingDirectory, configInfo.logging.logFile);
            if (isError){
               LogError(message, file, ...args);
            }
            else{
               LogStatus(message, file, ...args);
            }
         }
      }
   }
}

// use the classes below so that it is easier for external code to sub-class the logger if desired
const _logger: LoggerBase = MJGlobal.Instance.ClassFactory.CreateInstance<LoggerBase>(LoggerBase)!;

/**
 * Wrapper for the LoggerBase.logError method
 */
export function logError(message: string, ...args: any[]) {
   return _logger.logError(message, SeverityType.Critical, ...args);
}

export function logWarning(message: string, ...args: any[]) {
   return _logger.logError(message, SeverityType.Warning, ...args);
}

/**
 * Wrapper for the LoggerBase.logStatus method
 */
export function logStatus(message: string, ...args: any[]) {
   return _logger.logStatus(message, SeverityType.Info, ...args);
}

/**
 * Wrapper for the LoggerBase.logMessage method
 */
export function logMessage(message: string, severity: SeverityType, isError = false, ...args: any[]): void {
   return _logger.logMessage(message, severity, isError, ...args);
}

// Spinner management functions
export function startSpinner(message: string): void {
   return _logger.startSpinner(message);
}

export function updateSpinner(message: string): void {
   return _logger.updateSpinner(message);
}

export function succeedSpinner(message?: string): void {
   return _logger.succeedSpinner(message);
}

export function failSpinner(message?: string): void {
   return _logger.failSpinner(message);
}

export function warnSpinner(message?: string): void {
   return _logger.warnSpinner(message);
}

export function stopSpinner(): void {
   return _logger.stopSpinner();
}
