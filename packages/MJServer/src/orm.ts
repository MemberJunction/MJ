import sql from 'mssql';
import { configInfo, dbDatabase, dbHost, dbPassword, dbPort, dbUsername, dbInstanceName, dbTrustServerCertificate } from './config.js';

const createMSSQLConfig = (): sql.config => {
  const mssqlConfig: sql.config = {
    server: dbHost,
    port: dbPort,
    user: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    requestTimeout: configInfo.databaseSettings.requestTimeout,
    connectionTimeout: configInfo.databaseSettings.connectionTimeout,
    options: {
      encrypt: true, // Use encryption
      enableArithAbort: true,
    },
  };
  
  if (dbInstanceName !== null && dbInstanceName !== undefined && dbInstanceName.trim().length > 0) {
    mssqlConfig.options = {
      ...mssqlConfig.options,
      instanceName: dbInstanceName,
    };
  }
  
  if (dbTrustServerCertificate !== null && dbTrustServerCertificate !== undefined) {
    mssqlConfig.options = {
      ...mssqlConfig.options,
      trustServerCertificate: dbTrustServerCertificate === 'Y',
    };
  }

  //console.log({ mssqlConfig: { ...mssqlConfig, password: '***' } });
  return mssqlConfig;
};

export default createMSSQLConfig;
