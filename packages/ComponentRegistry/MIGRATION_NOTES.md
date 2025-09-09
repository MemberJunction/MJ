# Component Registry Database Setup Migration

## Overview
The Component Registry Server database setup has been updated to match MJServer's initialization pattern for consistency and improved functionality.

## Changes Made

### 1. Created `orm.ts` File
- New file that matches MJServer's pattern
- Centralized SQL configuration creation
- Includes connection pool settings with proper defaults
- Handles instance names and certificate trust settings

### 2. Updated Database Configuration (`config.ts`)
- Added `metadataCacheRefreshInterval` setting
- Added connection pool configuration:
  - `max`: Maximum connections (default: 50)
  - `min`: Minimum connections (default: 5)
  - `idleTimeoutMillis`: Idle timeout (default: 30000ms)
  - `acquireTimeoutMillis`: Acquire timeout (default: 30000ms)
- Properly exports read-only database credentials

### 3. Enhanced `Server.ts` Database Setup
- Now uses `createMSSQLConfig()` function from orm.ts
- Passes cache refresh interval to SQLServerProviderConfigData (3rd parameter)
- Initializes Metadata after setup and logs entity count
- Supports read-only connection pools when credentials are provided
- Maintains DataSourceInfo array for tracking all connections

### 4. Added `types.ts` File
- Defines `DataSourceInfo` class for tracking database connections
- Matches MJServer's type definitions exactly

## Key Improvements

1. **Connection Pooling**: Proper pool configuration with min/max connections and timeouts
2. **Metadata Caching**: Support for configurable cache refresh intervals
3. **Read-Only Connections**: Automatic setup of read-only pools when credentials provided
4. **Better Logging**: Shows entity count after initialization
5. **Type Safety**: Proper TypeScript types for all configurations

## Configuration Example

Update your `mj.config.cjs` to include the new settings:

```javascript
module.exports = {
  databaseSettings: {
    connectionTimeout: 15000,
    requestTimeout: 15000,
    metadataCacheRefreshInterval: 60000, // Refresh cache every 60 seconds
    connectionPool: {
      max: 50,              // Maximum connections
      min: 5,               // Minimum connections
      idleTimeoutMillis: 30000,    // Idle timeout in ms
      acquireTimeoutMillis: 30000  // Acquire timeout in ms
    },
    dbReadOnlyUsername: 'readonly_user',  // Optional
    dbReadOnlyPassword: 'readonly_pass'   // Optional
  },
  // ... rest of config
};
```

## Benefits

- **Consistency**: Database setup now matches MJServer exactly
- **Performance**: Proper connection pooling improves database performance
- **Reliability**: Better error handling and connection management
- **Scalability**: Support for read-only replicas reduces load on primary database
- **Maintainability**: Code patterns match across all MJ packages

## Migration Steps

1. Update your `mj.config.cjs` with the new database settings
2. Rebuild the package: `npm run build`
3. Restart your Component Registry Server
4. Verify in logs that entities are loaded and connection pools are initialized

## Backward Compatibility

All changes are backward compatible. If new settings are not provided, sensible defaults are used:
- Cache refresh interval: 0 (no automatic refresh)
- Connection pool max: 50
- Connection pool min: 5
- Timeouts: 30000ms
- Read-only connection: Only created if credentials provided