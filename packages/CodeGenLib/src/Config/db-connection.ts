import * as mssql from 'mssql';
import { configInfo } from './config';
import { DataSource } from 'typeorm';
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions';
import { logStatus, logError } from '../Misc/status_logging';

// Configuration parameters
const { 
  dbDatabase, 
  dbHost, 
  codeGenPassword, 
  dbPort, 
  codeGenLogin, 
  dbInstanceName, 
  dbTrustServerCertificate 
} = configInfo;

// Connection pool configuration
const DEFAULT_POOL_MIN = 1;
const DEFAULT_POOL_MAX = 10;
const TIMEOUT_MS = 120000; // 2 minutes - long timeout for code gen operations
const CONNECTION_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * TypeORM SQL Server configuration 
 */
const ormConfig: SqlServerConnectionOptions = {
  type: 'mssql',
  logging: false,
  host: dbHost,
  port: dbPort,
  username: codeGenLogin,
  password: codeGenPassword,
  database: dbDatabase,
  synchronize: false,
  requestTimeout: TIMEOUT_MS,
  
  // Connection pooling options for better performance
  extra: {
    connectionTimeout: TIMEOUT_MS,
    pool: {
      min: DEFAULT_POOL_MIN,
      max: DEFAULT_POOL_MAX,
      idleTimeoutMillis: 30000
    }
  },
  options: {
    instanceName: dbInstanceName && dbInstanceName.trim().length > 0 ? dbInstanceName : undefined,
    trustServerCertificate: dbTrustServerCertificate === 'Y',
    enableArithAbort: true, // Improves performance with SQL Server
    encrypt: true
  },
};

/**
 * MSSQL native client configuration
 */
export const sqlConfig: mssql.config = {
  user: codeGenLogin,
  password: codeGenPassword,
  server: dbHost,
  database: dbDatabase,
  port: dbPort,
  pool: {
    min: DEFAULT_POOL_MIN,
    max: DEFAULT_POOL_MAX,
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    acquireTimeoutMillis: TIMEOUT_MS // How long to try to get a connection
  },
  options: {
    requestTimeout: TIMEOUT_MS,
    encrypt: true,
    instanceName: dbInstanceName && dbInstanceName.trim().length > 0 ? dbInstanceName : undefined,
    trustServerCertificate: dbTrustServerCertificate === 'Y',
    enableArithAbort: true // Improves performance with SQL Server
  },
};

// Connection pool singleton
let _pool: mssql.ConnectionPool;
let _poolConnectionPromise: Promise<mssql.ConnectionPool> | null = null;
let _isPoolHealthy = true;
let _checkIntervalId: NodeJS.Timeout | null = null;

/**
 * Get a connection from the SQL Server connection pool.
 * - Creates the pool if it doesn't exist
 * - Handles reconnection if the pool is in an error state
 * - Implements connection monitoring for better stability
 * 
 * @returns Promise resolving to a connection pool
 */
export async function MSSQLConnection(): Promise<mssql.ConnectionPool> {
  // If we already have an active connection request, return that
  if (_poolConnectionPromise) {
    return _poolConnectionPromise;
  }
  
  // If pool exists but is unhealthy, close it and create a new one
  if (_pool && !_isPoolHealthy) {
    try {
      await _pool.close();
      _pool = undefined;
      _isPoolHealthy = true;
      logStatus("Database connection pool has been reset after an error");
    } catch (closeErr) {
      logError(`Error closing unhealthy connection pool: ${closeErr}`);
    }
  }

  // If pool doesn't exist, create a new one
  if (!_pool) {
    try {
      _poolConnectionPromise = mssql.connect(sqlConfig)
        .then(pool => {
          // Setup pool error handling for better stability
          pool.on('error', err => {
            logError(`Database pool error: ${err}`);
            _isPoolHealthy = false;
          });
          
          // Schedule pool health checks if not already running
          if (!_checkIntervalId) {
            _checkIntervalId = setInterval(async () => {
              try {
                if (_pool) {
                  // Simple query to check connection
                  await _pool.request().query('SELECT 1');
                  _isPoolHealthy = true;
                }
              } catch (err) {
                logError(`Database health check failed: ${err}`);
                _isPoolHealthy = false;
              }
            }, CONNECTION_CHECK_INTERVAL);
            
            // Ensure interval is cleared on process exit
            process.on('exit', () => {
              if (_checkIntervalId) {
                clearInterval(_checkIntervalId);
              }
            });
          }
          
          _pool = pool;
          return pool;
        })
        .catch(err => {
          logError(`Failed to create connection pool: ${err}`);
          _isPoolHealthy = false;
          throw err;
        })
        .finally(() => {
          _poolConnectionPromise = null;
        });
      
      return _poolConnectionPromise;
    } catch (err) {
      logError(`Error connecting to database: ${err}`);
      throw err;
    }
  }
  
  return _pool;
}

/**
 * Close the connection pool when it's no longer needed
 */
export async function closeMSSQLConnection(): Promise<void> {
  try {
    if (_checkIntervalId) {
      clearInterval(_checkIntervalId);
      _checkIntervalId = null;
    }
    
    if (_pool) {
      await _pool.close();
      _pool = undefined;
      _isPoolHealthy = true;
      logStatus("Database connection pool closed successfully");
    }
  } catch (err) {
    logError(`Error closing connection pool: ${err}`);
    throw err;
  }
}

// Create the TypeORM DataSource instance
const AppDataSource = new DataSource(ormConfig);

export default AppDataSource;
