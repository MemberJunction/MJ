
import { dbDatabase, dbHost, dbPassword, dbPort, dbUsername } from '../config';
import sql from 'mssql';

const config: sql.config = {
  server: dbHost,
  port: dbPort,
  user: dbUsername,
  password: dbPassword,
  database: dbDatabase,
  requestTimeout: 45000,
  options: {
    encrypt: true,
    enableArithAbort: true,
    trustServerCertificate: true
  }
};

const pool = new sql.ConnectionPool(config);

export default pool;