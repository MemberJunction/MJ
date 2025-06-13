import * as mssql from 'mssql';
import { configInfo } from './config';

const { dbDatabase, dbHost, codeGenPassword, dbPort, codeGenLogin, dbInstanceName, dbTrustServerCertificate } = configInfo;

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
    trustServerCertificate: dbTrustServerCertificate === 'Y',
  },
};

let _pool: mssql.ConnectionPool;
export async function MSSQLConnection(): Promise<mssql.ConnectionPool> {
  if (!_pool) {
    _pool = await mssql.connect(sqlConfig);
  }
  return _pool;
}
