import sql from "mssql";
import { dbDatabase, dbHost, dbPassword, dbPort, dbUsername } from './config';

const config: sql.config = {
    server: dbHost,
    port: dbPort,
    user: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    requestTimeout: 300000, // some things run a long time, so we need to set this to a high value, this is 300,000 milliseconds or 5 minutes
    options: {
        encrypt: true, // Use encryption
        enableArithAbort: true,
        trustServerCertificate: true // For development/testing
    },
};

const pool = new sql.ConnectionPool(config);

export default pool;