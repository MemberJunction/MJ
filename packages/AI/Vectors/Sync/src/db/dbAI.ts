
import { DbDatabase, DbHost, DbPassword, DbPort, DbUsername } from '../config';
import sql from 'mssql';

const config: sql.config = {
  server: DbHost,
  port: DbPort,
  user: DbUsername,
  password: DbPassword,
  database: DbDatabase,
  requestTimeout: 45000,
  options: {
    encrypt: true,
    enableArithAbort: true,
    trustServerCertificate: true
  }
};

const pool = new sql.ConnectionPool(config);

export default pool;