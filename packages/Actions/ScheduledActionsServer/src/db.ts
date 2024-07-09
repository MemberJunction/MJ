//import * as mssql from "mssql";
import { dbDatabase, dbHost, dbPassword, dbPort, dbUsername } from './config';
import { DataSource } from "typeorm"
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions';


const orm: SqlServerConnectionOptions = {
    type: 'mssql',
    logging: false,
    host: dbHost,
    port: dbPort,
    username: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    synchronize: false,
    requestTimeout: 300000 // some things run a long time, so we need to set this to a high value, this is a total time in seconds of 300,000 milliseconds or 5 minutes
  };

const AppDataSource = new DataSource(orm)
  
export default AppDataSource;