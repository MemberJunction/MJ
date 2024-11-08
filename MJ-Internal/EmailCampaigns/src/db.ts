import { DataSource } from 'typeorm';
import * as Config from './Config';

export const AppDataSource = new DataSource({
  type: 'mssql',
  logging: false,
  host: Config.dbHost,
  port: Config.dbPort,
  username: Config.dbUsername,
  password: Config.dbPassword,
  database: Config.dbDatabase,
  synchronize: false,
  requestTimeout: Config.dbRequestTimeout, // long timeout for code gen, some queries are long at times...
  options: {
    trustServerCertificate: Config.dbTrustServerCertificate,
  },
});
