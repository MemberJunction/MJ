import { DataSource } from "typeorm";
import { configInfo, mj_core_schema, SQLOutputConfig } from "../Config/config";
import { logError, logStatus } from "./status_logging";
import * as fs from 'fs';
import path from 'path';

export class SQLLogging {
    private static _SQLLoggingFilePath: string = '';
 
    protected static get SQLLoggingFilePath(): string {
        return SQLLogging._SQLLoggingFilePath;   
    }
    public static initSQLLogging() {
        if (!SQLLogging.SQLLoggingFilePath) {
            // not already set up, so proceed, otherwise we do nothing as we're already good to go
            const config = configInfo.SQLOutput;
            if(!config){
                logError("MetadataLoggingConfig is required to enable metadata logging");
                return;
            }
    
            if (!config.enabled)
                return; // we are not doing anything here.... 
    
            if (config.folderPath) {
                const dirExists: boolean = fs.existsSync(config.folderPath);
                if (!dirExists) {
                    fs.mkdirSync(config.folderPath, {recursive: true });
                }
        
                const fileName: string = config.fileName || this.createFileName();
                SQLLogging._SQLLoggingFilePath = path.join(config.folderPath,fileName);
        
                if (!config.appendToFile || !fs.existsSync(SQLLogging.SQLLoggingFilePath)) {
                    //create an empty file
                    fs.writeFileSync(SQLLogging.SQLLoggingFilePath, '');
                }
        
                logStatus(`Metadata logging enabled. File path: ${SQLLogging.SQLLoggingFilePath}`);
            }
            else {
                logError("folderPath is required to enable metadata logging");
                return;
            }
        }
     }

     public static finishSQLLogging() {
        if (SQLLogging.SQLLoggingFilePath) {
            if(configInfo.SQLOutput.convertCoreSchemaToFlywaySchema){
                SQLLogging.convertSQLLogToFlywaySchema();
            }
        }
     }
  
     protected static createFileName(): string {
        const date = new Date();
  
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-based
        const day = String(date.getUTCDate()).padStart(2, '0');
  
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(date.getUTCMinutes()).padStart(2, '0');
        const second = String(date.getUTCSeconds()).padStart(2, '0');
              
        const fileName = `CodeGen_Run_${year}-${month}-${day}_${hour}-${minute}-${second}.sql`;
        return fileName;
    }
  
    public static async appendToSQLLogFile(contents: string, description?: string): Promise<void> {
        try{
           if(!contents || !this.SQLLoggingFilePath){
              return;
           }
  
           if(description){
              const comment = `/* ${description} */\n`;
              contents = `${comment}${contents}`;
           }
  
           contents = `${contents}\n\n`;
  
           fs.appendFileSync(this.SQLLoggingFilePath, contents);
        }
        catch(ex){
           logError("Unable to log metadata SQL text to file", ex);
        }
    }

    /**
    * Executes the given SQL query using the given DataSource object.
    * If the appendToLogFile parameter is true, the query will also be appended to the log file. 
    * Note that in order to append to the log file, ManageMetadataBase.manageMetaDataLogging must be called first.
    * @param ds - The DataSource object to use to execute the query. 
    * @param query - The SQL query to execute.
    * @param description - A description of the query to append to the log file.
    * @returns - The result of the query execution.
    */
    public static async LogSQLAndExecute(ds: DataSource, query: string, description?: string): Promise<any> {
        SQLLogging.appendToSQLLogFile(query, description);
        return ds.query(query);
    }

  
    protected static convertSQLLogToFlywaySchema(): void {
        if(!this.SQLLoggingFilePath){
           return;
        }
  
        const coreSchema: string = mj_core_schema();
        const regex: RegExp = new RegExp(coreSchema, 'g');
  
        const data: string = fs.readFileSync(`${this.SQLLoggingFilePath}`, 'utf-8');
        const replacedData: string = data.replace(regex, "${flyway:defaultSchema}");
  
        fs.writeFileSync(`${this.SQLLoggingFilePath}`, replacedData);
        logStatus(`Replaced all instances of ${coreSchema} with \${flyway:defaultSchema} in the metadata log file`);
     }
}