import * as mssql from 'mssql';
import { configInfo } from './config';
import { DataSource } from 'typeorm';
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions';

const { dbDatabase, dbHost, codeGenPassword, dbPort, codeGenLogin, dbInstanceName, dbTrustServerCertificate } = configInfo;

const ormConfig: SqlServerConnectionOptions = {
  type: 'mssql',
  logging: false,
  host: dbHost,
  port: dbPort,
  username: codeGenLogin,
  password: codeGenPassword,
  database: dbDatabase,
  synchronize: false,
  requestTimeout: 120000, // long timeout for code gen, some queries are long at times...
  options: {
    instanceName: dbInstanceName && dbInstanceName.trim().length > 0 ? dbInstanceName : undefined,
    trustServerCertificate:
      dbTrustServerCertificate !== null && dbTrustServerCertificate !== undefined ? dbTrustServerCertificate : undefined,
  },
};

export const sqlConfig: mssql.config = {
  user: codeGenLogin,
  password: codeGenPassword,
  server: dbHost,
  database: dbDatabase,
  port: dbPort,
  options: {
    requestTimeout: 120000, // long timeout for code gen, some queries are long at times...
    encrypt: true,
    instanceName: dbInstanceName && dbInstanceName.trim().length > 0 ? dbInstanceName : undefined,
    trustServerCertificate:
      dbTrustServerCertificate !== null && dbTrustServerCertificate !== undefined ? dbTrustServerCertificate : undefined,
  },
};

let _pool: mssql.ConnectionPool;
export async function MSSQLConnection(): Promise<mssql.ConnectionPool> {
  if (!_pool) {
    _pool = await mssql.connect(sqlConfig);
  }
  return _pool;
}

const AppDataSource = new DataSource(ormConfig);

export default AppDataSource;
