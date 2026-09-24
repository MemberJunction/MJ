import mssql from 'mssql';
import { DbDatabase, DbHost, DbPassword, DbPort, DbUsername } from '../config';

const config = {
  user: DbUsername,
  password: DbPassword,
  server: DbHost,
  port: DbPort,
  database: DbDatabase,
  options: {
    encrypt: true,
  },
};

const SQLConnectionPool = new mssql.ConnectionPool(config);

export default SQLConnectionPool;
