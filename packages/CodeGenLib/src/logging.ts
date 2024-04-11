import { configInfo, currentWorkingDirectory } from "./config";
import { LogError, LogStatus } from '@memberjunction/core'
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
   public logError(message: string, ...args: any[]) {
      this.logToConsole(message, true, ...args)
      this.logToFile(message, true, ...args)
   }
   
   /**
    * Logs a status message to the console and to the log file if configured
    * @param message 
    * @param args 
    */
   public logStatus(message: string, ...args: any[]) {
      this.logToConsole(message, false, ...args)
      this.logToFile(message, false, ...args)
   }
   
   protected logToConsole(message: string, isError: boolean, ...args: any[]) {
      if (configInfo.logging.console) {
         if (isError)
            LogError(message, null, ...args)
         else
            LogStatus(message, null, ...args)
      }
   }
   protected logToFile(message, isError: boolean, ...args: any[]) {
      if (configInfo.logging.log) {
         if (configInfo.logging.logFile === null || configInfo.logging.logFile === undefined || configInfo.logging.logFile === '') 
            LogError('ERROR: No log file specified in config.json', null, ...args)
         else  {
            const file: string = path.join(currentWorkingDirectory, configInfo.logging.logFile)
            if (isError)
               LogError(message, file, ...args)
            else
               LogStatus(message, file, ...args)
         }
      }
   }
}


// use the class below so that it is easier for external code to sub-class the logger if desired
const _logger: LoggerBase = MJGlobal.Instance.ClassFactory.CreateInstance<LoggerBase>(LoggerBase);
export function logError(message: string, ...args: any[]) {
   return _logger.logError(message, ...args);
}

export function logStatus(message: string, ...args: any[]) {
   return _logger.logStatus(message, ...args);
}