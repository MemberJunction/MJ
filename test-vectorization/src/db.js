import { DataSource } from 'typeorm';
import { dbDatabase, dbHost, dbPassword, dbPort, dbUsername } from './config.js';

export const AppDataSource = new DataSource({
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
    trustServerCertificate: true,
  },
});
