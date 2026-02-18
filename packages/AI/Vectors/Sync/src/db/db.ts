import mssql from 'mssql';
import { dbDatabase, dbHost, dbPassword, dbPort, dbUsername } from '../config';

const config = {
  user: dbUsername,
  password: dbPassword,
  server: dbHost,
  port: dbPort,
  database: dbDatabase,
  options: {
    encrypt: true,
  },
};

const SQLConnectionPool = new mssql.ConnectionPool(config);

export default SQLConnectionPool;
