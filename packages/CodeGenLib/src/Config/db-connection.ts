//import * as mssql from "mssql";
import { dbDatabase, dbHost, dbPassword, dbPort, dbUsername, dbInstanceName, dbTrustServerCertificate } from './config';
import { DataSource } from "typeorm"
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions';


const ormConfig: SqlServerConnectionOptions = {
    type: 'mssql',
    logging: false,
    host: dbHost,
    port: dbPort,
    username: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    synchronize: false,
    requestTimeout: 120000, // long timeout for code gen, some queries are long at times...
    options: {
      instanceName: dbInstanceName && dbInstanceName.trim().length > 0 ? dbInstanceName : undefined,
      trustServerCertificate: dbTrustServerCertificate !== null && dbTrustServerCertificate !== undefined ? dbTrustServerCertificate : undefined
    }
  };


const AppDataSource = new DataSource(ormConfig)
  
export default AppDataSource;