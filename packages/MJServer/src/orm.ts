import { DataSourceOptions } from 'typeorm';
import { configInfo, dbDatabase, dbHost, dbPassword, dbPort, dbUsername, dbInstanceName, dbTrustServerCertificate } from './config.js';

const orm = (entities: Array<string>): DataSourceOptions => {
  const ormConfig = {
    type: 'mssql' as const,
    entities,
    logging: false,
    host: dbHost,
    port: dbPort,
    username: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    synchronize: false,
    requestTimeout: configInfo.databaseSettings.requestTimeout,
    connectionTimeout: configInfo.databaseSettings.connectionTimeout,
    options: {},
  };
  if (dbInstanceName !== null && dbInstanceName !== undefined && dbInstanceName.trim().length > 0) {
    ormConfig.options = {
      ...ormConfig.options,
      instanceName: dbInstanceName,
    };
  }
  if (dbTrustServerCertificate !== null && dbTrustServerCertificate !== undefined) {
    ormConfig.options = {
      ...ormConfig.options,
      trustServerCertificate: dbTrustServerCertificate,
    };
  }

  //console.log({ ormConfig: { ...ormConfig, password: '***' } });
  return ormConfig;
};

export default orm;
