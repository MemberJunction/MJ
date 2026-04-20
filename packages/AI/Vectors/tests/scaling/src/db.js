import sql from 'mssql';
import { dbDatabase, dbHost, dbPassword, dbPort, dbUsername } from './config.js';

const config = {
    server: dbHost,
    port: dbPort,
    user: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    requestTimeout: 120000, // long timeout for code gen, some queries are long at times...
    options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: true
    }
};

export const pool = new sql.ConnectionPool(config);
