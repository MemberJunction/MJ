import { configInfo, currentWorkingDirectory } from "../Config/config";
import { LogError, LogStatus, SeverityType, FormatFileMessage, FormatConsoleMessage } from '@memberjunction/core'
import { MJGlobal, RegisterClass } from "@memberjunction/global";
import path from 'path';

/**
 * Base class for logging, you can sub-class this class to create your own logger and override the logError and logStatus methods if desired.
 * The default behavior in the base class is to use the LogError/LogStatus functions from the @memberjunction/core package to log to the console and to a log file if configured in the config.json file.
 */
@RegisterClass(LoggerBase)
export class LoggerBase {
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
      if (configInfo.logging.console) {
         if (isError){
            LogError(message, null!, ...args);
         }
         else{
            LogStatus(message, null!, ...args);
         }
      }
   }
   protected logToFile(message: string, isError: boolean, ...args: any[]) {
      if (configInfo.logging.log) {
         if (configInfo.logging.logFile === null || configInfo.logging.logFile === undefined || configInfo.logging.logFile === '') {
            LogError('ERROR: No log file specified in config.json', null!, ...args);
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