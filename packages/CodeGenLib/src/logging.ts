import { configInfo, currentWorkingDirectory } from "./config";
import { LogError, LogStatus } from '@memberjunction/core'
import path from 'path';

export function logError(message: string, ...args: any[]) {
   logToConsole(message, true, ...args)
   logToFile(message, true, ...args)
}

export function logStatus(message: string, ...args: any[]) {
   logToConsole(message, false, ...args)
   logToFile(message, false, ...args)
}

function logToConsole(message: string, isError: boolean, ...args: any[]) {
   if (configInfo.logging.console) {
      if (isError)
         LogError(message, null, ...args)
      else
         LogStatus(message, null, ...args)
   }
}
function logToFile(message, isError: boolean, ...args: any[]) {
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