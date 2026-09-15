import { configInfo, currentWorkingDirectory } from "../Config/config";
import { LogError, LogStatus, SeverityType, FormatFileMessage, FormatConsoleMessage } from '@memberjunction/core'
import { MJGlobal, RegisterClass } from "@memberjunction/global";
import path from 'path';
import ora from 'ora-classic';

/**
 * Output stream the CodeGen spinner writes to. Defaults to stdout for normal
 * human runs. The pluggable CLI (`mj codegen --format=json`) redirects this to
 * stderr via {@link setCodeGenSpinnerStream} so stdout carries only the
 * machine-readable result.
 */
let _spinnerStream: NodeJS.WriteStream = process.stdout;

/** Redirect the CodeGen spinner to {@link stream} (e.g. stderr in JSON mode). */
export function SetCodeGenSpinnerStream(stream: NodeJS.WriteStream): void {
   _spinnerStream = stream;
}

/** @deprecated Use {@link SetCodeGenSpinnerStream}. */
export function setCodeGenSpinnerStream(stream: NodeJS.WriteStream): void {
   return SetCodeGenSpinnerStream(stream);
}

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
   /** The message for the currently-spinning step, without the live elapsed suffix. */
   private _spinnerBaseMessage: string = '';
   /** Wall-clock start (ms) of the current step, used for the live elapsed timer. */
   private _spinnerStart: number = 0;
   /** Interval handle that re-renders the live elapsed timer onto the spinner. */
   private _tickHandle: NodeJS.Timeout | null = null;

   private get isVerbose(): boolean {
      // Lazy check - configInfo might not be available during module initialization
      return configInfo?.verboseOutput ?? false;
   }

   private ensureSpinner(): void {
      if (!this.isVerbose && !this._spinner) {
         this._spinner = ora({ stream: _spinnerStream });
      }
   }

   /** Format an elapsed duration in ms as a compact seconds string, e.g. "3.2s". */
   private formatElapsed(ms: number): string {
      return `${(ms / 1000).toFixed(1)}s`;
   }

   /**
    * Begin (or restart) the live elapsed timer for the current step. Each call
    * resets the clock so the timer reflects how long the CURRENT message/sub-step
    * has been running, not the whole spinner's lifetime. The interval is unref'd
    * so it never keeps the process alive on its own.
    */
   private startTick(): void {
      this.stopTick();
      this._spinnerStart = Date.now();
      if (this._spinner) {
         this._tickHandle = setInterval(() => {
            if (this._spinner) {
               const elapsed = this.formatElapsed(Date.now() - this._spinnerStart);
               this._spinner.text = `${this._spinnerBaseMessage} (${elapsed})`;
            }
         }, 100);
         this._tickHandle.unref?.();
      }
   }

   /** Stop the live elapsed timer if one is running. */
   private stopTick(): void {
      if (this._tickHandle) {
         clearInterval(this._tickHandle);
         this._tickHandle = null;
      }
   }

   /**
    * Start a spinner with a message (non-verbose mode only)
    */
   public StartSpinner(message: string): void {
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinnerBaseMessage = message;
            this._spinner.start(message);
            this.startTick();
         } else {
            // Fallback if spinner creation failed
            console.log(`🔄 ${message}`);
         }
      } else {
         this.LogStatus(message, SeverityType.Info);
      }
   }

   /** @deprecated Use {@link StartSpinner}. */
   public startSpinner(message: string): void {
      return this.StartSpinner(message);
   }

   /**
    * Update spinner text (non-verbose mode only). Resets the live elapsed timer so
    * the displayed duration tracks the new sub-step rather than the prior one.
    */
   public UpdateSpinner(message: string): void {
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinnerBaseMessage = message;
            this._spinner.text = message;
            this.startTick();
         } else {
            // Fallback if spinner creation failed
            console.log(`🔄 ${message}`);
         }
      } else {
         this.LogStatus(message, SeverityType.Info);
      }
   }

   /** @deprecated Use {@link UpdateSpinner}. */
   public updateSpinner(message: string): void {
      return this.UpdateSpinner(message);
   }

   /**
    * Stop spinner with success message
    */
   public SucceedSpinner(message?: string): void {
      this.stopTick();
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinner.succeed(message);
         } else if (message) {
            // Fallback if spinner creation failed
            console.log(`✅ ${message}`);
         }
      } else if (message) {
         this.LogStatus(`✓ ${message}`, SeverityType.Info);
      }
   }

   /** @deprecated Use {@link SucceedSpinner}. */
   public succeedSpinner(message?: string): void {
      return this.SucceedSpinner(message);
   }

   /**
    * Stop spinner with failure message
    */
   public FailSpinner(message?: string): void {
      this.stopTick();
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinner.fail(message);
         } else if (message) {
            // Fallback if spinner creation failed
            console.log(`❌ ${message}`);
         }
      } else if (message) {
         this.LogError(`✗ ${message}`, SeverityType.Critical);
      }
   }

   /** @deprecated Use {@link FailSpinner}. */
   public failSpinner(message?: string): void {
      return this.FailSpinner(message);
   }

   /**
    * Stop spinner with warning message
    */
   public WarnSpinner(message?: string): void {
      this.stopTick();
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinner.warn(message);
         } else if (message) {
            // Fallback if spinner creation failed
            console.log(`⚠️ ${message}`);
         }
      } else if (message) {
         this.LogError(`⚠ ${message}`, SeverityType.Warning);
      }
   }

   /** @deprecated Use {@link WarnSpinner}. */
   public warnSpinner(message?: string): void {
      return this.WarnSpinner(message);
   }

   /**
    * Stop spinner without status
    */
   public StopSpinner(): void {
      this.stopTick();
      if (!this.isVerbose) {
         this.ensureSpinner();
         if (this._spinner) {
            this._spinner.stop();
         }
      }
   }

   /** @deprecated Use {@link StopSpinner}. */
   public stopSpinner(): void {
      return this.StopSpinner();
   }

   /**
    * Logs an error message to the console and to the log file if configured
    * @param message
    * @param args
    */
   public LogError(message: string, severity: SeverityType, ...args: any[]) {
      const consoleMessage: string = FormatConsoleMessage(message, severity);
      const fileMessage: string = FormatFileMessage(message, severity);
      this.logToConsole(consoleMessage, true, ...args);
      this.logToFile(fileMessage, true, ...args);
   }

   /** @deprecated Use {@link LogError}. */
   public logError(message: string, severity: SeverityType, ...args: any[]) {
      return this.LogError(message, severity, ...args);
   }

   /**
    * Logs a status message to the console and to the log file if configured
    * @param message
    * @param args
    */
   public LogStatus(message: string, severity: SeverityType, ...args: any[]) {
      const consoleMessage: string = FormatConsoleMessage(message, severity);
      const fileMessage: string = FormatFileMessage(message, severity);
      this.logToConsole(consoleMessage, false, ...args);
      this.logToFile(fileMessage, false, ...args);
   }

   /** @deprecated Use {@link LogStatus}. */
   public logStatus(message: string, severity: SeverityType, ...args: any[]) {
      return this.LogStatus(message, severity, ...args);
   }

   /**
    * Helper function to log a message with a specified severity and whether it is an error
    * @param message The message to log
    * @param severity The severity of the message
    * @param isError Whether to treat this message as an error
    * @param args Any additional arguments to log
    */
   public LogMessage(message: string, severity: SeverityType, isError: boolean, ...args: any[]) {
      const consoleMessage: string = FormatConsoleMessage(message, severity);
      const fileMessage: string = FormatFileMessage(message, severity);
      this.logToConsole(consoleMessage, isError, ...args);
      this.logToFile(fileMessage, isError, ...args);
   }

   /** @deprecated Use {@link LogMessage}. */
   public logMessage(message: string, severity: SeverityType, isError: boolean, ...args: any[]) {
      return this.LogMessage(message, severity, isError, ...args);
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

export function LogWarning(message: string, ...args: any[]) {
   return _logger.logError(message, SeverityType.Warning, ...args);
}

/** @deprecated Use {@link LogWarning}. */
export function logWarning(message: string, ...args: any[]) {
   return LogWarning(message, ...args);
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
export function LogMessage(message: string, severity: SeverityType, isError = false, ...args: any[]): void {
   return _logger.logMessage(message, severity, isError, ...args);
}

/** @deprecated Use {@link LogMessage}. */
export function logMessage(message: string, severity: SeverityType, isError = false, ...args: any[]): void {
   return LogMessage(message, severity, isError, ...args);
}

// Spinner management functions
export function StartSpinner(message: string): void {
   return _logger.startSpinner(message);
}

/** @deprecated Use {@link StartSpinner}. */
export function startSpinner(message: string): void {
   return StartSpinner(message);
}

export function UpdateSpinner(message: string): void {
   return _logger.updateSpinner(message);
}

/** @deprecated Use {@link UpdateSpinner}. */
export function updateSpinner(message: string): void {
   return UpdateSpinner(message);
}

export function SucceedSpinner(message?: string): void {
   return _logger.succeedSpinner(message);
}

/** @deprecated Use {@link SucceedSpinner}. */
export function succeedSpinner(message?: string): void {
   return SucceedSpinner(message);
}

export function FailSpinner(message?: string): void {
   return _logger.failSpinner(message);
}

/** @deprecated Use {@link FailSpinner}. */
export function failSpinner(message?: string): void {
   return FailSpinner(message);
}

export function WarnSpinner(message?: string): void {
   return _logger.warnSpinner(message);
}

/** @deprecated Use {@link WarnSpinner}. */
export function warnSpinner(message?: string): void {
   return WarnSpinner(message);
}

export function StopSpinner(): void {
   return _logger.stopSpinner();
}

/** @deprecated Use {@link StopSpinner}. */
export function stopSpinner(): void {
   return StopSpinner();
}
