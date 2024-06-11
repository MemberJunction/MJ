
import { dbDatabase, dbHost, dbPassword, dbPort, dbUsername } from '../config';
import { DataSource } from 'typeorm';
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
  requestTimeout: 45000
};

const AppDataSource = new DataSource(orm)

export default AppDataSource;