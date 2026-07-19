/**
 * SQL Server connection pool for the worker (mirrors ScheduledActionsServer/db.ts).
 * A generous requestTimeout because a sync run can be long-lived.
 */
import sql from 'mssql';
import { dbDatabase, dbEncrypt, dbHost, dbPassword, dbPort, dbTrustServerCertificate, dbUsername } from './config.js';

const config: sql.config = {
    server: dbHost,
    port: dbPort,
    user: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    requestTimeout: 300000, // 5 min — a sync batch can run long
    options: {
        encrypt: dbEncrypt,
        enableArithAbort: true,
        trustServerCertificate: dbTrustServerCertificate,
    },
};

const pool = new sql.ConnectionPool(config);

export default pool;
